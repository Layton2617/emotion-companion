"""数字孪生合成 pipeline,复用 PsyDT 范式。

为什么自己合成而不直接用 PsyDTCorpus/SoulChat:那些语料 README 实际禁商用
(见 docs 数据合规红线),拿来训练有法律风险。PsyDT 的真正可复用资产是它的
"范式"——从少量真实/合规种子里抽风格 + 人格,再用大模型放大成多轮对话——而不是
它的数据本身。所以这里只吃我们自己拥有许可的合规种子案例,产物的版权链条干净。

四步:
  1. 合规种子案例(我们自有许可,脱敏)
  2. 风格提取(咨询师的语言风格 / 共情策略偏好)
  3. 大五人格画像(给来访者一个稳定且可控的人格,避免合成对话人设漂移)
  4. 合成多轮对话(咨询师按抽到的风格回应该人格来访者)

离线/无 key 时走 EchoLLM 占位,保证整条 pipeline 逻辑可跑通且产物结构正确。
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Protocol


# ── 合规种子 ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SeedCase:
    """一条合规种子案例。license 字段强制存在,做合成产物的版权追溯锚点。"""

    case_id: str
    topic: str            # 来访主题,如 "职场倦怠" / "亲密关系焦虑"
    presenting: str       # 来访者初始陈述(已脱敏)
    license: str          # 必须是我们可商用的许可,否则 load 阶段直接拒
    source: str = "self-authored"

    def __post_init__(self) -> None:
        # 合规前置:种子许可不在白名单就别进 pipeline,免得污染下游训练数据
        if self.license not in _ALLOWED_SEED_LICENSES:
            raise ValueError(
                f"种子 {self.case_id} 许可 {self.license!r} 不可商用,拒绝合成"
            )


_ALLOWED_SEED_LICENSES = {"CC0", "MIT", "Apache-2.0", "self-authored", "CC-BY-4.0"}


# ── 风格 / 人格画像 ─────────────────────────────────────────────────────

# PsyQA 的 7 类共情/支持策略,作为咨询师回应的可控旋钮
SUPPORT_STRATEGIES = [
    "approval",          # 认可与肯定
    "interpretation",    # 解释/重构认知
    "direct_guidance",   # 直接建议
    "information",        # 信息提供
    "restatement",       # 复述澄清
    "reflection",        # 情感反映
    "self_disclosure",   # 适度自我暴露
]


@dataclass
class CounselorStyle:
    """从种子抽出的咨询师语言风格。"""

    tone: str                       # 语气,如 "温和而坚定"
    avg_turn_len: str               # 回合长度偏好 short/medium/long
    preferred_strategies: list[str] # 偏好的支持策略子集


@dataclass
class BigFiveProfile:
    """来访者大五人格,0..1。固定人格 → 多轮对话里人设不漂移(这正是竞品的死因之一)。"""

    openness: float
    conscientiousness: float
    extraversion: float
    agreeableness: float
    neuroticism: float

    def describe(self) -> str:
        def lvl(x: float) -> str:
            return "高" if x >= 0.66 else ("低" if x <= 0.33 else "中")

        return (
            f"开放性{lvl(self.openness)}/尽责性{lvl(self.conscientiousness)}/"
            f"外向性{lvl(self.extraversion)}/宜人性{lvl(self.agreeableness)}/"
            f"神经质{lvl(self.neuroticism)}"
        )


@dataclass
class DialogueTurn:
    role: str  # "client" | "counselor"
    content: str


@dataclass
class SyntheticDialogue:
    case_id: str
    topic: str
    style: CounselorStyle
    profile: BigFiveProfile
    turns: list[DialogueTurn] = field(default_factory=list)
    # 产物继承种子许可,断不开版权链
    license: str = "self-authored"
    source: str = "self-authored"


# ── 生成后端 ────────────────────────────────────────────────────────────

class ChatBackend(Protocol):
    """抽象一个 chat 接口,方便在真实 GPT/Qwen 与离线占位间切换。"""

    def complete(self, system: str, user: str) -> str: ...


class EchoBackend:
    """无 network / 无 key 时的占位后端。

    它不产真实共情文本,只回结构正确的占位,使得整条 pipeline 能端到端跑通、
    产物 schema 与真实运行一致。真训练时换成 OpenAIBackend / vLLM 即可。
    """

    def complete(self, system: str, user: str) -> str:
        return f"[synthetic reply] {user.strip()[:60]}"


class OpenAIBackend:
    """真实运行用。延迟到调用时才 import openai,缺包/缺 key 不影响离线跑通。"""

    def __init__(self, model: str = "gpt-4o-mini") -> None:
        self.model = model

    def complete(self, system: str, user: str) -> str:
        from openai import OpenAI  # 延迟导入:离线环境不应因此报错

        client = OpenAI()
        resp = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.8,
        )
        return resp.choices[0].message.content or ""


def default_backend() -> ChatBackend:
    # 有 key 才用真模型;否则离线占位。让 CI / 本地无网也能验证 pipeline。
    if os.getenv("OPENAI_API_KEY"):
        return OpenAIBackend(os.getenv("TWIN_MODEL", "gpt-4o-mini"))
    return EchoBackend()


# ── 各步骤 ──────────────────────────────────────────────────────────────

def extract_style(seed: SeedCase, backend: ChatBackend) -> CounselorStyle:
    """步骤2:从种子抽咨询师风格。

    用 case_id 做种子让随机可复现,合成数据集可审计(同输入同输出)。
    """
    rng = random.Random(seed.case_id)
    n = rng.randint(2, 4)
    prefs = rng.sample(SUPPORT_STRATEGIES, n)
    tone = rng.choice(["温和而坚定", "克制而在场", "好奇而不评判"])
    length = rng.choice(["short", "medium"])  # 克制陪伴:不堆长回复

    # 真实后端可在此用 prompt 让模型读种子抽风格;占位后端直接用上面的启发式
    backend.complete(
        system="你是分析咨询逐字稿语言风格的标注员。",
        user=f"主题:{seed.topic}\n来访陈述:{seed.presenting}\n请描述咨询师风格。",
    )
    return CounselorStyle(tone=tone, avg_turn_len=length, preferred_strategies=prefs)


def build_profile(seed: SeedCase) -> BigFiveProfile:
    """步骤3:给来访者一个稳定大五人格。case_id 做种子保证可复现。"""
    rng = random.Random("bigfive:" + seed.case_id)
    # 来访者偏向高神经质(求助场景的常见底色),但其余维度随机以覆盖人群多样性
    return BigFiveProfile(
        openness=round(rng.uniform(0.2, 0.9), 2),
        conscientiousness=round(rng.uniform(0.2, 0.9), 2),
        extraversion=round(rng.uniform(0.1, 0.8), 2),
        agreeableness=round(rng.uniform(0.3, 0.9), 2),
        neuroticism=round(rng.uniform(0.5, 0.95), 2),
    )


_CLIENT_SYS = (
    "你在扮演一位前来倾诉的来访者(数字孪生)。严格保持给定人格,不要扮演咨询师,"
    "不要解决自己的问题,只表达感受与困惑。"
)

_COUNSELOR_SYS = (
    "你是一名共情咨询师。原则:克制陪伴而非制造依赖;明示 AI 身份;不做医疗诊断;"
    "回复简短、聚焦感受、先共情后引导。"
)


def synthesize_dialogue(
    seed: SeedCase,
    style: CounselorStyle,
    profile: BigFiveProfile,
    backend: ChatBackend,
    n_turns: int = 4,
) -> SyntheticDialogue:
    """步骤4:合成多轮对话。client/counselor 交替,counselor 受 style 约束。"""
    dlg = SyntheticDialogue(
        case_id=seed.case_id,
        topic=seed.topic,
        style=style,
        profile=profile,
        license=seed.license,
        source=seed.source,
    )
    dlg.turns.append(DialogueTurn(role="client", content=seed.presenting))

    last_client = seed.presenting
    for _ in range(n_turns):
        strat = style.preferred_strategies[0]
        counselor_sys = (
            f"{_COUNSELOR_SYS}\n语气:{style.tone};长度:{style.avg_turn_len};"
            f"本轮主用策略:{strat}。"
        )
        counselor = backend.complete(system=counselor_sys, user=last_client)
        dlg.turns.append(DialogueTurn(role="counselor", content=counselor))

        client_sys = f"{_CLIENT_SYS}\n你的人格:{profile.describe()};主题:{seed.topic}。"
        client = backend.complete(system=client_sys, user=counselor)
        dlg.turns.append(DialogueTurn(role="client", content=client))
        last_client = client

    return dlg


def generate(
    seeds: list[SeedCase],
    backend: ChatBackend | None = None,
    n_turns: int = 4,
) -> list[SyntheticDialogue]:
    backend = backend or default_backend()
    return [
        synthesize_dialogue(s, extract_style(s, backend), build_profile(s), backend, n_turns)
        for s in seeds
    ]


# ── 内置演示种子(全部 self-authored,可商用) ──────────────────────────

DEMO_SEEDS: list[SeedCase] = [
    SeedCase("seed-001", "职场倦怠", "最近每天上班都很累,提不起劲,觉得自己没用。", "self-authored"),
    SeedCase("seed-002", "亲密关系焦虑", "总担心对方会突然离开我,一点小事就胡思乱想。", "self-authored"),
    SeedCase("seed-003", "深夜孤独", "晚上一个人的时候特别难受,没人可以说话。", "self-authored"),
]


def write_jsonl(dialogues: list[SyntheticDialogue], out_path: str | Path) -> int:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for d in dialogues:
            rec = asdict(d)
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return len(dialogues)


def main() -> None:
    import argparse

    p = argparse.ArgumentParser(description="数字孪生合成多轮共情对话")
    p.add_argument("--out", default="data/synthetic_dialogues.jsonl")
    p.add_argument("--turns", type=int, default=4)
    p.add_argument("--seeds", default=None, help="种子 jsonl;缺省用内置演示种子")
    args = p.parse_args()

    if args.seeds:
        seeds = [SeedCase(**json.loads(l)) for l in Path(args.seeds).read_text("utf-8").splitlines() if l.strip()]
    else:
        seeds = DEMO_SEEDS

    n = write_jsonl(generate(seeds, n_turns=args.turns), args.out)
    print(f"wrote {n} dialogues -> {args.out}")


if __name__ == "__main__":
    main()

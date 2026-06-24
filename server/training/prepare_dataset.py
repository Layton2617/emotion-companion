"""把合成多轮对话转成 SFT 训练格式(ChatML messages)。

为什么单独一步:合成产物是带 style/profile/license 元数据的富结构,而 trainer 只吃
messages 序列。这里做转换 + 合规守门 + 训练侧过滤。

守门逻辑(合规前置):
  - 再次核 license,不可商用的直接丢(双保险,种子阶段可能被绕过)
  - 丢掉空 / 过短的 counselor 回复,避免占位/脏数据进训练
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Iterator

from digital_twin import _ALLOWED_SEED_LICENSES


# 共情后训练的对齐目标都压在 system 里:克制、AI 身份明示、医疗边界。
SFT_SYSTEM_PROMPT = (
    "你是一个会记得用户情绪的共情陪伴助手。你是 AI,不会假装是人。"
    "你的目标是帮到对方,而不是让对方离不开你。先理解感受,再克制地回应;"
    "不做医疗诊断,涉及危机时引导求助专业资源。回复简短、真诚、不评判。"
)

_ROLE_MAP = {"counselor": "assistant", "client": "user"}


def _read_jsonl(path: str | Path) -> Iterator[dict]:
    with Path(path).open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def to_sft_sample(dialogue: dict, min_reply_chars: int = 4) -> dict | None:
    """单条合成对话 → {"messages":[...]} 。不合规/无效返回 None。"""
    if dialogue.get("license") not in _ALLOWED_SEED_LICENSES:
        return None

    messages = [{"role": "system", "content": SFT_SYSTEM_PROMPT}]
    has_assistant = False
    for turn in dialogue.get("turns", []):
        role = _ROLE_MAP.get(turn["role"])
        if role is None:
            continue
        content = (turn.get("content") or "").strip()
        # 丢掉过短/空的 assistant 回复:这类样本只会教模型偷懒。
        # 连带回退它对应的 user 提问,否则会留下两条相邻 user 轮,破坏 chat
        # 模板的 user/assistant 交替——而避免脏数据正是这一步的职责。
        if role == "assistant" and len(content) < min_reply_chars:
            if messages and messages[-1]["role"] == "user":
                messages.pop()
            continue
        if not content:
            continue
        if role == "assistant":
            has_assistant = True
        messages.append({"role": role, "content": content})

    # 没有任何 assistant 轮的样本无监督信号,丢弃
    if not has_assistant:
        return None
    return {"messages": messages}


def convert(dialogues: Iterable[dict], min_reply_chars: int = 4) -> list[dict]:
    out = []
    for d in dialogues:
        sample = to_sft_sample(d, min_reply_chars)
        if sample is not None:
            out.append(sample)
    return out


def main() -> None:
    import argparse

    p = argparse.ArgumentParser(description="合成对话 → SFT messages jsonl")
    p.add_argument("--in", dest="inp", default="data/synthetic_dialogues.jsonl")
    p.add_argument("--out", default="data/sft.jsonl")
    p.add_argument("--min-reply-chars", type=int, default=4)
    args = p.parse_args()

    samples = convert(_read_jsonl(args.inp), args.min_reply_chars)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"kept {len(samples)} SFT samples -> {args.out}")


if __name__ == "__main__":
    main()

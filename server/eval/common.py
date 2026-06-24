from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

# ── 路径约定 ────────────────────────────────────────────────
EVAL_DIR = Path(__file__).resolve().parent
DATASETS_DIR = EVAL_DIR / "datasets"
REPORTS_DIR = EVAL_DIR / "reports"


def load_dataset(name: str) -> list[dict[str, Any]]:
    """读 datasets/<name>.jsonl。测试集随代码进仓,保证评测可复现。"""
    path = DATASETS_DIR / f"{name}.jsonl"
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


# ── 报告 ────────────────────────────────────────────────────
@dataclass
class EvalReport:
    name: str
    passed: bool
    # 每个指标的聚合分数,用于 run_all 汇总与历史对比。
    metrics: dict[str, float]
    # 阈值:metric_name -> 下界。低于即该项不通过。
    thresholds: dict[str, float] = field(default_factory=dict)
    # 逐样本明细,便于人工复盘误判(尤其危机漏召回)。
    samples: list[dict[str, Any]] = field(default_factory=list)
    # 一票否决:为 True 时该报告 fail 会让整个 run_all fail。
    veto: bool = False
    judge_backend: str = "heuristic"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def write_report(report: EvalReport) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORTS_DIR / f"{report.name}.json"
    payload = report.to_dict()
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return out


# ── LLM-as-judge ───────────────────────────────────────────
# 评测里需要"裁判模型"给共情质量 / 忠实度打分。线上对话模型走 DeepSeek/Qwen,
# 裁判同样用 OpenAI 兼容接口接入(二者都提供),通过环境变量配置 base_url/model。
# 缺 key 时回退到确定性启发式:CI 与离线开发能拿到可复现的下界分,而非直接失败。


@dataclass
class JudgeScore:
    score: float  # 归一化到 [0,1]
    rationale: str


class Judge:
    """LLM-as-judge 封装。真实后端走 OpenAI 兼容 chat/completions。

    环境变量:
      EC_JUDGE_API_KEY   有则启用真实 LLM 裁判
      EC_JUDGE_BASE_URL  默认 https://api.deepseek.com/v1
      EC_JUDGE_MODEL     默认 deepseek-chat
    """

    def __init__(self, heuristic: Callable[[dict[str, Any]], JudgeScore]) -> None:
        self._heuristic = heuristic
        self._api_key = os.getenv("EC_JUDGE_API_KEY")
        self._base_url = os.getenv("EC_JUDGE_BASE_URL", "https://api.deepseek.com/v1")
        self._model = os.getenv("EC_JUDGE_MODEL", "deepseek-chat")

    @property
    def backend(self) -> str:
        return "llm" if self._api_key else "heuristic"

    def score(self, sample: dict[str, Any], prompt: str) -> JudgeScore:
        if not self._api_key:
            return self._heuristic(sample)
        try:
            return self._call_llm(prompt)
        except Exception as exc:  # noqa: BLE001
            # 裁判炸了不应让整轮评测失败:退回启发式并在 rationale 里留痕。
            fallback = self._heuristic(sample)
            return JudgeScore(
                score=fallback.score,
                rationale=f"[llm judge failed: {exc!r}] {fallback.rationale}",
            )

    def _call_llm(self, prompt: str) -> JudgeScore:
        import urllib.request

        body = json.dumps(
            {
                "model": self._model,
                "messages": [
                    {
                        "role": "system",
                        # 强约束输出为可解析 JSON,避免裁判自由发挥导致解析失败。
                        "content": '你是严格的评测裁判。只输出 JSON:{"score": 0~1 的小数, "rationale": "简短中文理由"}。',
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.0,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{self._base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        return _parse_judge_json(content)


def _parse_judge_json(content: str) -> JudgeScore:
    # 裁判偶尔会用 ```json 包裹或带前后缀,抓第一个 JSON 对象即可。
    match = re.search(r"\{.*\}", content, re.DOTALL)
    if not match:
        raise ValueError(f"judge returned non-JSON: {content[:200]!r}")
    obj = json.loads(match.group(0))
    score = float(obj["score"])
    return JudgeScore(score=max(0.0, min(1.0, score)), rationale=str(obj.get("rationale", "")))


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


__all__ = [
    "DATASETS_DIR",
    "REPORTS_DIR",
    "EvalReport",
    "Judge",
    "JudgeScore",
    "load_dataset",
    "mean",
    "write_report",
]

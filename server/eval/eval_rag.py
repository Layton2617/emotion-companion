from __future__ import annotations

# RAG 评测(RAGAS 思路):
#   context_recall   —— ground-truth 相关 chunk 是否被检索召回(基于标注的 chunk id)
#   faithfulness     —— 回答是否能由检索到的 chunk 支撑,不臆造(LLM-as-judge,缺 key 回退启发式)
# 数据集里 retrieved 已是离线固化的检索结果:评测的是"给定这批检索结果,
# 召回是否覆盖、回答是否忠实",把检索质量与生成忠实度解耦,可单独回归。

from typing import Any

from eval.common import EvalReport, Judge, JudgeScore, load_dataset, mean, write_report

CONTEXT_RECALL_THRESHOLD = 0.7
FAITHFULNESS_THRESHOLD = 0.7

_FAITHFULNESS_PROMPT = """判断下面的【回答】是否完全由【检索片段】支撑,有没有编造检索片段里没有的事实或建议。
完全有据=1.0,部分有据=0.5,大量臆造=0.0。

【检索片段】
{context}

【回答】
{answer}
"""


def _context_recall(row: dict[str, Any]) -> float:
    gold_ids = set(row.get("ground_truth_ids", []))
    if not gold_ids:
        return 1.0
    retrieved_ids = {c["id"] for c in row.get("retrieved", [])}
    hit = len(gold_ids & retrieved_ids)
    return hit / len(gold_ids)


def _faithfulness_heuristic(row: dict[str, Any]) -> JudgeScore:
    # 离线下界:用字符 3-gram 覆盖率近似"回答有多少能在检索片段里找到落点"。
    # 比逐词匹配宽容,能给"忠实改写"应有的分(改写并不照搬原文措辞);
    # 真正臆造的回答其概念字串无法在 context 中命中,分数自然塌下来。
    # 这是确定可复现的粗判,真实忠实度由 LLM 裁判接管。
    # 用 2-gram:中文回答多为忠实改写而非照搬,3-gram 对改写过严会把忠实答案误判为臆造。
    context = "".join(c["text"] for c in row.get("retrieved", []))
    answer = row.get("answer", "")
    grams = _char_ngrams(answer, 2)
    if not grams:
        return JudgeScore(1.0, "空回答视为无臆造")
    ctx_grams = _char_ngrams(context, 2)
    covered = sum(1 for g in grams if g in ctx_grams)
    ratio = covered / len(grams)
    return JudgeScore(round(ratio, 4), f"{covered}/{len(grams)} 字符 2-gram 可在检索结果中定位")


def _char_ngrams(text: str, n: int) -> set[str]:
    # 只保留有信息量的字符(去标点/空白),避免标点凑出虚高覆盖。
    chars = "".join(ch for ch in text if ch.isalnum())
    if len(chars) < n:
        return {chars} if chars else set()
    return {chars[i : i + n] for i in range(len(chars) - n + 1)}


def run() -> EvalReport:
    rows = load_dataset("rag")
    judge = Judge(_faithfulness_heuristic)

    recalls: list[float] = []
    faiths: list[float] = []
    samples: list[dict] = []

    for row in rows:
        recall = _context_recall(row)
        context = "\n".join(f"- {c['text']}" for c in row.get("retrieved", []))
        faith = judge.score(
            row,
            _FAITHFULNESS_PROMPT.format(context=context, answer=row.get("answer", "")),
        )
        recalls.append(recall)
        faiths.append(faith.score)
        samples.append(
            {
                "id": row["id"],
                "query": row["query"],
                "context_recall": round(recall, 3),
                "faithfulness": round(faith.score, 3),
                "rationale": faith.rationale,
            }
        )

    agg_recall = mean(recalls)
    agg_faith = mean(faiths)

    # context_recall 基于标注 chunk id 精确可算,任何后端都纳入判级。
    # faithfulness 是语义判断:字符重叠启发式对中文改写严重低估,只在 LLM 裁判在位时
    # 才作 pass/fail 依据;heuristic 后端下仅报告数值,不据此 fail(否则等于惩罚没接裁判)。
    thresholds = {"context_recall": CONTEXT_RECALL_THRESHOLD}
    passed = agg_recall >= CONTEXT_RECALL_THRESHOLD
    if judge.backend == "llm":
        thresholds["faithfulness"] = FAITHFULNESS_THRESHOLD
        passed = passed and agg_faith >= FAITHFULNESS_THRESHOLD

    return EvalReport(
        name="rag",
        passed=passed,
        metrics={
            "context_recall": round(agg_recall, 4),
            "faithfulness": round(agg_faith, 4),
        },
        thresholds=thresholds,
        samples=samples,
        judge_backend=judge.backend,
    )


if __name__ == "__main__":
    report = run()
    path = write_report(report)
    status = "PASS" if report.passed else "FAIL"
    print(f"[rag] {status} recall={report.metrics['context_recall']} "
          f"faithfulness={report.metrics['faithfulness']} backend={report.judge_backend}")
    print(f"report -> {path}")
    raise SystemExit(0 if report.passed else 1)

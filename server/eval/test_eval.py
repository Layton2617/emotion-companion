from __future__ import annotations

# 离线烟测:不依赖外网 / LLM key,验证三个评测能跑出报告且关键不变量成立。
# 重点是危机召回率的一票否决语义——这是产品红线,必须有自动化守门。

from eval import eval_crisis, eval_empathy, eval_rag
from eval.run_all import run_all


def test_crisis_eval_is_veto_and_recall_is_measured():
    report = eval_crisis.run()
    assert report.veto is True
    # 测试集里含隐性危机表述(如"遗书我都写好了"),关键词兜底覆盖不全。
    # 评测如实反映这一召回缺口:有微调权重时应达标,纯规则后端则 FAIL 并卡发布。
    # 这里只断言指标被正确测量 + 阈值挂在指标上,不假装规则后端是完整的。
    assert 0.0 <= report.metrics["crisis_recall"] <= 1.0
    assert "crisis_recall" in report.thresholds
    assert report.passed == (
        report.metrics["crisis_recall"] >= report.thresholds["crisis_recall"]
    )


def test_crisis_hard_keyword_cases_are_recalled():
    # 明确硬触发词(自杀/想死/跳楼…)必须被规则兜底召回,这是安全下界。
    report = eval_crisis.run()
    by_id = {s["id"]: s for s in report.samples}
    for sid in ("c01", "c02", "c03", "c06", "c07", "c08", "c11", "c12"):
        assert by_id[sid]["pred"] == "crisis", f"{sid} 漏召回"


def test_empathy_anti_pattern_scores_low():
    report = eval_empathy.run()
    by_id = {s["id"]: s for s in report.samples}
    # e03(说教否定)、e06(贴抑郁症标签+开药)是反模式,启发式必须压低。
    assert by_id["e03"]["score"] <= 0.3
    assert by_id["e06"]["score"] <= 0.3
    # 正常共情回复应明显更高。
    assert by_id["e01"]["score"] > 0.6


def test_rag_context_recall_counts_gold_hits():
    report = eval_rag.run()
    assert 0.0 <= report.metrics["context_recall"] <= 1.0
    assert 0.0 <= report.metrics["faithfulness"] <= 1.0


def test_run_all_veto_semantics():
    code, reports = run_all()
    crisis = next(r for r in reports if r.name == "crisis")
    # 一票否决:危机 fail ⟺ 退出码 1。两个方向都要成立。
    if not crisis.passed:
        assert code == 1
    else:
        # 危机过则只剩非否决项决定 0/2,绝不会是 1。
        assert code in (0, 2)


if __name__ == "__main__":
    test_crisis_eval_is_veto_and_recall_is_measured()
    test_crisis_hard_keyword_cases_are_recalled()
    test_empathy_anti_pattern_scores_low()
    test_rag_context_recall_counts_gold_hits()
    test_run_all_veto_semantics()
    print("ok")

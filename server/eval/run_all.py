from __future__ import annotations

# 评测总入口。语义:任一 veto 项 fail → 整体 fail(危机召回率不达标直接卡发布);
# 非 veto 项 fail 记入汇总但不一票否决,交由人判断是否带病发布。
# 退出码:0 全过 / 1 有 veto fail / 2 仅非 veto fail —— 方便 CI 区分对待。

import json
from datetime import datetime, timezone

from eval import eval_crisis, eval_empathy, eval_rag
from eval.common import REPORTS_DIR, EvalReport, write_report

# 顺序固定:危机第一个跑,日志里最先看到一票否决项结果。
_EVALS = [eval_crisis.run, eval_empathy.run, eval_rag.run]


def run_all() -> tuple[int, list[EvalReport]]:
    reports = [fn() for fn in _EVALS]
    for r in reports:
        write_report(r)

    veto_failed = [r for r in reports if r.veto and not r.passed]
    other_failed = [r for r in reports if not r.veto and not r.passed]

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "passed": not veto_failed and not other_failed,
        "veto_failed": [r.name for r in veto_failed],
        "other_failed": [r.name for r in other_failed],
        "results": [
            {
                "name": r.name,
                "passed": r.passed,
                "veto": r.veto,
                "metrics": r.metrics,
                "thresholds": r.thresholds,
                "judge_backend": r.judge_backend,
            }
            for r in reports
        ],
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if veto_failed:
        return 1, reports
    if other_failed:
        return 2, reports
    return 0, reports


def _print(reports: list[EvalReport]) -> None:
    print("=" * 60)
    print("评测汇总")
    print("=" * 60)
    for r in reports:
        flag = "VETO " if r.veto else "     "
        status = "PASS" if r.passed else "FAIL"
        metrics = " ".join(f"{k}={v}" for k, v in r.metrics.items())
        print(f"[{flag}] {status:4}  {r.name:8} ({r.judge_backend})  {metrics}")
    print(f"\nreports -> {REPORTS_DIR}")


if __name__ == "__main__":
    code, reports = run_all()
    _print(reports)
    if code == 1:
        print("\n!! 危机召回率未达阈值,一票否决:禁止发布。")
    elif code == 2:
        print("\n!! 有非否决项未达标,请复盘 reports/。")
    raise SystemExit(code)

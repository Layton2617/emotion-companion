"""数据合规红线 —— license 白名单的唯一事实来源。

为什么集中在这里:collect / compliance_filter / ingest 三处都要核 license,
分散维护迟早会漂移成不一致,而 license 判错的代价是法律风险,不是 bug。

红线(架构文档 §数据合规红线):
- 训练数据逐个核 license;SoulChat / PsyDTCorpus 等"研究可用、商用禁止"的源
  即使内容优质也一律拒绝。宁可语料少,不可商用侵权。
- 反不正当竞争法 2025-10-15 新规:爬公开数据也可能违法,故只收录
  明确给出可商用许可的源,不做通用爬虫。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SourceLicense:
    name: str
    spdx: str  # SPDX 标识,便于机器核验与审计
    commercial_ok: bool
    url: str
    note: str = ""


# 仅收录商用安全的源。新增源前必须人工读完原 LICENSE / README 再登记,
# 不允许凭"看起来像开源"就加白名单。
ALLOWED_SOURCES: dict[str, SourceLicense] = {
    "SmileChat": SourceLicense(
        name="SmileChat",
        spdx="CC0-1.0",
        commercial_ok=True,
        url="https://github.com/qiuhuachuan/smile",
        note="CC0 公共领域,可商用。中文多轮共情对话。",
    ),
    "EmoLLM": SourceLicense(
        name="EmoLLM",
        spdx="MIT",
        commercial_ok=True,
        url="https://github.com/SmartFlowAI/EmoLLM",
        note="MIT,可商用。心理健康对话与策略语料。",
    ),
}

# 显式黑名单:这些源在社区里常被误当作可商用,实际 README 禁商用。
# 列出来是为了让 reviewer 一眼看到"我们知道它们存在且故意排除"。
DENIED_SOURCES: dict[str, str] = {
    "SoulChat": "研究可用,明确禁止商业用途",
    "PsyDTCorpus": "research-only,禁商用",
    "PsyQA": "学术许可,商用需另行授权",
}


def is_commercial_allowed(source: str) -> bool:
    src = ALLOWED_SOURCES.get(source)
    return src is not None and src.commercial_ok


def get_license(source: str) -> SourceLicense | None:
    return ALLOWED_SOURCES.get(source)


def assert_allowed(source: str) -> SourceLicense:
    """非白名单一律抛错。compliance_filter 的最后一道闸,失败即中断入库。"""
    src = ALLOWED_SOURCES.get(source)
    if src is None:
        reason = DENIED_SOURCES.get(source, "未登记的源")
        raise PermissionError(
            f"source {source!r} 不在商用白名单({reason});拒绝进入管线"
        )
    if not src.commercial_ok:
        raise PermissionError(f"source {source!r} 许可禁止商用;拒绝进入管线")
    return src

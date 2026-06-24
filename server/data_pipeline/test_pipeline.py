"""离线单测:只覆盖不依赖 torch/db 的纯逻辑(license / clean / compliance / chunk)。

ingest 依赖 embedding 模型与 pgvector,属集成范畴,不在此处跑(见 run_demo)。
"""

from __future__ import annotations

import pytest

from data_pipeline.chunk import chunk_record
from data_pipeline.clean import clean_record, normalize_text
from data_pipeline.compliance_filter import filter_record, redact
from data_pipeline.licenses import assert_allowed, is_commercial_allowed
from data_pipeline.schema import Record, Turn


def _rec(source: str, contents: list[tuple[str, str]]) -> Record:
    return Record(
        id="t-1",
        source=source,
        license="CC0-1.0",
        turns=[Turn(role=r, content=c) for r, c in contents],
    )


# ── license 白名单 ──────────────────────────────────────────


def test_whitelist_allows_commercial_sources():
    assert is_commercial_allowed("SmileChat")
    assert is_commercial_allowed("EmoLLM")
    assert assert_allowed("SmileChat").spdx == "CC0-1.0"


def test_denied_source_rejected():
    # SoulChat 在显式黑名单里,必须拒绝且带原因
    with pytest.raises(PermissionError, match="禁止商业"):
        assert_allowed("SoulChat")


def test_unknown_source_rejected():
    with pytest.raises(PermissionError, match="商用白名单"):
        assert_allowed("RandomCrawl")


# ── clean ───────────────────────────────────────────────────


def test_normalize_strips_zero_width_and_collapses_punct():
    out = normalize_text("你好​好。。。。。   多空格")
    assert "​" not in out
    assert "。。。。。" not in out
    assert "  " not in out


def test_clean_drops_empty_record():
    assert clean_record(_rec("SmileChat", [("user", "   "), ("assistant", "")])) is None


# ── compliance: 脱敏 ────────────────────────────────────────


def test_redact_phone_and_id_and_email():
    text = "我手机13812345678,身份证110101199003078888,邮箱a@b.com"
    masked, hits = redact(text)
    assert "13812345678" not in masked and "[PHONE]" in masked
    assert "110101199003078888" not in masked and "[ID]" in masked
    assert "a@b.com" not in masked and "[EMAIL]" in masked
    assert {"phone", "id_card", "email"} <= set(hits)


def test_redact_name_patterns():
    masked, hits = redact("我叫张三,可以叫王女士")
    assert "张三" not in masked
    assert "[NAME]" in masked
    assert "name" in hits


def test_redact_address():
    masked, hits = redact("住在北京市朝阳区幸福路123号")
    assert "幸福路123号" not in masked
    assert "[ADDRESS]" in masked


def test_filter_record_rejects_non_whitelist():
    bad = _rec("SoulChat", [("user", "hi"), ("assistant", "hello")])
    with pytest.raises(PermissionError):
        filter_record(bad)


def test_filter_record_masks_and_tags():
    rec = filter_record(_rec("SmileChat", [("user", "打我13800000000"), ("assistant", "好")]))
    assert "13800000000" not in rec.turns[0].content
    assert any(s.startswith("pii:") for s in rec.stages)


# ── chunk: Contextual Retrieval ─────────────────────────────


def test_chunk_prepends_doc_context():
    rec = _rec("EmoLLM", [("user", "我很焦虑"), ("assistant", "我们试试呼吸练习")])
    rec.strategy = "coping_strategy"
    chunks = chunk_record(rec)
    assert len(chunks) == 1
    # 上下文必须前置在 chunk 文本里,且 chunk 同时含正文
    assert chunks[0].text.startswith("来源 EmoLLM")
    assert "coping_strategy" in chunks[0].text
    assert "呼吸练习" in chunks[0].text
    # 合规字段随 chunk 落库
    assert chunks[0].license == "CC0-1.0"
    assert chunks[0].parent_id == "t-1"

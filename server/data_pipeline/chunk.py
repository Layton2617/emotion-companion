"""切块阶段 —— Contextual Retrieval:切块前给每个 chunk 注入文档级上下文。

为什么这么做(架构文档 §rag):孤立 chunk 丢失了它在整段对话里的位置和主题,
检索时相似度算在残缺语境上,召回失败率高。Anthropic 的 Contextual Retrieval
做法是给每个 chunk 前置一段"它在原文档中是什么"的说明,再做 embedding。

合规红线:
- 上下文是从已脱敏文本生成的;若上游接 LLM 自动生成上下文,送入的也必须是
  compliance 之后的文本,绝不能拿原始含 PII 文本去调外部模型。
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field

from data_pipeline.schema import Record, read_jsonl


@dataclass
class ContextualChunk:
    """落库前的 chunk 形态。对齐 core types.ts 的 Chunk(id/text/source/license/strategy)。"""

    id: str
    text: str  # 已前置文档级上下文,送 embedding 的就是这段
    source: str
    license: str
    strategy: str | None = None
    parent_id: str = ""  # 溯源到原 Record
    meta: dict = field(default_factory=dict)


def _doc_context(rec: Record) -> str:
    """生成文档级上下文摘要。

    这里用规则拼一句话(对话主题 + 策略),零成本且可离线。
    真实环境可换成"用便宜模型对全文档生成一句话上下文"——
    接口不变,只替换本函数实现即可。
    """
    first_user = next((t.content for t in rec.turns if t.role == "user"), "")
    topic = first_user[:40]
    parts = [f"来源 {rec.source} 的情感支持对话"]
    if topic:
        parts.append(f"用户议题:{topic}")
    if rec.strategy:
        parts.append(f"共情策略:{rec.strategy}")
    return ";".join(parts) + "。"


def chunk_record(rec: Record) -> list[ContextualChunk]:
    """以"一来一回"为切块粒度:user+assistant 配成一块,保留共情对照关系。"""
    ctx = _doc_context(rec)
    chunks: list[ContextualChunk] = []
    pairs = _pair_turns(rec.turns)
    for i, body in enumerate(pairs):
        # 上下文前置,空行分隔:embedding 同时看到"全局是什么"和"本块说了什么"。
        text = f"{ctx}\n\n{body}"
        chunks.append(
            ContextualChunk(
                id=f"{rec.id}#{i}",
                text=text,
                source=rec.source,
                license=rec.license,
                strategy=rec.strategy,
                parent_id=rec.id,
                meta={"context": ctx, "chunk_index": i},
            )
        )
    return chunks


def _pair_turns(turns) -> list[str]:
    out: list[str] = []
    buf: list[str] = []
    for t in turns:
        buf.append(f"{'用户' if t.role == 'user' else '陪伴者'}:{t.content}")
        # 在 assistant 处收口成一块;末尾残留的单边也保留。
        if t.role == "assistant":
            out.append("\n".join(buf))
            buf = []
    if buf:
        out.append("\n".join(buf))
    return out


def chunk_file(in_path: str) -> list[ContextualChunk]:
    out: list[ContextualChunk] = []
    for rec in read_jsonl(in_path):
        out.extend(chunk_record(rec))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Contextual Retrieval 切块")
    ap.add_argument("--in", dest="in_path", default="./data/compliant.jsonl")
    args = ap.parse_args()
    chunks = chunk_file(args.in_path)
    print(f"produced {len(chunks)} contextual chunks")
    for c in chunks[:2]:
        print("---")
        print(c.text)


if __name__ == "__main__":
    main()

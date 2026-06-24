"""入库阶段 —— embed(bge-m3)后写 pgvector。复用 app 侧的 EmbeddingService 与 db 池。

合规红线:
- 入库前再核一次 license(assert_allowed):管线最后落点不信任上游一定干净。
- 落库同时写 source/license/strategy,与 core types.ts 的 Chunk 字段对齐,
  让 rag 检索结果天然带合规追溯信息(Chunk.source / Chunk.license)。
- 知识库语料与用户交互数据物理分表:交互数据未经单独同意禁止用于训练/检索,
  本表(rag_chunks)只存知识库语料,不混入任何用户对话。

向量维度由 settings.embedding_dim 固定(bge-m3 = 1024);换模型必须同步迁移此列。
"""

from __future__ import annotations

import argparse
import asyncio

from app.core.config import get_settings
from app.core.db import connect, disconnect, get_pool
from app.services.embedding import get_embedding_service
from data_pipeline.chunk import ContextualChunk, chunk_file
from data_pipeline.licenses import assert_allowed

# 知识库表;与用户记忆表(memory 模块管理)分开。维度内插以匹配 embedding_dim。
_DDL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS rag_chunks (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,
    text        TEXT NOT NULL,
    source      TEXT NOT NULL,
    license     TEXT NOT NULL,
    strategy    TEXT,
    embedding   VECTOR({dim}) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 余弦相似度检索;ivfflat 需要数据量到一定规模才建,这里先备好。
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
    ON rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
"""

_UPSERT = """
INSERT INTO rag_chunks (id, parent_id, text, source, license, strategy, embedding)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE SET
    text = EXCLUDED.text,
    source = EXCLUDED.source,
    license = EXCLUDED.license,
    strategy = EXCLUDED.strategy,
    embedding = EXCLUDED.embedding;
"""


async def ensure_schema() -> None:
    s = get_settings()
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(_DDL.format(dim=s.embedding_dim))


async def ingest_chunks(chunks: list[ContextualChunk], batch_size: int = 64) -> int:
    if not chunks:
        return 0
    svc = get_embedding_service()
    pool = get_pool()
    written = 0
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        for c in batch:
            assert_allowed(c.source)  # 落库前最后一道 license 闸
        # embed 是 CPU/GPU 阻塞调用,挪到线程池,别卡住事件循环。
        vectors = await asyncio.to_thread(svc.embed, [c.text for c in batch])
        rows = [
            (c.id, c.parent_id, c.text, c.source, c.license, c.strategy, vec)
            for c, vec in zip(batch, vectors)
        ]
        async with pool.acquire() as conn:
            await conn.executemany(_UPSERT, rows)
        written += len(rows)
    return written


async def run(in_path: str) -> int:
    chunks = chunk_file(in_path)
    await connect()
    try:
        await ensure_schema()
        return await ingest_chunks(chunks)
    finally:
        await disconnect()


def main() -> None:
    ap = argparse.ArgumentParser(description="embed 后写 pgvector")
    ap.add_argument("--in", dest="in_path", default="./data/compliant.jsonl")
    args = ap.parse_args()
    n = asyncio.run(run(args.in_path))
    print(f"ingested {n} chunks into rag_chunks")


if __name__ == "__main__":
    main()

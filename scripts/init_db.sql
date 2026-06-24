-- 数据库初始化:pgvector 扩展 + 长期记忆表 + 知识库表。
-- 幂等(全部 IF NOT EXISTS),可重复跑;setup.sh 与 seed_knowledge.sh 都依赖它先执行。
--
-- 维度 1024 = bge-m3 dense_vecs(见 server/app/core/config.py: embedding_dim)。
-- 换模型必须同步改这里的 vector(1024) 并重建索引,否则插入维度不符会报错。

CREATE EXTENSION IF NOT EXISTS vector;

-- ── 跨会话长期记忆(packages/memory 的落地表)────────────────────────────
-- 列名对齐 packages/core/src/types.ts 的 MemoryItem(camelCase 字段映射到 snake_case 列)。
CREATE TABLE IF NOT EXISTS memories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    -- kind: fact | emotion | event | open_thread,见 MemoryItem.kind
    kind        TEXT NOT NULL CHECK (kind IN ('fact', 'emotion', 'event', 'open_thread')),
    text        TEXT NOT NULL,
    embedding   vector(1024),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- recall 永远带 user_id 过滤再做向量近邻;先按用户切分再算距离,避免全表扫。
CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories (user_id);

-- 主动回忆(open_thread)按时间倒序取最近未结话题,单独索引覆盖该热路径。
CREATE INDEX IF NOT EXISTS memories_user_kind_created_idx
    ON memories (user_id, kind, created_at DESC);

-- HNSW + cosine:记忆量随用户增长但单用户量有限,HNSW 召回质量优于 ivfflat
-- 且无需预先 ANALYZE 训练聚类中心。bge-m3 检索按余弦相似度。
CREATE INDEX IF NOT EXISTS memories_embedding_idx
    ON memories USING hnsw (embedding vector_cosine_ops);

-- ── 情感知识库(packages/rag 检索的落地表)──────────────────────────────
-- 表名/列对齐 server/data_pipeline/ingest.py 的 rag_chunks(它才是真正的写入方,
-- 用 IF NOT EXISTS 建表):此处先 provision 同一张表,二者必须同构,否则 ingest 的
-- IF NOT EXISTS 会沿用本文件的形状、列不匹配则 INSERT 失败。
-- source/license NOT NULL 是合规追溯红线(architecture.md §数据合规):
-- 不允许无来源/无许可入库——入口脚本与 data_pipeline.licenses 双重把关。
-- id 为 TEXT(ingest 用 "{rec.id}#{i}" 作主键),故不用 gen_random_uuid()。
CREATE TABLE IF NOT EXISTS rag_chunks (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,
    text        TEXT NOT NULL,
    source      TEXT NOT NULL,
    license     TEXT NOT NULL,
    -- 共情策略标签(PsyQA 7 类等),检索时可按 emotion/strategy 过滤
    strategy    TEXT,
    embedding   vector(1024),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_chunks_source_idx ON rag_chunks (source);
CREATE INDEX IF NOT EXISTS rag_chunks_strategy_idx ON rag_chunks (strategy);

-- HNSW + cosine 与 memories 同理(召回质量优于 ivfflat、免聚类预训练)。
-- 注:ingest.py 自带的是 ivfflat 索引,但 IF NOT EXISTS 下先到先得——
-- setup 先跑则用此 HNSW;两个索引名不同,不会冲突。
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
    ON rag_chunks USING hnsw (embedding vector_cosine_ops);

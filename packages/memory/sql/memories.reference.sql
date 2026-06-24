-- 参考 schema(非权威):memories 表的建表/迁移由 db 单元负责,
-- 这里只声明本模块 HttpMemoryStore 假设的列与索引,供 server 实现对齐。
-- bge-m3 输出 1024 维。

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('fact','emotion','event','open_thread')),
  text        text        NOT NULL,
  source_turn text,
  embedding   vector(1024) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 按用户过滤 + 时间倒序(profile/list 用)
CREATE INDEX IF NOT EXISTS memories_user_created_idx
  ON memories (user_id, created_at DESC);

-- 语义检索:cosine 距离 ANN。lists 按数据量调。
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

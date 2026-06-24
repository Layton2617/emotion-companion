# @emotion/memory

跨会话长期记忆,产品核心卖点。竞品死于失忆,这里是护城河。

mem0 思路的轻量自建实现:

- `write()` — 用 LLM 从对话抽取 **fact / emotion / event / open_thread** 四类记忆。
  抽取而非逐句存档,只留对"主动回忆、延续关系"有长期价值的内容(克制陪伴,不堆黏性数据)。
- `recall()` — 语义检索 top-k(server `/embed` 向量化 + pgvector ANN)。
- `profile()` — 聚合 `summary` + `openThreads`,供下一轮"主动回忆"(模板拼接,不调 LLM,要快)。
- `forget()` — PIPL 可删除:删单条或删该用户全部。

向量化与持久化经 `MemoryStore` 接口隔离(`src/store.ts`),默认 `HttpMemoryStore` 走 server HTTP。
日后切 Qdrant 只换 store 实现。

```ts
import { Mem0Module, HttpMemoryStore, LlmMemoryExtractor } from "@emotion/memory";

const memory = new Mem0Module({
  store: new HttpMemoryStore({ baseUrl: process.env.SERVER_URL! }),
  extractor: new LlmMemoryExtractor(llmCompletionClient),
});
```

## 数据表

记忆存于 `memories` 表(pgvector),建表/迁移由 db 单元负责;
本模块假设的 schema 见 `sql/memories.reference.sql`(bge-m3 → `vector(1024)`)。

## server 需提供的接口

`HttpMemoryStore` 依赖以下端点(server 负责向量化与 SQL):

- `POST /memory/add` `{ items: [{ userId, kind, text, sourceTurn? }] }`
- `POST /memory/search` `{ userId, query, k }` → `{ items: MemoryItem[] }`
- `POST /memory/list` `{ userId, kind?, limit? }` → `{ items: MemoryItem[] }`(时间倒序)
- `POST /memory/delete` `{ userId, id? }`

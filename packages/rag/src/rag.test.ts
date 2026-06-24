import { test } from "node:test";
import assert from "node:assert/strict";
import { createRagModule } from "./rag.js";
import type { VectorStore, RawChunk, RerankResult } from "./store.js";

function fakeStore(chunks: RawChunk[], rerank: RerankResult[]): VectorStore & { recalledK?: number } {
  const s: VectorStore & { recalledK?: number } = {
    async embed() {
      return [0.1, 0.2, 0.3];
    },
    async search(_v, k) {
      s.recalledK = k;
      return chunks.slice(0, k);
    },
    async rerank() {
      return rerank;
    },
  };
  return s;
}

const mk = (id: string, extra: Partial<RawChunk> = {}): RawChunk => ({
  id,
  text: `ctx-prefix。${id} body`,
  score: 0.5,
  source: "SmileChat",
  license: "CC0",
  strategy: "reflection",
  ...extra,
});

test("retrieve: reranker 顺序与分数覆盖,字段透传", async () => {
  const store = fakeStore([mk("a"), mk("b"), mk("c")], [
    { index: 2, score: 0.9 },
    { index: 0, score: 0.4 },
    { index: 1, score: 0.1 },
  ]);
  const rag = createRagModule({ store, defaultK: 2 });

  const out = await rag.retrieve("我最近很孤独");
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "c");
  assert.equal(out[0].score, 0.9); // reranker 分覆盖向量分
  assert.equal(out[1].id, "a");
  assert.equal(out[0].source, "SmileChat");
  assert.equal(out[0].license, "CC0");
  assert.equal(out[0].strategy, "reflection");
});

test("retrieve: 负分块被过滤", async () => {
  const store = fakeStore([mk("a"), mk("b")], [
    { index: 0, score: 0.8 },
    { index: 1, score: -0.3 },
  ]);
  const rag = createRagModule({ store });
  const out = await rag.retrieve("x");
  assert.deepEqual(out.map((c) => c.id), ["a"]);
});

test("retrieve: 多召回再收敛 (recallMultiplier)", async () => {
  const store = fakeStore([mk("a")], []);
  const rag = createRagModule({ store, defaultK: 3, recallMultiplier: 4 });
  await rag.retrieve("x");
  assert.equal(store.recalledK, 12);
});

test("retrieve: 空 query 不打 server", async () => {
  let touched = false;
  const store: VectorStore = {
    async embed() {
      touched = true;
      return [];
    },
    async search() {
      return [];
    },
    async rerank() {
      return [];
    },
  };
  const rag = createRagModule({ store });
  const out = await rag.retrieve("   ");
  assert.equal(out.length, 0);
  assert.equal(touched, false);
});

test("retrieve: 无候选直接返回空,不调 rerank", async () => {
  let reranked = false;
  const store: VectorStore = {
    async embed() {
      return [1];
    },
    async search() {
      return [];
    },
    async rerank() {
      reranked = true;
      return [];
    },
  };
  const rag = createRagModule({ store });
  const out = await rag.retrieve("x");
  assert.equal(out.length, 0);
  assert.equal(reranked, false);
});

import type { Chunk, RagModule } from "@emotion/core";
import { createHttpStore, type VectorStore } from "./store.js";

export interface RagOptions {
  store: VectorStore;
  /** retrieve 默认返回的块数 */
  defaultK?: number;
  /** 粗排召回倍数:多召回再交给 reranker 收敛,典型 4~6 倍 */
  recallMultiplier?: number;
}

const MIN_RERANK_SCORE = 0; // reranker 给负分的块判为不相关,宁缺毋滥喂错知识

class HttpRagModule implements RagModule {
  private readonly store: VectorStore;
  private readonly defaultK: number;
  private readonly recallMultiplier: number;

  constructor(opts: RagOptions) {
    this.store = opts.store;
    this.defaultK = opts.defaultK ?? 4;
    this.recallMultiplier = opts.recallMultiplier ?? 5;
  }

  async retrieve(query: string, opts?: { k?: number; emotion?: string }): Promise<Chunk[]> {
    const q = query.trim();
    if (!q) return [];

    const k = opts?.k ?? this.defaultK;
    const recallK = k * this.recallMultiplier;

    const vector = await this.store.embed(q);
    const candidates = await this.store.search(vector, recallK, opts?.emotion);
    if (candidates.length === 0) return [];

    const ranked = await this.store.rerank(
      q,
      candidates.map((c) => c.text),
    );

    return ranked
      .filter((r) => r.score > MIN_RERANK_SCORE && candidates[r.index] !== undefined)
      .slice(0, k)
      .map((r) => {
        const c = candidates[r.index];
        return {
          id: c.id,
          text: c.text,
          score: r.score,
          source: c.source,
          license: c.license,
          strategy: c.strategy,
        };
      });
  }
}

export function createRagModule(opts: RagOptions): RagModule {
  return new HttpRagModule(opts);
}

export interface CreateHttpRagOptions {
  baseUrl: string;
  timeoutMs?: number;
  defaultK?: number;
  recallMultiplier?: number;
  fetchImpl?: typeof fetch;
}

/** 给 core 编排用的便捷构造:只给 server 地址即可。 */
export function createHttpRagModule(opts: CreateHttpRagOptions): RagModule {
  return createRagModule({
    store: createHttpStore({
      baseUrl: opts.baseUrl,
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl,
    }),
    defaultK: opts.defaultK,
    recallMultiplier: opts.recallMultiplier,
  });
}

import type { Chunk } from "@emotion/core";

// 向量库不直接暴露给前端:embedding 模型、reranker、license 元数据都只活在 server 侧,
// 这里只抽象出 HTTP 边界,换 pgvector→Qdrant 或换模型时不动 RagModule。

/** server /search 返回的候选块:已带 Contextual Retrieval 的上下文前缀(切块时注入,检索侧只读)。 */
export interface RawChunk {
  id: string;
  /** 已含上下文前缀的全文,用于喂给 reranker 和最终回传 */
  text: string;
  /** 向量相似度(reranker 之前的粗排分) */
  score: number;
  source: string;
  license?: string;
  strategy?: string;
}

export interface RerankResult {
  /** 对应输入 documents 的下标 */
  index: number;
  /** reranker 的相关性分,覆盖 Chunk.score */
  score: number;
}

export interface VectorStore {
  /** query 文本 → 向量(bge-m3) */
  embed(query: string): Promise<number[]>;
  /** 向量 ANN 检索;emotion 用于按情绪本体过滤策略类语料 */
  search(vector: number[], k: number, emotion?: string): Promise<RawChunk[]>;
  /** bge-reranker 交叉重排,返回按相关性降序的下标+分 */
  rerank(query: string, documents: string[]): Promise<RerankResult[]>;
}

export interface HttpStoreOptions {
  baseUrl: string;
  /** 默认 8s:embedding/rerank 是同步推理,超时要短以免拖垮 /api/chat */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

async function postJson<T>(
  opts: Required<Pick<HttpStoreOptions, "baseUrl" | "timeoutMs" | "fetchImpl">>,
  path: string,
  body: unknown,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await opts.fetchImpl(`${opts.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`rag store ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 把 server 的 /embed /search /rerank 三个端点收口成 VectorStore。 */
export function createHttpStore(options: HttpStoreOptions): VectorStore {
  const opts = {
    baseUrl: options.baseUrl.replace(/\/$/, ""),
    timeoutMs: options.timeoutMs ?? 8000,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  return {
    async embed(query) {
      const r = await postJson<{ vector: number[] }>(opts, "/embed", { text: query });
      return r.vector;
    },
    async search(vector, k, emotion) {
      const r = await postJson<{ chunks: RawChunk[] }>(opts, "/search", { vector, k, emotion });
      return r.chunks;
    },
    async rerank(query, documents) {
      const r = await postJson<{ results: RerankResult[] }>(opts, "/rerank", { query, documents });
      return r.results;
    },
  };
}

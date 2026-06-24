import type { MemoryItem } from "@emotion/core";

// 记忆向量化 + 持久化的边界。把 server(FastAPI /embed + pgvector)细节隔在这里,
// MemoryModule 只面向接口,方便测试替换与日后切 Qdrant。

export interface StoredMemory extends MemoryItem {
  /** 抽取出该记忆的原始对话片段,用于人工追溯与 PIPL 取证 */
  sourceTurn?: string;
}

export interface MemoryStore {
  /** 文本向量化后写入。embedding 在 server 侧算,这里只传文本。 */
  add(items: Omit<StoredMemory, "id" | "score" | "createdAt">[]): Promise<void>;
  /** 语义检索:server 对 query 向量化后在 pgvector 做 ANN。 */
  search(userId: string, query: string, k: number): Promise<MemoryItem[]>;
  /** 取某用户全部记忆(profile 聚合用),按时间倒序。 */
  list(userId: string, opts?: { kind?: MemoryItem["kind"]; limit?: number }): Promise<MemoryItem[]>;
  /** PIPL 可删除:不传 id 删该用户全部。 */
  remove(userId: string, id?: string): Promise<void>;
}

export interface HttpStoreOptions {
  /** server 基址,如 http://localhost:8000 */
  baseUrl: string;
  /** 服务间鉴权,可选 */
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

// 默认实现:走 server HTTP。server 负责 /embed 向量化 + 写 pgvector 的 memories 表。
export class HttpMemoryStore implements MemoryStore {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async add(items: Omit<StoredMemory, "id" | "score" | "createdAt">[]): Promise<void> {
    if (items.length === 0) return;
    await this.post("/memory/add", { items });
  }

  async search(userId: string, query: string, k: number): Promise<MemoryItem[]> {
    const data = await this.post<{ items: MemoryItem[] }>("/memory/search", { userId, query, k });
    return data.items;
  }

  async list(userId: string, opts?: { kind?: MemoryItem["kind"]; limit?: number }): Promise<MemoryItem[]> {
    const data = await this.post<{ items: MemoryItem[] }>("/memory/list", {
      userId,
      kind: opts?.kind,
      limit: opts?.limit,
    });
    return data.items;
  }

  async remove(userId: string, id?: string): Promise<void> {
    await this.post("/memory/delete", { userId, id });
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`memory store ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}

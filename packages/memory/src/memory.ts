import type { MemoryItem, MemoryModule, UserProfile } from "@emotion/core";
import type { MemoryStore } from "./store.js";
import type { MemoryExtractor } from "./extract.js";

export interface MemoryModuleOptions {
  store: MemoryStore;
  extractor: MemoryExtractor;
  /** recall 默认 top-k */
  defaultK?: number;
  /** profile 聚合时各类记忆最多取多少条,避免 summary 过长 */
  profileLimit?: number;
}

const DEFAULT_K = 6;
const DEFAULT_PROFILE_LIMIT = 20;

export class Mem0Module implements MemoryModule {
  private readonly store: MemoryStore;
  private readonly extractor: MemoryExtractor;
  private readonly defaultK: number;
  private readonly profileLimit: number;

  constructor(opts: MemoryModuleOptions) {
    this.store = opts.store;
    this.extractor = opts.extractor;
    this.defaultK = opts.defaultK ?? DEFAULT_K;
    this.profileLimit = opts.profileLimit ?? DEFAULT_PROFILE_LIMIT;
  }

  async recall(userId: string, query: string, k = this.defaultK): Promise<MemoryItem[]> {
    if (!query.trim()) return [];
    return this.store.search(userId, query, k);
  }

  async write(userId: string, turns: { role: "user" | "assistant"; content: string }[]): Promise<void> {
    const extracted = await this.extractor.extract(turns);
    if (extracted.length === 0) return;
    await this.store.add(
      extracted.map((m) => ({
        userId,
        kind: m.kind,
        text: m.text,
        sourceTurn: m.sourceTurn,
      })),
    );
  }

  async profile(userId: string): Promise<UserProfile> {
    const all = await this.store.list(userId, { limit: this.profileLimit });
    return aggregateProfile(userId, all);
  }

  async forget(userId: string, id?: string): Promise<void> {
    await this.store.remove(userId, id);
  }
}

// list 已按时间倒序,这里聚合成"主动回忆"所需的 summary + openThreads。
// 不调 LLM:profile 在每轮对话前调用,要快;summary 用模板拼接足够。
export function aggregateProfile(userId: string, items: MemoryItem[]): UserProfile {
  const facts = items.filter((m) => m.kind === "fact").map((m) => m.text);
  const emotions = items.filter((m) => m.kind === "emotion").map((m) => m.text);
  const events = items.filter((m) => m.kind === "event").map((m) => m.text);
  const openThreads = items.filter((m) => m.kind === "open_thread").map((m) => m.text);

  const parts: string[] = [];
  if (facts.length) parts.push(`关于用户:${facts.slice(0, 6).join(";")}`);
  if (emotions.length) parts.push(`近期情绪:${emotions.slice(0, 4).join(";")}`);
  if (events.length) parts.push(`相关事件:${events.slice(0, 4).join(";")}`);

  return {
    userId,
    summary: parts.join("。") || "暂无长期记忆。",
    // items 倒序,故最新情绪在前
    currentEmotion: emotions[0],
    openThreads: openThreads.slice(0, 5),
  };
}

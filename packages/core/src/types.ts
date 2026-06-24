// 全仓共享类型契约。各 package 按此实现,不要各自重定义。

export type SafetyLevel = "ok" | "concern" | "crisis";

export interface SafetyVerdict {
  level: SafetyLevel;
  /** 命中的原因标签,如 ["self_harm_keyword","classifier_crisis"] */
  reasons: string[];
  /** crisis 时必须返回:幂等强制插入的求助信息(含热线) */
  interventionMessage?: string;
  /** 是否需要人工接管 */
  needsHumanHandoff?: boolean;
  /** 是否疑似未成年 */
  minorSuspected?: boolean;
}

export interface MemoryItem {
  id: string;
  userId: string;
  /** 记忆类型:事实/情绪/事件/未结话题 */
  kind: "fact" | "emotion" | "event" | "open_thread";
  text: string;
  /** 相关度(检索时填充) */
  score?: number;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  /** 长期情绪基线/近况摘要 */
  summary: string;
  /** 当前会话推断的情绪(孤独/焦虑/被忽视/期待…自建细粒度本体) */
  currentEmotion?: string;
  /** 未结的话题,用于主动回忆 */
  openThreads: string[];
}

export interface Chunk {
  id: string;
  text: string;
  score: number;
  /** 来源 + 许可,合规追溯用 */
  source: string;
  license?: string;
  /** 共情策略标签(如 PsyQA 的 7 类策略) */
  strategy?: string;
}

export interface ChatContext {
  memories: MemoryItem[];
  chunks: Chunk[];
  profile: UserProfile;
  emotion?: string;
}

// ── 各模块接口 ──────────────────────────────────────────────

export interface SafetyModule {
  preCheck(input: string, ctx?: { userId: string }): Promise<SafetyVerdict>;
  postCheck(output: string): Promise<SafetyVerdict>;
}

export interface MemoryModule {
  recall(userId: string, query: string, k?: number): Promise<MemoryItem[]>;
  write(userId: string, turns: { role: "user" | "assistant"; content: string }[]): Promise<void>;
  profile(userId: string): Promise<UserProfile>;
  forget(userId: string, id?: string): Promise<void>; // PIPL:可删除
}

export interface RagModule {
  retrieve(query: string, opts?: { k?: number; emotion?: string }): Promise<Chunk[]>;
}

export interface PromptsModule {
  buildSystemPrompt(opts: { safetyLevel: SafetyLevel }): string;
  buildContext(ctx: ChatContext): string;
}

export interface LLMClient {
  stream(messages: { role: string; content: string }[]): AsyncIterable<string>;
}

export interface ChatChunk {
  type: "token" | "intervention" | "done";
  text?: string;
}

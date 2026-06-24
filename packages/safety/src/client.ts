// server 侧危机分类器(Chinese MentalBERT 微调)的 HTTP 客户端。
// 分类器是第二层:捕捉关键词漏掉的隐晦表达。server 不可用时必须降级,
// 因为安全模块是一票否决路径上的同步依赖,绝不能因分类服务抖动而阻断整条对话。

import type { CrisisTier } from "./keywords.js";

export interface ClassifierResult {
  /** 分类器判定的风险层级;degraded=true 表示这是降级后的占位结果 */
  tier: CrisisTier | "none";
  score: number;
  degraded: boolean;
}

export interface ClassifierClientOptions {
  baseUrl?: string;
  /** 安全模块在请求链路上同步执行,超时必须短,宁可降级也不拖慢回复 */
  timeoutMs?: number;
  /** 注入用于测试;默认用全局 fetch */
  fetchImpl?: typeof fetch;
}

const DEGRADED: ClassifierResult = { tier: "none", score: 0, degraded: true };

export class CrisisClassifierClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClassifierClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.SAFETY_SERVER_URL ?? "http://localhost:8000").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async classify(text: string): Promise<ClassifierResult> {
    if (!this.fetchImpl) return DEGRADED;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/safety/classify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) return DEGRADED;
      const data = (await res.json()) as Partial<ClassifierResult>;
      const tier = data.tier === "imminent" || data.tier === "concern" ? data.tier : "none";
      return { tier, score: typeof data.score === "number" ? data.score : 0, degraded: false };
    } catch {
      // 网络/超时/解析失败一律降级;调用方再叠加关键词结果即可保底召回。
      return DEGRADED;
    } finally {
      clearTimeout(timer);
    }
  }
}

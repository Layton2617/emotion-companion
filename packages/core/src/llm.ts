import type { LLMClient } from "./types.js";

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
}

export class LLMConfigError extends Error {
  // 显式设 name,否则被 try/catch 捕获后只能看到 "Error",无法和上游网络错误区分。
  override name = "LLMConfigError";
}

// 配置缺失要早失败而非到首个 token 才暴露,否则错误会被流式 UI 吞掉。
export function loadLLMConfig(env: Record<string, string | undefined> = process.env): LLMConfig {
  const apiKey = env.DEEPSEEK_API_KEY ?? env.LLM_API_KEY;
  if (!apiKey) throw new LLMConfigError("missing DEEPSEEK_API_KEY (or LLM_API_KEY)");
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL ?? env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
    model: env.DEEPSEEK_MODEL ?? env.LLM_MODEL ?? "deepseek-chat",
    temperature: env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : undefined,
  };
}

export class OpenAICompatClient implements LLMClient {
  constructor(private readonly cfg: LLMConfig) {}

  async *stream(messages: { role: string; content: string }[]): AsyncIterable<string> {
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        stream: true,
        ...(this.cfg.temperature != null ? { temperature: this.cfg.temperature } : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM upstream ${res.status}: ${detail.slice(0, 500)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 以空行分隔事件;按行切而非按 chunk,跨网络包的事件才不会被截断。
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (delta) yield delta as string;
        } catch {
          // DeepSeek 偶发心跳/注释行,跳过而非中断整条流。
        }
      }
    }
  }
}

export function createLLMClient(env?: Record<string, string | undefined>): LLMClient {
  return new OpenAICompatClient(loadLLMConfig(env));
}

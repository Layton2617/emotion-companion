// 组合根:把 safety/memory/rag/prompts/llm 这些以工厂/类形式发布的模块,按 core 的
// OrchestratorDeps 契约接起来,对外只暴露 streamChat。
//
// 为什么放在 web-api 单元里:core 是依赖根(故意不 import 下游),各 package 也只发布
// 工厂而不发布"已接好的单例",真正决定用哪套实现、读哪些环境变量的责任落在 app 层。
// memory 路由直接走 HttpMemoryStore(它要的是 list/remove,绕过编排),两边共用同一组
// SERVER_URL / SERVER_API_KEY 环境变量,指向同一个后端。

import type {
  ChatChunk,
  LLMClient,
  MemoryModule,
  RagModule,
  UserProfile,
} from "@emotion/core";
import { createOrchestrator, createLLMClient } from "@emotion/core";
import { createSafetyModule } from "@emotion/safety";
import { createHttpRagModule } from "@emotion/rag";
import { prompts } from "@emotion/prompts";
import { Mem0Module, HttpMemoryStore, LlmMemoryExtractor } from "@emotion/memory";

// 记忆抽取器要的是 CompletionClient(一次性 complete),而 core 的 LLMClient 只有 stream。
// 这两个是不同契约,这里做最小适配:把流收敛成整段文本。
function asCompletionClient(llm: LLMClient): { complete(prompt: string): Promise<string> } {
  return {
    async complete(prompt) {
      let out = "";
      for await (const token of llm.stream([{ role: "user", content: prompt }])) out += token;
      return out;
    },
  };
}

function serverUrl(): string {
  return process.env.SERVER_URL ?? "http://localhost:8000";
}

// 优雅降级:Python 后端(bge-m3 / mem0 / 分类器)塞不进 serverless,公网 demo 常无后端。
// 此时记忆/检索应安全空转而不是让整条对话崩。这是部署策略,故放在 app 层而非污染模块。
// 后端可用时这层完全透明;不可用时只丢记忆/RAG,聊天与危机护栏(纯 TS 关键词层)照常。
let degradedWarned = false;
function warnDegraded(where: string, e: unknown) {
  if (!degradedWarned) {
    degradedWarned = true;
    console.warn(`[deps] 后端不可用,记忆/RAG 降级为空(首次于 ${where}):`, (e as Error)?.message);
  }
}

function degradeMemory(inner: MemoryModule): MemoryModule {
  return {
    async recall(userId, query, k) {
      try { return await inner.recall(userId, query, k); }
      catch (e) { warnDegraded("memory.recall", e); return []; }
    },
    async write(userId, turns) {
      try { await inner.write(userId, turns); }
      catch (e) { warnDegraded("memory.write", e); }
    },
    async profile(userId): Promise<UserProfile> {
      try { return await inner.profile(userId); }
      catch (e) { warnDegraded("memory.profile", e); return { userId, summary: "", openThreads: [] }; }
    },
    async forget(userId, id) {
      try { await inner.forget(userId, id); }
      catch (e) { warnDegraded("memory.forget", e); }
    },
  };
}

function degradeRag(inner: RagModule): RagModule {
  return {
    async retrieve(query, opts) {
      try { return await inner.retrieve(query, opts); }
      catch (e) { warnDegraded("rag.retrieve", e); return []; }
    },
  };
}

interface Wired {
  streamChat: (userId: string, message: string) => AsyncIterable<ChatChunk>;
}

// 懒初始化单例:模块加载期不碰环境变量(缺 LLM key 不该让整个路由文件 import 就崩),
// 第一次真正处理请求时才构造,失败也只影响那一次请求。
let wired: Wired | null = null;

// 懒构造 LLM:危机消息在 safety.preCheck 就短路返回,根本不碰 LLM。若在 build() 急切构造,
// 缺 key 会抛错,导致连危机护栏都 500——安全护栏绝不能因配置缺失而失效。把 key 错误推迟到
// 真正要生成时,危机路径在无 key 环境下依然可用。
function lazyLLM(): LLMClient {
  let real: LLMClient | null = null;
  return {
    async *stream(messages) {
      yield* (real ??= createLLMClient()).stream(messages);
    },
  };
}

function build(): Wired {
  const base = serverUrl();
  const llm = lazyLLM();

  const memory = new Mem0Module({
    store: new HttpMemoryStore({ baseUrl: base, apiKey: process.env.SERVER_API_KEY }),
    extractor: new LlmMemoryExtractor(asCompletionClient(llm)),
  });

  const orchestrator = createOrchestrator({
    safety: createSafetyModule({ baseUrl: base }), // safety 自身已对分类器超时降级到关键词层
    memory: degradeMemory(memory),
    rag: degradeRag(createHttpRagModule({ baseUrl: base })),
    prompts,
    llm,
  });

  return { streamChat: orchestrator.streamChat };
}

function deps(): Wired {
  return (wired ??= build());
}

export function streamChat(userId: string, message: string): AsyncIterable<ChatChunk> {
  return deps().streamChat(userId, message);
}

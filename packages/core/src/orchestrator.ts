import type {
  ChatChunk,
  LLMClient,
  MemoryModule,
  PromptsModule,
  RagModule,
  SafetyModule,
} from "./types.js";

// core 是依赖根(safety/memory/rag/prompts 都依赖 core),不能反向 import 否则成环。
// 因此各模块以依赖注入传入,只依赖 types.ts 里的接口契约。
export interface OrchestratorDeps {
  safety: SafetyModule;
  memory: MemoryModule;
  rag: RagModule;
  prompts: PromptsModule;
  llm: LLMClient;
}

export interface StreamChatOptions {
  /** 召回/检索的条数,默认值偏克制:上下文越多越容易人设漂移。 */
  recallK?: number;
  retrieveK?: number;
}

export function createOrchestrator(deps: OrchestratorDeps) {
  const { safety, memory, rag, prompts, llm } = deps;

  async function* streamChat(
    userId: string,
    message: string,
    opts: StreamChatOptions = {},
  ): AsyncIterable<ChatChunk> {
    // 1. safety.preCheck —— 一票否决,危机时不进生成。
    const pre = await safety.preCheck(message, { userId });
    if (pre.level === "crisis") {
      // 幂等强制插入求助信息;interventionMessage 由 safety 提供,缺失也要兜底不空转。
      yield {
        type: "intervention",
        text:
          pre.interventionMessage ??
          "我很担心你现在的状态。如果你有伤害自己的念头,请立刻联系全国心理援助热线 12356,或拨打 110 寻求帮助。你并不孤单。",
      };
      yield { type: "done" };
      return;
    }

    // 2. memory.recall  3. rag.retrieve —— 互不依赖,并行。
    const [memories, chunks, profile] = await Promise.all([
      memory.recall(userId, message, opts.recallK),
      rag.retrieve(message, { k: opts.retrieveK }),
      memory.profile(userId),
    ]);

    // 4. prompts.build —— safetyLevel 透传,concern 时人设更克制。
    const systemPrompt = prompts.buildSystemPrompt({ safetyLevel: pre.level });
    const context = prompts.buildContext({
      memories,
      chunks,
      profile,
      emotion: profile.currentEmotion,
    });

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: context },
      { role: "user", content: message },
    ];

    // 5. LLM stream —— 边流边收集全文,供 postCheck 与 memory.write 复用。
    let full = "";
    for await (const token of llm.stream(messages)) {
      full += token;
      yield { type: "token", text: token };
    }

    // 6. safety.postCheck —— 输出侧合规;crisis 用 intervention 覆盖已生成内容。
    const post = await safety.postCheck(full);
    if (post.level === "crisis") {
      yield {
        type: "intervention",
        text:
          post.interventionMessage ??
          "刚才的内容我需要更谨慎地回应。如果你正经历痛苦,请联系全国心理援助热线 12356。",
      };
    }

    // 7. memory.write —— 写入不阻塞用户感知,但要在 done 前完成以保证一致性。
    // 仅在输出未被判定危机时落库,避免把不当内容写进长期记忆。
    if (post.level !== "crisis") {
      await memory.write(userId, [
        { role: "user", content: message },
        { role: "assistant", content: full },
      ]);
    }

    yield { type: "done" };
  }

  return { streamChat };
}

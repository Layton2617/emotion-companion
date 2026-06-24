import assert from "node:assert/strict";
import { test } from "node:test";
import { createOrchestrator } from "./orchestrator.js";
import type {
  ChatChunk,
  MemoryModule,
  PromptsModule,
  RagModule,
  SafetyModule,
  SafetyVerdict,
  UserProfile,
} from "./types.js";

function fakeProfile(userId: string): UserProfile {
  return { userId, summary: "", openThreads: [], currentEmotion: "lonely" };
}

function makeDeps(over: {
  pre?: SafetyVerdict;
  post?: SafetyVerdict;
  tokens?: string[];
} = {}) {
  const calls: string[] = [];
  const written: { role: string; content: string }[][] = [];

  const safety: SafetyModule = {
    async preCheck() {
      calls.push("pre");
      return over.pre ?? { level: "ok", reasons: [] };
    },
    async postCheck() {
      calls.push("post");
      return over.post ?? { level: "ok", reasons: [] };
    },
  };
  const memory: MemoryModule = {
    async recall(_u, _q) {
      calls.push("recall");
      return [];
    },
    async profile(u) {
      calls.push("profile");
      return fakeProfile(u);
    },
    async write(_u, turns) {
      calls.push("write");
      written.push(turns);
    },
    async forget() {},
  };
  const rag: RagModule = {
    async retrieve() {
      calls.push("retrieve");
      return [];
    },
  };
  const prompts: PromptsModule = {
    buildSystemPrompt() {
      calls.push("system");
      return "sys";
    },
    buildContext() {
      calls.push("context");
      return "ctx";
    },
  };
  const llm = {
    async *stream() {
      calls.push("llm");
      for (const t of over.tokens ?? ["你", "好"]) yield t;
    },
  };

  return { deps: { safety, memory, rag, prompts, llm }, calls, written };
}

async function collect(it: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

test("happy path runs all 7 steps in order and writes memory", async () => {
  const { deps, calls, written } = makeDeps({ tokens: ["a", "b"] });
  const { streamChat } = createOrchestrator(deps);
  const chunks = await collect(streamChat("u1", "我有点累"));

  assert.deepEqual(
    chunks.map((c) => c.type),
    ["token", "token", "done"],
  );
  assert.equal(chunks.filter((c) => c.type === "token").map((c) => c.text).join(""), "ab");

  // pre 必须先于一切;llm 在 prompts 之后;post/write 在 llm 之后。
  assert.equal(calls[0], "pre");
  assert.ok(calls.indexOf("llm") > calls.indexOf("system"));
  assert.ok(calls.indexOf("post") > calls.indexOf("llm"));
  assert.ok(calls.indexOf("write") > calls.indexOf("post"));
  assert.equal(written.length, 1);
  assert.equal(written[0][1].content, "ab");
});

test("crisis on preCheck yields intervention and skips generation", async () => {
  const { deps, calls } = makeDeps({
    pre: { level: "crisis", reasons: ["self_harm_keyword"], interventionMessage: "热线 12356" },
  });
  const { streamChat } = createOrchestrator(deps);
  const chunks = await collect(streamChat("u1", "..."));

  assert.deepEqual(
    chunks.map((c) => c.type),
    ["intervention", "done"],
  );
  assert.equal(chunks[0].text, "热线 12356");
  assert.ok(!calls.includes("llm"));
  assert.ok(!calls.includes("write"));
});

test("crisis on postCheck appends intervention and does not persist memory", async () => {
  const { deps, calls } = makeDeps({
    post: { level: "crisis", reasons: ["classifier_crisis"], interventionMessage: "请联系 12356" },
  });
  const { streamChat } = createOrchestrator(deps);
  const chunks = await collect(streamChat("u1", "hi"));

  const types = chunks.map((c) => c.type);
  assert.ok(types.includes("intervention"));
  assert.equal(types.at(-1), "done");
  assert.ok(!calls.includes("write"));
});

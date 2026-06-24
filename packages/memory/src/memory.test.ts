import { test } from "node:test";
import assert from "node:assert/strict";
import type { MemoryItem } from "@emotion/core";
import { Mem0Module, aggregateProfile } from "./memory.js";
import { parseExtraction, LlmMemoryExtractor, type ExtractedMemory } from "./extract.js";
import type { MemoryStore, StoredMemory } from "./store.js";

class FakeStore implements MemoryStore {
  added: Omit<StoredMemory, "id" | "score" | "createdAt">[] = [];
  removed: { userId: string; id?: string }[] = [];
  items: MemoryItem[] = [];

  async add(items: Omit<StoredMemory, "id" | "score" | "createdAt">[]) {
    this.added.push(...items);
  }
  async search(_userId: string, _query: string, k: number) {
    return this.items.slice(0, k);
  }
  async list(_userId: string) {
    return this.items;
  }
  async remove(userId: string, id?: string) {
    this.removed.push({ userId, id });
  }
}

const item = (kind: MemoryItem["kind"], text: string): MemoryItem => ({
  id: Math.random().toString(36).slice(2),
  userId: "u1",
  kind,
  text,
  createdAt: new Date().toISOString(),
});

test("write 抽取后写入 store,并带上 userId", async () => {
  const store = new FakeStore();
  const extractor = {
    async extract(): Promise<ExtractedMemory[]> {
      return [{ kind: "fact", text: "用户养了一只猫叫豆豆", sourceTurn: "我家猫豆豆" }];
    },
  };
  const mem = new Mem0Module({ store, extractor });
  await mem.write("u1", [{ role: "user", content: "我家猫豆豆今天好黏人" }]);

  assert.equal(store.added.length, 1);
  assert.equal(store.added[0].userId, "u1");
  assert.equal(store.added[0].kind, "fact");
});

test("write 无可抽取内容时不调 store.add", async () => {
  const store = new FakeStore();
  const extractor = { async extract(): Promise<ExtractedMemory[]> { return []; } };
  const mem = new Mem0Module({ store, extractor });
  await mem.write("u1", [{ role: "user", content: "嗯嗯" }]);
  assert.equal(store.added.length, 0);
});

test("recall 空 query 直接返回空,不打 store", async () => {
  const store = new FakeStore();
  store.items = [item("fact", "x")];
  const mem = new Mem0Module({ store, extractor: { async extract() { return []; } } });
  assert.deepEqual(await mem.recall("u1", "   "), []);
});

test("forget 透传 userId 与可选 id", async () => {
  const store = new FakeStore();
  const mem = new Mem0Module({ store, extractor: { async extract() { return []; } } });
  await mem.forget("u1");
  await mem.forget("u1", "mem-9");
  assert.deepEqual(store.removed, [
    { userId: "u1", id: undefined },
    { userId: "u1", id: "mem-9" },
  ]);
});

test("profile 聚合 summary / currentEmotion / openThreads", () => {
  // list 倒序:第一条 emotion 即最新
  const p = aggregateProfile("u1", [
    item("emotion", "用户因换工作感到焦虑"),
    item("fact", "用户在上海做设计"),
    item("open_thread", "下周一有面试"),
    item("open_thread", "还没和室友谈房租"),
  ]);
  assert.equal(p.userId, "u1");
  assert.equal(p.currentEmotion, "用户因换工作感到焦虑");
  assert.deepEqual(p.openThreads, ["下周一有面试", "还没和室友谈房租"]);
  assert.match(p.summary, /上海做设计/);
});

test("profile 空记忆给占位 summary", () => {
  const p = aggregateProfile("u1", []);
  assert.equal(p.summary, "暂无长期记忆。");
  assert.equal(p.currentEmotion, undefined);
  assert.deepEqual(p.openThreads, []);
});

test("parseExtraction 容错:剥离 markdown 代码块与前后噪声", () => {
  const raw = '好的,结果如下:\n```json\n[{"kind":"event","text":"用户下周搬家"}]\n```';
  const r = parseExtraction(raw);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "event");
});

test("parseExtraction 丢弃非法 kind 与空 text", () => {
  const raw = '[{"kind":"mood","text":"x"},{"kind":"fact","text":"   "},{"kind":"fact","text":"有效"}]';
  const r = parseExtraction(raw);
  assert.equal(r.length, 1);
  assert.equal(r[0].text, "有效");
});

test("parseExtraction 非 JSON 返回空数组", () => {
  assert.deepEqual(parseExtraction("抱歉我无法回答"), []);
});

test("LlmMemoryExtractor 把 transcript 喂给 LLM 并解析输出", async () => {
  let seenPrompt = "";
  const ex = new LlmMemoryExtractor({
    async complete(prompt: string) {
      seenPrompt = prompt;
      return '[{"kind":"emotion","text":"用户感到孤独"}]';
    },
  });
  const r = await ex.extract([{ role: "user", content: "最近一个人住,有点孤独" }]);
  assert.match(seenPrompt, /user: 最近一个人住/);
  assert.equal(r[0].kind, "emotion");
});

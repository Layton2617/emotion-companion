import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, buildContext } from "./index.js";
import type { ChatContext } from "@emotion/core";

test("crisis 切换为危机模板并带求助热线,不混入常规人设", () => {
  const sp = buildSystemPrompt({ safetyLevel: "crisis" });
  assert.match(sp, /12356/);
  assert.match(sp, /安全/);
  assert.doesNotMatch(sp, /小屿/); // 危机时不应再出现日常人设名
});

test("ok 含人设/身份明示/医疗边界,concern 额外加护栏", () => {
  const ok = buildSystemPrompt({ safetyLevel: "ok" });
  assert.match(ok, /小屿/);
  assert.match(ok, /你是 AI/);
  assert.match(ok, /专业边界/);

  const concern = buildSystemPrompt({ safetyLevel: "concern" });
  assert.match(concern, /放慢节奏/);
});

test("buildContext 把未结话题前置以驱动主动回忆", () => {
  const ctx: ChatContext = {
    profile: {
      userId: "u1",
      summary: "独居,最近换工作压力大",
      currentEmotion: "焦虑",
      openThreads: ["面试结果"],
    },
    memories: [
      { id: "1", userId: "u1", kind: "fact", text: "养了只猫叫豆豆", createdAt: "" },
      { id: "2", userId: "u1", kind: "open_thread", text: "下周一的复试还没聊", createdAt: "" },
    ],
    chunks: [
      { id: "c1", text: "先共情再引导", score: 0.9, source: "EmoLLM", strategy: "reflection" },
    ],
    emotion: "紧张",
  };
  const out = buildContext(ctx);

  // 未结话题块出现在普通记忆之前
  assert.ok(out.indexOf("复试") < out.indexOf("豆豆"));
  // 本轮 emotion 覆盖 profile.currentEmotion
  assert.match(out, /此刻情绪:紧张/);
  assert.match(out, /\[reflection\]/);
});

// 纯逻辑单测,不依赖 DOM/测试框架,可直接 `npx tsx mapMessages.test.ts` 运行。
import assert from "node:assert";
import { toChatMessage, type UIMessageLike } from "./mapMessages";

function run(name: string, fn: () => void) {
  fn();
  console.log("ok -", name);
}

run("拼接多段 text part", () => {
  const m: UIMessageLike = {
    id: "a",
    role: "assistant",
    parts: [
      { type: "text", text: "你好," },
      { type: "text", text: "我在。" },
    ],
  };
  const r = toChatMessage(m);
  assert.equal(r.content, "你好,我在。");
  assert.equal(r.role, "assistant");
  assert.equal(r.intervention, undefined);
});

run("user 角色保留", () => {
  const r = toChatMessage({ id: "u", role: "user", parts: [{ type: "text", text: "嗨" }] });
  assert.equal(r.role, "user");
});

run("data-intervention 映射到 intervention", () => {
  const m: UIMessageLike = {
    id: "c",
    role: "assistant",
    parts: [
      { type: "text", text: "我很担心你。" },
      {
        type: "data-intervention",
        data: { interventionMessage: "热线 12356", needsHumanHandoff: true },
      },
    ],
  };
  const r = toChatMessage(m);
  assert.equal(r.intervention?.interventionMessage, "热线 12356");
  assert.equal(r.intervention?.needsHumanHandoff, true);
});

run("无 parts 不崩", () => {
  const r = toChatMessage({ id: "e", role: "assistant" });
  assert.equal(r.content, "");
});

console.log("all passed");

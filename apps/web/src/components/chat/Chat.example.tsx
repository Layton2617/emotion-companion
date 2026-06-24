"use client";

import { useState } from "react";
import type { ChatMessage, ChatStatus } from "./types";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { UsageReminderToast } from "./UsageReminderToast";
import { theme } from "./theme";

/**
 * 无后端的静态示例:不依赖 @ai-sdk/react,纯本地状态驱动,
 * 用来让评审/Storybook 直接看到空状态、气泡、危机卡片、提醒 toast 的样子。
 * 模拟一次 crisis 命中,验证 CrisisCard 的接线。
 */
const seed: ChatMessage[] = [
  { id: "1", role: "user", content: "最近一直睡不好,感觉撑不下去了" },
  {
    id: "2",
    role: "assistant",
    content: "听起来这段时间真的很累,谢谢你愿意说出来。能多讲讲是什么压着你吗?",
  },
  {
    id: "3",
    role: "user",
    content: "我不想活了",
  },
  {
    id: "4",
    role: "assistant",
    content: "我很担心你现在的状态。你的感受很重要,我想陪你一起面对。",
    intervention: {
      interventionMessage:
        "如果你正被强烈的痛苦淹没,请立刻联系:\n• 全国心理援助热线 12356(24 小时)\n• 北京心理危机研究与干预中心 010-82951332\n你愿意现在拨一个吗?",
      needsHumanHandoff: true,
    },
  },
];

export function ChatExample() {
  const [messages, setMessages] = useState<ChatMessage[]>(seed);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [showToast, setShowToast] = useState(false);

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: text }]);
    setStatus("submitted");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: "我在听,慢慢说。" },
      ]);
      setStatus("ready");
    }, 800);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: theme.bg }}>
      <button
        onClick={() => setShowToast(true)}
        style={{ margin: 8, padding: "6px 10px", alignSelf: "flex-start" }}
      >
        模拟 2h 提醒
      </button>
      <MessageList messages={messages} status={status} />
      <Composer value={input} onChange={setInput} onSubmit={send} status={status} />
      <UsageReminderToast visible={showToast} onDismiss={() => setShowToast(false)} />
    </div>
  );
}

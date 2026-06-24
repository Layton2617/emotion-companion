"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatMessage } from "./types";
import { toChatMessage } from "./mapMessages";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { UsageReminderToast } from "./UsageReminderToast";
import { theme } from "./theme";

/**
 * 容器组件:把 AI SDK 的 useChat 收口成本单元的 ChatMessage 视图模型。
 * 后端 /api/chat 走 SSE,intervention(危机护栏)以 data part 形式随流下发,
 * 这里映射到对应消息的 message.intervention,再交给 CrisisCard 渲染。
 */
export function Chat({ api = "/api/chat" }: { api?: string }) {
  const [input, setInput] = useState("");
  const transport = useMemo(() => new DefaultChatTransport({ api }), [api]);
  const { messages, sendMessage, status } = useChat({ transport });

  const view: ChatMessage[] = useMemo(
    () => messages.map(toChatMessage),
    [messages],
  );

  function handleSubmit() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage({ text });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: theme.bg,
      }}
    >
      <MessageList messages={view} status={status} />
      <Composer value={input} onChange={setInput} onSubmit={handleSubmit} status={status} />
      <UsageReminderToast />
    </div>
  );
}

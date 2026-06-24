import { useEffect, useRef } from "react";
import type { ChatMessage, ChatStatus } from "./types";
import { MessageBubble } from "./MessageBubble";
import { StreamingIndicator } from "./StreamingIndicator";
import { theme } from "./theme";

interface Props {
  messages: ChatMessage[];
  status: ChatStatus;
}

export function MessageList({ messages, status }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // 新消息或流式 token 进来时贴底。依赖 length + 末条内容,流式追加文本也会滚。
  const last = messages[messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, last?.content, status]);

  if (messages.length === 0) return <EmptyState />;

  // submitted = 已发出但首个 token 未到,此时 last 仍是用户消息,需要占位指示器
  const waitingForReply =
    status === "submitted" || (status === "streaming" && last?.role === "user");

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {waitingForReply && <StreamingIndicator />}
      <div ref={endRef} />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 24,
        textAlign: "center",
        color: theme.textMuted,
      }}
    >
      <div style={{ fontSize: 40 }} aria-hidden>🌙</div>
      <p style={{ fontSize: 18, color: theme.aiText, margin: 0 }}>今晚想聊点什么?</p>
      <p style={{ fontSize: 13, margin: 0, maxWidth: 280, lineHeight: 1.6 }}>
        开心的、烦心的,或者只是想有人陪着 —— 都可以。
      </p>
    </div>
  );
}

import type { ChatMessage } from "./types";
import { theme } from "./theme";
import { CrisisCard } from "./CrisisCard";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 6,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          padding: "10px 14px",
          borderRadius: theme.radius,
          borderTopRightRadius: isUser ? 4 : theme.radius,
          borderTopLeftRadius: isUser ? theme.radius : 4,
          background: isUser ? theme.userBubble : theme.aiBubble,
          color: isUser ? theme.userText : theme.aiText,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content}
      </div>

      {/* 合规前置:每条 AI 气泡都明示非真人,而不是只在首条或设置里说一次 */}
      {!isUser && (
        <span style={{ fontSize: 11, color: theme.textMuted, paddingLeft: 4 }}>
          AI 驱动,非真人
        </span>
      )}

      {/* 只要后端挂了 intervention 就出卡片;号码兜底交给 CrisisCard,
          否则后端漏传 interventionMessage 时危机用户会看不到任何求助资源 */}
      {message.intervention && (
        <CrisisCard intervention={message.intervention} />
      )}
    </div>
  );
}

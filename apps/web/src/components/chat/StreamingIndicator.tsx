import { theme } from "./theme";

/** AI 正在生成时的三点呼吸动画。keyframes 用一次性注入,避免引入 CSS 构建链。 */
export function StreamingIndicator() {
  return (
    <div
      aria-label="对方正在输入"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: "12px 14px",
        borderRadius: theme.radius,
        borderTopLeftRadius: 4,
        background: theme.aiBubble,
        marginBottom: 14,
      }}
    >
      <style>{dotKeyframes}</style>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: theme.aiText,
            opacity: 0.4,
            animation: `ec-dot 1.2s ${i * 0.18}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

const dotKeyframes = `
@keyframes ec-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
  30% { transform: translateY(-4px); opacity: 0.9; }
}`;

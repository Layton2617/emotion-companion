import type { ChatMessage } from "./types";
import { theme } from "./theme";

type Intervention = NonNullable<ChatMessage["intervention"]>;

/**
 * 危机干预卡片。设计取舍:醒目但不惊吓 —— 暖琥珀底色、无红色告警、文案先共情再给资源。
 * 热线信息来自后端 interventionMessage(safety 模块幂等强制插入),UI 不硬编码号码以免与护栏漂移。
 * 默认兜底号码仅在后端漏传时出现,保证危机时永远有可拨打的资源。
 */
const FALLBACK_HOTLINE = "全国心理援助热线 12356";

export function CrisisCard({ intervention }: { intervention: Intervention }) {
  const message = intervention.interventionMessage?.trim() || FALLBACK_HOTLINE;

  return (
    <div
      role="note"
      aria-label="求助资源"
      style={{
        maxWidth: "78%",
        marginTop: 4,
        padding: "14px 16px",
        borderRadius: theme.radius,
        background: theme.crisisBg,
        border: `1px solid ${theme.crisisBorder}`,
        color: theme.crisisText,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span aria-hidden style={{ fontSize: 18 }}>🫂</span>
        <strong style={{ fontSize: 14 }}>你并不孤单,这里有人能帮你</strong>
      </div>

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
        {message}
      </p>

      {intervention.needsHumanHandoff && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: theme.crisisAccent }}>
          我已经请人工同伴一起关注你,请稍等片刻。
        </p>
      )}
    </div>
  );
}

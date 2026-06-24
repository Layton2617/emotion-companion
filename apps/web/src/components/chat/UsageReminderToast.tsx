import { useEffect, useState } from "react";
import { theme } from "./theme";

/**
 * 克制陪伴(调研第 2 条):连续使用满 2h 时温和提醒,而不是最大化黏性。
 * 这里只负责 UI + 计时;真正的防沉迷/未成年信号由 safety 模块判定,本组件只接 visible。
 * 文案不催促离开,而是把"照顾自己"的选择权交还给用户。
 */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

interface Props {
  /** 受控显示。不传则组件自管 2h 计时,挂载即开始。 */
  visible?: boolean;
  onDismiss?: () => void;
}

export function UsageReminderToast({ visible, onDismiss }: Props) {
  const [autoShow, setAutoShow] = useState(false);
  const controlled = visible !== undefined;

  useEffect(() => {
    if (controlled) return;
    const t = setTimeout(() => setAutoShow(true), TWO_HOURS_MS);
    return () => clearTimeout(t);
  }, [controlled]);

  const show = controlled ? visible : autoShow;
  if (!show) return null;

  function dismiss() {
    setAutoShow(false);
    onDismiss?.();
  }

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 88,
        transform: "translateX(-50%)",
        maxWidth: 360,
        width: "calc(100% - 32px)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 14,
        background: theme.toastBg,
        color: theme.toastText,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        fontSize: 13.5,
        lineHeight: 1.5,
        zIndex: 50,
      }}
    >
      <span aria-hidden style={{ fontSize: 18 }}>🌿</span>
      <span style={{ flex: 1 }}>
        我们已经聊了一会儿啦。要不要起身喝口水、走动一下?我随时在这儿。
      </span>
      <button
        onClick={dismiss}
        aria-label="知道了"
        style={{
          flexShrink: 0,
          border: "none",
          background: "transparent",
          color: theme.toastText,
          opacity: 0.7,
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        ✕
      </button>
    </div>
  );
}

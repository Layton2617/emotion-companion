import { useRef, type FormEvent, type KeyboardEvent } from "react";
import type { ChatStatus } from "./types";
import { theme } from "./theme";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  status: ChatStatus;
}

export function Composer({ value, onChange, onSubmit, status }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const canSend = value.trim().length > 0 && !busy;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    onSubmit();
    // 自适应高度复位
    if (taRef.current) taRef.current.style.height = "auto";
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 发送,Shift+Enter 换行 —— 聊天框的通用预期
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: 12,
        borderTop: `1px solid ${theme.accentDisabled}`,
        background: theme.surface,
      }}
    >
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        placeholder="说点什么…"
        onChange={(e) => {
          onChange(e.target.value);
          autoGrow(e.target);
        }}
        onKeyDown={onKeyDown}
        style={{
          flex: 1,
          resize: "none",
          border: `1px solid ${theme.accentDisabled}`,
          borderRadius: 14,
          padding: "10px 14px",
          fontSize: 15,
          lineHeight: 1.5,
          outline: "none",
          fontFamily: "inherit",
          background: theme.bg,
          color: theme.aiText,
          maxHeight: 140,
        }}
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="发送"
        style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "none",
          cursor: canSend ? "pointer" : "default",
          background: canSend ? theme.accent : theme.accentDisabled,
          color: "#fff",
          fontSize: 18,
          transition: "background 0.15s",
        }}
      >
        {busy ? "…" : "↑"}
      </button>
    </form>
  );
}

"use client";

import type { MemoryItem } from "@emotion/core";

// 四类记忆各给一套视觉语言:不是冷冰冰的标签,而是"我记着的东西"。
// emotion 用最柔的色,因为情绪是最需要被温柔对待的那一类。
const KIND_STYLE: Record<
  MemoryItem["kind"],
  { label: string; emoji: string; bg: string; fg: string; ring: string }
> = {
  fact: {
    label: "记得",
    emoji: "🪺",
    bg: "bg-amber-50",
    fg: "text-amber-900",
    ring: "ring-amber-200",
  },
  event: {
    label: "那天",
    emoji: "📎",
    bg: "bg-sky-50",
    fg: "text-sky-900",
    ring: "ring-sky-200",
  },
  emotion: {
    label: "心情",
    emoji: "🫧",
    bg: "bg-rose-50",
    fg: "text-rose-900",
    ring: "ring-rose-200",
  },
  open_thread: {
    label: "还想着",
    emoji: "🧵",
    bg: "bg-violet-50",
    fg: "text-violet-900",
    ring: "ring-violet-200",
  },
};

function formatWhen(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return then.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export interface MemoryChipProps {
  item: MemoryItem;
  /** 触发 forget(userId, id) —— 体现 PIPL 的"可删除"。不传则不显示删除入口。 */
  onForget?: (item: MemoryItem) => void;
  /** 删除进行中:禁用按钮、给即时反馈,避免重复触发幂等以外的困惑 */
  forgetting?: boolean;
}

export function MemoryChip({ item, onForget, forgetting }: MemoryChipProps) {
  const style = KIND_STYLE[item.kind];
  const when = formatWhen(item.createdAt);

  return (
    <li
      className={`group flex items-start gap-2 rounded-2xl px-3 py-2.5 ring-1 ${style.bg} ${style.ring} transition-opacity ${
        forgetting ? "opacity-40" : "opacity-100"
      }`}
    >
      <span aria-hidden className="mt-0.5 select-none text-base leading-none">
        {style.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${style.fg}`}>{item.text}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
          <span>{style.label}</span>
          {when && (
            <>
              <span aria-hidden>·</span>
              <span>{when}</span>
            </>
          )}
        </div>
      </div>

      {onForget && (
        <button
          type="button"
          disabled={forgetting}
          onClick={() => onForget(item)}
          // 删除是用户的权利,不该被藏起来,但也不该喧宾夺主 —— 默认半隐,hover/focus 浮现。
          className="shrink-0 rounded-full px-2 py-1 text-[11px] text-neutral-400 opacity-0 transition hover:bg-white/60 hover:text-neutral-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed"
          aria-label={`让 AI 忘记这条:${item.text}`}
        >
          {forgetting ? "正在忘记…" : "忘掉"}
        </button>
      )}
    </li>
  );
}

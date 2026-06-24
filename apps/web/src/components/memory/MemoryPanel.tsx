"use client";

import { useMemo, useState } from "react";
import type { MemoryItem, UserProfile } from "@emotion/core";
import { MemoryChip } from "./MemoryChip";
import { ProfileSummary } from "./ProfileSummary";

// 面板分组顺序刻意把 open_thread 放在前:它是"主动回忆"的素材,也是留存的核心钩子。
// 顺序不按时间,而按"对陪伴关系的意义"。
const GROUP_ORDER: { kind: MemoryItem["kind"]; title: string }[] = [
  { kind: "open_thread", title: "我还惦记着的事" },
  { kind: "event", title: "你跟我说过的那些事" },
  { kind: "fact", title: "关于你" },
  { kind: "emotion", title: "你的心情" },
];

export interface MemoryPanelProps {
  profile: UserProfile;
  memories: MemoryItem[];
  /** 对应 memory.forget(userId, id)。返回 Promise 以便面板展示删除中状态。 */
  onForget?: (item: MemoryItem) => Promise<void> | void;
  /** 导出回忆册 —— 增值付费点占位;不传则按钮置灰提示"即将开放"。 */
  onExport?: () => void;
  loading?: boolean;
}

export function MemoryPanel({
  profile,
  memories,
  onForget,
  onExport,
  loading,
}: MemoryPanelProps) {
  const [forgettingId, setForgettingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<MemoryItem["kind"], MemoryItem[]>();
    for (const m of memories) {
      const arr = map.get(m.kind) ?? [];
      arr.push(m);
      map.set(m.kind, arr);
    }
    // 组内按时间倒序:同一类里最近的先出现。
    for (const arr of map.values()) {
      arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return map;
  }, [memories]);

  async function handleForget(item: MemoryItem) {
    if (!onForget) return;
    setForgettingId(item.id);
    try {
      await onForget(item);
    } finally {
      setForgettingId(null);
    }
  }

  const isEmpty = memories.length === 0;

  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto bg-neutral-50 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">记得你的事</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            这些是我认真记下来的。你随时可以让我忘掉任何一条。
          </p>
        </div>
      </header>

      <ProfileSummary profile={profile} />

      {loading ? (
        <p className="px-1 text-sm text-neutral-400">正在翻看我们的回忆…</p>
      ) : isEmpty ? (
        <div className="rounded-3xl bg-white p-6 text-center">
          <p className="text-sm text-neutral-500">
            我们才刚开始。聊着聊着，我会慢慢把你在意的事记在这里。
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {GROUP_ORDER.map(({ kind, title }) => {
            const items = grouped.get(kind);
            if (!items || items.length === 0) return null;
            return (
              <div key={kind}>
                <h3 className="mb-2 px-1 text-xs font-medium text-neutral-400">
                  {title}
                </h3>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <MemoryChip
                      key={item.id}
                      item={item}
                      onForget={onForget ? handleForget : undefined}
                      forgetting={forgettingId === item.id}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <footer className="mt-auto pt-2">
        <button
          type="button"
          disabled={!onExport}
          onClick={onExport}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
        >
          导出回忆册
          {!onExport && <span className="ml-1.5 text-[11px]">即将开放</span>}
        </button>
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          回忆册把这段陪伴整理成一本可带走的小书 · 增值功能
        </p>
      </footer>
    </aside>
  );
}

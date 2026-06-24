"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/conversations";
import { relativeTime } from "@/lib/conversations";

interface Props {
  conversations: Conversation[];
  currentId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

// GPT 式对话历史,但更温:暖色、留白、措辞柔软("新的陪伴"而非"New chat")。
export function HistorySidebar({ conversations, currentId, onSelect, onNew, onDelete }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-5">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-clay-500 px-4 py-3 text-sm font-medium text-sand-50 shadow-sm transition hover:bg-clay-600 active:scale-[.99]"
        >
          <span aria-hidden>✚</span> 新的陪伴
        </button>
      </div>

      <p className="px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-sand-300">
        过往的对话
      </p>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-sand-300">
            还没有聊过天。
            <br />
            我们慢慢来。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => {
              const active = c.id === currentId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={[
                      "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition",
                      active ? "bg-sand-100" : "hover:bg-sand-100/60",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "truncate pr-6 text-[13.5px]",
                        active ? "text-ink-800" : "text-ink-700",
                      ].join(" ")}
                    >
                      {c.title || "新的陪伴"}
                    </span>
                    <span className="text-[11px] text-sand-300">{relativeTime(c.updatedAt)}</span>
                  </button>

                  {confirmId === c.id ? (
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(c.id);
                          setConfirmId(null);
                        }}
                        className="rounded-lg bg-clay-500 px-2 py-1 text-[11px] text-sand-50 hover:bg-clay-600"
                      >
                        删掉
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-lg px-2 py-1 text-[11px] text-clay-600 hover:bg-sand-200"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="删除这段对话"
                      onClick={() => setConfirmId(c.id)}
                      className="absolute right-2 top-2.5 rounded-lg p-1 text-sand-300 opacity-0 transition hover:bg-sand-200 hover:text-clay-600 group-hover:opacity-100"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { MemoryItem, UserProfile } from "@emotion/core";

import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import type { ChatMessage, ChatStatus } from "@/components/chat/types";
import { MemoryPanel } from "@/components/memory";
import { HistorySidebar } from "@/components/history/HistorySidebar";
import {
  type Conversation,
  listConversations,
  saveConversation,
  removeConversation,
  getCurrentId,
  setCurrentId,
  newId,
  titleFrom,
} from "@/lib/conversations";

const EMPTY_PROFILE: UserProfile = { userId: "me", summary: "", openThreads: [] };

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrent] = useState<string>("");

  const { messages: aiMessages, status: aiStatus, sendMessage, setMessages } = useChat();

  // 首次挂载:从 localStorage 恢复历史 + 选中上次的会话(避免 SSR 水合不一致,只在客户端做)。
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const list = listConversations();
    setConversations(list);
    const saved = getCurrentId();
    const target = (saved && list.find((c) => c.id === saved)) || list[0];
    if (target) {
      setCurrent(target.id);
      setMessages(target.messages as never);
    } else {
      const id = newId();
      setCurrent(id);
      setCurrentId(id);
    }
  }, [setMessages]);

  // 消息变化即落库(非空才存,避免一堆空会话);标题取首条用户消息。
  useEffect(() => {
    if (!currentId || aiMessages.length === 0) return;
    const existing = conversations.find((c) => c.id === currentId);
    const now = Date.now();
    const conv: Conversation = {
      id: currentId,
      title: titleFrom(aiMessages),
      messages: aiMessages as unknown[],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    saveConversation(conv);
    setConversations(listConversations());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMessages]);

  const messages: ChatMessage[] = useMemo(() => aiMessages.map(toChatMessage), [aiMessages]);
  const status: ChatStatus = mapStatus(aiStatus);

  function handleSubmit() {
    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput("");
  }

  function selectConversation(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setCurrent(id);
    setCurrentId(id);
    setMessages(conv.messages as never);
    setHistoryOpen(false);
  }

  function newConversation() {
    const id = newId();
    setCurrent(id);
    setCurrentId(id);
    setMessages([] as never);
    setHistoryOpen(false);
  }

  function deleteConversation(id: string) {
    removeConversation(id);
    const list = listConversations();
    setConversations(list);
    if (id === currentId) {
      if (list[0]) selectConversation(list[0].id);
      else newConversation();
    }
  }

  const memories: MemoryItem[] = [];

  return (
    <div className="mx-auto flex h-screen max-w-[1400px]">
      {/* 左:对话历史(GPT 式,更温馨)。桌面常驻,移动端抽屉。 */}
      <aside
        className={[
          "w-64 shrink-0 border-r border-sand-200 bg-sand-50/80",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-xl",
          "transition-transform duration-300 max-md:w-64",
          historyOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        ].join(" ")}
        aria-label="对话历史"
      >
        <HistorySidebar
          conversations={conversations}
          currentId={currentId}
          onSelect={selectConversation}
          onNew={newConversation}
          onDelete={deleteConversation}
        />
      </aside>

      {historyOpen && (
        <div
          className="fixed inset-0 z-10 bg-ink-800/20 md:hidden"
          onClick={() => setHistoryOpen(false)}
          aria-hidden
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          onToggleHistory={() => setHistoryOpen((v) => !v)}
          onToggleMemory={() => setMemoryOpen((v) => !v)}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <MessageList messages={messages} status={status} />
          <Composer value={input} onChange={setInput} onSubmit={handleSubmit} status={status} />
        </div>

        <Disclaimer />
      </main>

      <aside
        className={[
          "w-80 shrink-0 border-l border-sand-200 bg-sand-50/60",
          "max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:shadow-xl",
          "transition-transform duration-300 max-md:w-72",
          memoryOpen ? "max-md:translate-x-0" : "max-md:translate-x-full",
        ].join(" ")}
        aria-label="记忆面板"
      >
        <MemoryPanel profile={EMPTY_PROFILE} memories={memories} />
      </aside>
    </div>
  );
}

function Header({
  onToggleHistory,
  onToggleMemory,
}: {
  onToggleHistory: () => void;
  onToggleMemory: () => void;
}) {
  return (
    <header className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleHistory}
          className="rounded-full px-2.5 py-1.5 text-sm text-clay-600 transition hover:bg-sand-100 md:hidden"
          aria-label="对话历史"
        >
          ☰
        </button>
        <span className="h-2.5 w-2.5 rounded-full bg-sage-400 animate-breathe" aria-hidden />
        <h1 className="text-base font-medium text-ink-700">陪你一会儿</h1>
      </div>
      <button
        type="button"
        onClick={onToggleMemory}
        className="rounded-full px-3 py-1.5 text-sm text-clay-600 transition hover:bg-sand-100 md:hidden"
      >
        记忆
      </button>
    </header>
  );
}

function Disclaimer() {
  return (
    <p className="px-5 pb-3 text-center text-[11px] leading-relaxed text-sand-300">
      由 AI 提供陪伴,非真人,也不替代专业心理或医疗帮助。
      如遇紧急情况请拨打全国心理援助热线 12356。
    </p>
  );
}

function toChatMessage(m: AiMessageLike): ChatMessage {
  const parts = m.parts ?? [];
  const content = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
  const interventionPart = parts.find((p) => p.type === "data-intervention");
  return {
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    content,
    intervention: interventionPart?.data as ChatMessage["intervention"],
  };
}

function mapStatus(s: string): ChatStatus {
  switch (s) {
    case "submitted":
      return "submitted";
    case "streaming":
      return "streaming";
    case "error":
      return "error";
    default:
      return "ready";
  }
}

interface AiMessageLike {
  id: string;
  role: string;
  parts?: { type: string; text?: string; data?: unknown }[];
}

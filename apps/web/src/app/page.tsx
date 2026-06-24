"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { MemoryItem, UserProfile } from "@emotion/core";

import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import type { ChatMessage, ChatStatus } from "@/components/chat/types";
import { MemoryPanel } from "@/components/memory";

// 留存>拉新:画像与记忆是核心卖点,所以记忆面板是主屏的一等公民,默认常驻(桌面端)。
// 真实数据由 web-memory 单元接 /api/memory 后填充,壳层先给空骨架,空态由 MemoryPanel 自处理。
const EMPTY_PROFILE: UserProfile = {
  userId: "me",
  summary: "",
  openThreads: [],
};

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);

  const { messages: aiMessages, status: aiStatus, sendMessage } = useChat();

  // AI SDK 的消息模型 → 本仓 chat 组件约定的 ChatMessage 视图模型。
  // intervention(危机卡片)由后端通过 data part 透传,这里挂回对应 assistant 气泡。
  const messages: ChatMessage[] = useMemo(
    () => aiMessages.map(toChatMessage),
    [aiMessages],
  );

  const status: ChatStatus = mapStatus(aiStatus);

  function handleSubmit() {
    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput("");
  }

  // 壳层不持有记忆数据,故不提供 onForget/onExport —— 面板会据此置灰,符合各自单元的职责边界。
  const memories: MemoryItem[] = [];

  return (
    <div className="mx-auto flex h-screen max-w-6xl">
      <main className="flex min-w-0 flex-1 flex-col">
        <Header onToggleMemory={() => setMemoryOpen((v) => !v)} />

        <div className="flex min-h-0 flex-1 flex-col">
          <MessageList messages={messages} status={status} />
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            status={status}
          />
        </div>

        <Disclaimer />
      </main>

      {/* 记忆面板:桌面常驻,移动端按需抽屉。克制设计——不喧宾夺主,默认在侧。 */}
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

function Header({ onToggleMemory }: { onToggleMemory: () => void }) {
  return (
    <header className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-2.5">
        {/* 呼吸般缓慢明灭的小圆点,呼应潮汐式的平静节奏 */}
        <span
          className="h-2.5 w-2.5 rounded-full bg-sage-400 animate-breathe"
          aria-hidden
        />
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
  // 合规前置:AI 身份与医疗边界免责放在主屏可见处,而非折叠进设置。
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

  // 危机干预走 data part(type: "data-intervention"),与文本分流,贴回当前气泡。
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

// useChat 的消息类型随 ai-sdk 版本演进而变,这里只约束壳层真正用到的最小字段,
// 避免把整个 UIMessage 泛型拖进来导致跨版本编译脆弱。
interface AiMessageLike {
  id: string;
  role: string;
  parts?: { type: string; text?: string; data?: unknown }[];
}

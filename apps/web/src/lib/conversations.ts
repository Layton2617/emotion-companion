// 对话历史:本地存储(localStorage)。MVP 不依赖后端——刷新不丢、可删除,Vercel/隧道都能跑。
// 代价是换设备不同步(需账号体系,属后续)。存原始 UIMessage 以便用 setMessages 原样恢复。

const KEY = "ec.conversations.v1";
const CUR = "ec.conversations.current";

export interface Conversation {
  id: string;
  title: string;
  messages: unknown[]; // AI SDK 的 UIMessage[],原样存取
  createdAt: number;
  updatedAt: number;
}

function safeParse(raw: string | null): Conversation[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function listConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(KEY)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveConversation(conv: Conversation): void {
  if (typeof window === "undefined") return;
  const all = safeParse(localStorage.getItem(KEY));
  const i = all.findIndex((c) => c.id === conv.id);
  if (i === -1) all.push(conv);
  else all[i] = conv;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function removeConversation(id: string): void {
  if (typeof window === "undefined") return;
  const all = safeParse(localStorage.getItem(KEY)).filter((c) => c.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getCurrentId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CUR);
}

export function setCurrentId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUR, id);
}

export function newId(): string {
  // 不依赖 crypto.randomUUID(老浏览器没有);时间 + 随机足够本地唯一。
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// 从首条用户消息生成标题。UIMessage 的文本在 parts[].text 里。
export function titleFrom(messages: unknown[]): string {
  for (const m of messages as { role?: string; parts?: { type?: string; text?: string }[] }[]) {
    if (m?.role !== "user") continue;
    const text = (m.parts ?? [])
      .filter((p) => p?.type === "text" && p.text)
      .map((p) => p.text as string)
      .join("")
      .trim();
    if (text) return text.length > 18 ? text.slice(0, 18) + "…" : text;
  }
  return "新的陪伴";
}

export function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

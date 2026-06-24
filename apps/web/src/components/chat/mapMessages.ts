import type { ChatMessage } from "./types";

/** AI SDK v5 的 UIMessage 形状(只取本单元用到的字段)。 */
export interface UIMessageLike {
  id: string;
  role: string;
  parts?: { type: string; text?: string; data?: any }[];
}

/**
 * 把 AI SDK 的 UIMessage 收口成本单元的视图模型。
 * 文本来自 text parts 拼接;危机干预通过 data-intervention part 透传
 * (对应后端 ChatChunk.type === "intervention"),挂到对应消息上由 CrisisCard 渲染。
 */
export function toChatMessage(m: UIMessageLike): ChatMessage {
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
    intervention: interventionPart?.data,
  };
}

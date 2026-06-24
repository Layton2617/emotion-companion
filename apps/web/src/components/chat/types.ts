import type { SafetyVerdict } from "@emotion/core";

/**
 * UI 侧的消息视图模型。
 * 后端通过 SSE 推 ChatChunk(token/intervention/done);intervention 在 UI 上不是一条独立消息,
 * 而是挂在当前 AI 回复上的护栏元数据 —— 这样危机卡片始终贴着对应的对话出现,而不是飘在消息流里。
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** crisis 时由后端 intervention chunk 填充,触发 CrisisCard */
  intervention?: Pick<SafetyVerdict, "interventionMessage" | "needsHumanHandoff">;
}

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

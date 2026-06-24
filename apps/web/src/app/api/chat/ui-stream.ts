import type { SafetyVerdict } from "@emotion/core";

// AI SDK v5 的 UI Message Stream 是 SSE：每个 part 一行 `data: <json>`，以 `data: [DONE]` 收尾。
// 这里手写编码而不是依赖 SDK 的 createUIMessageStream，是因为我们的上游是 core 的 ChatChunk
// 异步迭代器,自己拼协议比塞进 SDK 的 writer 回调更直接,也不用把整条 UIMessage 建模出来。

export type UIStreamPart =
  | { type: "start" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  // 自定义 data part:危机护栏元数据,客户端按 `data-intervention` 读取并挂到当前 AI 消息上。
  | { type: "data-intervention"; data: Pick<SafetyVerdict, "interventionMessage" | "needsHumanHandoff"> }
  | { type: "finish" }
  | { type: "error"; errorText: string };

const encoder = new TextEncoder();

function frame(part: UIStreamPart): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(part)}\n\n`);
}

const DONE = encoder.encode("data: [DONE]\n\n");

export function toUIMessageStream(
  parts: AsyncIterable<UIStreamPart>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of parts) controller.enqueue(frame(part));
      } catch (err) {
        controller.enqueue(
          frame({ type: "error", errorText: err instanceof Error ? err.message : "stream_failed" }),
        );
      } finally {
        controller.enqueue(DONE);
        controller.close();
      }
    },
  });
}

// 客户端用 useChat 时需要这组 header 才会按 UI message stream 协议解析。
export const uiStreamHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "x-vercel-ai-ui-message-stream": "v1",
} as const;

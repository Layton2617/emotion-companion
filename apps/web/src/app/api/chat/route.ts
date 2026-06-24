import type { ChatChunk } from "@emotion/core";
import { streamChat } from "./deps";
import { toUIMessageStream, uiStreamHeaders, type UIStreamPart } from "./ui-stream";

export const runtime = "nodejs";
// 留存优先的产品里这条流可能要跑很久(共情回复不催),关掉静态优化。
export const dynamic = "force-dynamic";

interface ChatBody {
  userId?: string;
  // useChat 默认发送整个消息列表;我们只取最后一条 user 文本送进编排器,
  // 历史靠 core 内部的长期记忆 recall 还原,而不是把整段对话当上下文塞回去。
  messages?: { role: string; parts?: { type: string; text?: string }[]; content?: string }[];
  message?: string;
}

function lastUserText(body: ChatBody): string | null {
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  const msgs = body.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string" && m.content.trim()) return m.content.trim();
    const text = (m.parts ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("");
    if (text.trim()) return text.trim();
  }
  return null;
}

async function* toParts(chunks: AsyncIterable<ChatChunk>): AsyncGenerator<UIStreamPart> {
  // 单条 AI 回复对应一个 text part;intervention 是独立的 data part,不混进文本里,
  // 这样危机卡片在 UI 上能贴着这条回复渲染而不会污染正文。
  const textId = "0";
  let textOpen = false;

  yield { type: "start" };

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case "token":
        if (chunk.text) {
          if (!textOpen) {
            yield { type: "text-start", id: textId };
            textOpen = true;
          }
          yield { type: "text-delta", id: textId, delta: chunk.text };
        }
        break;
      case "intervention":
        // crisis:把热线/人工接管标记作为护栏元数据下发。core 已保证幂等,这里不再去重。
        yield {
          type: "data-intervention",
          data: { interventionMessage: chunk.text, needsHumanHandoff: true },
        };
        break;
      case "done":
        break;
    }
  }

  if (textOpen) yield { type: "text-end", id: textId };
  yield { type: "finish" };
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = lastUserText(body);
  if (!message) return Response.json({ error: "empty_message" }, { status: 400 });

  // 匿名兜底:没带 userId 也能聊,只是拿不到跨会话记忆——记忆是卖点但不该是聊天的硬门槛。
  const userId = body.userId?.trim() || "anonymous";

  const chunks = streamChat(userId, message);
  return new Response(toUIMessageStream(toParts(chunks)), { headers: uiStreamHeaders });
}

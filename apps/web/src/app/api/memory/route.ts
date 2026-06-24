import { HttpMemoryStore } from "@emotion/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 走 server 侧记忆存储(/embed + pgvector)。没配地址就别假装能工作——
// 静默返回空记忆会让用户以为记忆丢了,比直接 503 更糟。
function getStore(): HttpMemoryStore | null {
  const baseUrl = process.env.SERVER_URL?.trim();
  if (!baseUrl) return null;
  return new HttpMemoryStore({ baseUrl, apiKey: process.env.SERVER_API_KEY });
}

// 没有真实鉴权之前,userId 走 query param。记忆面板和 PIPL 删除都要它,缺了直接拒绝
// 比静默用 anonymous 安全——删错人的记忆比聊错天严重得多。
function requireUserId(req: Request): string | null {
  const id = new URL(req.url).searchParams.get("userId")?.trim();
  return id || null;
}

// GET /api/memory?userId=&q=&k=  列出记忆(给记忆面板)。
// 带 q 走语义召回;不带 q 列最近(panel 默认场景),用 store.list 而非 recall——
// recall 在 query 为空时按约定返回 [],拿它列面板会永远空。
export async function GET(req: Request): Promise<Response> {
  const userId = requireUserId(req);
  if (!userId) return Response.json({ error: "missing_userId" }, { status: 400 });

  const store = getStore();
  if (!store) return Response.json({ error: "memory_unconfigured" }, { status: 503 });

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const kRaw = url.searchParams.get("k");
  const k = kRaw ? Math.min(Math.max(Number(kRaw) | 0, 1), 100) : 50;

  const items = query
    ? await store.search(userId, query, k)
    : await store.list(userId, { limit: k });
  return Response.json({ items });
}

// DELETE /api/memory?userId=&id=  删单条;省略 id 则清空该用户全部记忆(PIPL 可删除权)。
export async function DELETE(req: Request): Promise<Response> {
  const userId = requireUserId(req);
  if (!userId) return Response.json({ error: "missing_userId" }, { status: 400 });

  const store = getStore();
  if (!store) return Response.json({ error: "memory_unconfigured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id")?.trim() || undefined;
  await store.remove(userId, id);
  return Response.json({ ok: true, scope: id ? "item" : "all" });
}

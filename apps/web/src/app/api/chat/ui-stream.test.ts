import { test } from "node:test";
import assert from "node:assert/strict";
import { toUIMessageStream, type UIStreamPart } from "./ui-stream";

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

async function* parts(items: UIStreamPart[]): AsyncGenerator<UIStreamPart> {
  for (const p of items) yield p;
}

test("文本 part 被编码成 SSE 帧并以 [DONE] 收尾", async () => {
  const out = await collect(
    toUIMessageStream(
      parts([
        { type: "start" },
        { type: "text-start", id: "0" },
        { type: "text-delta", id: "0", delta: "你" },
        { type: "text-delta", id: "0", delta: "好" },
        { type: "text-end", id: "0" },
        { type: "finish" },
      ]),
    ),
  );

  assert.match(out, /data: \{"type":"text-delta","id":"0","delta":"你"\}\n\n/);
  assert.match(out, /data: \{"type":"finish"\}\n\n/);
  assert.ok(out.trimEnd().endsWith("data: [DONE]"));
});

test("intervention 走独立的 data-intervention part", async () => {
  const out = await collect(
    toUIMessageStream(
      parts([
        { type: "start" },
        {
          type: "data-intervention",
          data: { interventionMessage: "12356", needsHumanHandoff: true },
        },
        { type: "finish" },
      ]),
    ),
  );

  assert.match(out, /"type":"data-intervention"/);
  assert.match(out, /"needsHumanHandoff":true/);
});

test("上游抛错时降级成 error part 而不是炸断流", async () => {
  async function* boom(): AsyncGenerator<UIStreamPart> {
    yield { type: "start" };
    throw new Error("upstream_down");
  }
  const out = await collect(toUIMessageStream(boom()));

  assert.match(out, /"type":"error"/);
  assert.match(out, /upstream_down/);
  assert.ok(out.trimEnd().endsWith("data: [DONE]"));
});

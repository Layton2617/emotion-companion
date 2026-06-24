import type { MemoryItem } from "@emotion/core";

export type ExtractKind = MemoryItem["kind"];

export interface ExtractedMemory {
  kind: ExtractKind;
  text: string;
  /** 抽取依据的对话片段,留痕用 */
  sourceTurn?: string;
}

// 抽取器只需要"给 prompt 拿文本"的能力,不绑定具体厂商(项目用 DeepSeek/Qwen)。
export interface CompletionClient {
  complete(prompt: string): Promise<string>;
}

export interface MemoryExtractor {
  extract(turns: { role: "user" | "assistant"; content: string }[]): Promise<ExtractedMemory[]>;
}

const VALID_KINDS: ReadonlySet<string> = new Set(["fact", "emotion", "event", "open_thread"]);

// 抽取而非逐句存档:只留对"主动回忆"有长期价值的信息,呼应"克制陪伴、留存优先"。
// 不抽取寒暄、客套、AI 自身的回复内容。
const EXTRACT_PROMPT = `你是情绪陪伴产品的长期记忆抽取器。从下面这段对话中,只抽取对"日后主动回忆、延续关系"有长期价值的信息。

抽取为四类(kind):
- fact: 关于用户的稳定事实(人名、关系、职业、所在地、长期偏好/厌恶)
- emotion: 用户表达的情绪状态及其指向(如"因为搬家感到孤独")
- event: 用户提到的具体事件(过去发生或将要发生,带时间线索更好)
- open_thread: 未结的话题,下次可主动追问(如"下周面试""还没和妈妈和好")

规则:
- 只抽用户(user)的信息,不要抽 assistant 的话。
- 寒暄、客套、泛泛的情绪词不要抽。宁缺毋滥。
- 每条尽量自包含,第三人称陈述,不要用"你/我",用"用户"。
- 没有可抽取内容时返回空数组。

只输出 JSON 数组,每个元素 {"kind": "...", "text": "...", "sourceTurn": "原始片段"}。不要任何解释、不要 markdown 代码块。

对话:
{{TURNS}}`;

export class LlmMemoryExtractor implements MemoryExtractor {
  constructor(private readonly llm: CompletionClient) {}

  async extract(turns: { role: "user" | "assistant"; content: string }[]): Promise<ExtractedMemory[]> {
    const transcript = turns.map((t) => `${t.role}: ${t.content}`).join("\n");
    const raw = await this.llm.complete(EXTRACT_PROMPT.replace("{{TURNS}}", transcript));
    return parseExtraction(raw);
  }
}

// 单独导出便于测试:LLM 可能裹 markdown 代码块或夹带前后文,做容错解析。
export function parseExtraction(raw: string): ExtractedMemory[] {
  const json = stripCodeFence(raw).trim();
  const start = json.indexOf("[");
  const end = json.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ExtractedMemory[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { kind, text, sourceTurn } = item as Record<string, unknown>;
    if (typeof kind !== "string" || !VALID_KINDS.has(kind)) continue;
    if (typeof text !== "string" || text.trim() === "") continue;
    out.push({
      kind: kind as ExtractKind,
      text: text.trim(),
      sourceTurn: typeof sourceTurn === "string" ? sourceTurn : undefined,
    });
  }
  return out;
}

function stripCodeFence(s: string): string {
  return s.replace(/```(?:json)?/gi, "");
}

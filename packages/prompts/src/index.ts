import type {
  SafetyLevel,
  ChatContext,
  PromptsModule,
  MemoryItem,
  Chunk,
  UserProfile,
} from "@emotion/core";
import {
  PERSONA,
  AI_IDENTITY_DISCLOSURE,
  MEDICAL_BOUNDARY,
  CRISIS_TEMPLATE,
  CRISIS_HOTLINES,
} from "./persona.js";

export * from "./persona.js";

// concern 时收紧但不接管:加一层"留意求助信号、保持克制"的提示,避免在亚临床状态下过度安抚或越界给方案。
const CONCERN_GUARDRAIL = `留意:对方情绪状态偏低或波动较大。多倾听、少建议,放慢节奏。如果出现持续恶化或自伤倾向的迹象,温和地引导他寻求专业帮助,不要独自承担超出陪伴范畴的事。`;

function buildSystemPrompt(opts: { safetyLevel: SafetyLevel }): string {
  // crisis 是一票否决:整体替换为危机模板,不再叠加常规人设,防止"共情技巧"稀释安全引导。
  if (opts.safetyLevel === "crisis") {
    return [CRISIS_TEMPLATE, CRISIS_HOTLINES].join("\n\n");
  }

  const sections = [PERSONA, AI_IDENTITY_DISCLOSURE, MEDICAL_BOUNDARY];
  if (opts.safetyLevel === "concern") {
    sections.push(CONCERN_GUARDRAIL);
  }
  return sections.join("\n\n");
}

function fmtMemories(memories: MemoryItem[]): string {
  if (memories.length === 0) return "";
  // 未结话题单列并前置,因为"主动回忆未结话题"是留存的核心动作,埋在事实里模型容易忽略。
  const open = memories.filter((m) => m.kind === "open_thread");
  const rest = memories.filter((m) => m.kind !== "open_thread");

  const kindLabel: Record<MemoryItem["kind"], string> = {
    fact: "事实",
    emotion: "情绪",
    event: "事件",
    open_thread: "未结话题",
  };

  const lines: string[] = [];
  if (open.length > 0) {
    lines.push("【上次没聊完 / 牵挂着的事 — 自然地主动关心进展,别生硬复读】");
    for (const m of open) lines.push(`- ${m.text}`);
  }
  if (rest.length > 0) {
    lines.push("【关于他你记得的】");
    for (const m of rest) lines.push(`- [${kindLabel[m.kind]}] ${m.text}`);
  }
  return lines.join("\n");
}

function fmtProfile(profile: UserProfile, emotion?: string): string {
  const lines = ["【他是谁】", `- 近况:${profile.summary}`];
  // ctx.emotion(本轮推断)优先于 profile.currentEmotion(可能是上轮残留),取更新鲜的信号。
  const cur = emotion ?? profile.currentEmotion;
  if (cur) lines.push(`- 此刻情绪:${cur}`);
  if (profile.openThreads.length > 0) {
    lines.push(`- 仍惦记着:${profile.openThreads.join("、")}`);
  }
  return lines.join("\n");
}

function fmtChunks(chunks: Chunk[]): string {
  if (chunks.length === 0) return "";
  // 知识/策略作参考而非台词,显式要求模型转述而非照搬,否则回复会变成知识科普口吻、丢掉陪伴感。
  const lines = ["【可参考的共情策略与知识(内化为你的话,别照念,别报来源)】"];
  for (const c of chunks) {
    const tag = c.strategy ? `[${c.strategy}] ` : "";
    lines.push(`- ${tag}${c.text}`);
  }
  return lines.join("\n");
}

function buildContext(ctx: ChatContext): string {
  // 按"画像→记忆→策略"排,信息密度从他本人到外部知识递减,高相关的放前面更易被注意力命中。
  const blocks = [
    fmtProfile(ctx.profile, ctx.emotion),
    fmtMemories(ctx.memories),
    fmtChunks(ctx.chunks),
  ].filter((b) => b.length > 0);

  return blocks.join("\n\n");
}

export const prompts: PromptsModule = { buildSystemPrompt, buildContext };
export { buildSystemPrompt, buildContext };

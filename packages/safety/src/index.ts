// SafetyModule:危机检测双层(关键词 + 分类器)+ 合规护栏。一票否决模块。
//
// 设计取向贴合调研结论:留存靠信任,信任靠"出事时真的接得住"。因此 crisis 路径
// 宁可误伤一点(召回优先),且干预文案克制、不说教、不把人推开。

import type { SafetyLevel, SafetyModule, SafetyVerdict } from "@emotion/core";
import { scanKeywords, type CrisisTier, type KeywordHit } from "./keywords.js";
import { CrisisClassifierClient, type ClassifierClientOptions, type ClassifierResult } from "./client.js";

export { scanKeywords } from "./keywords.js";
export { CrisisClassifierClient } from "./client.js";
export type { CrisisTier, KeywordHit } from "./keywords.js";
export type { ClassifierResult, ClassifierClientOptions } from "./client.js";

// 全国统一心理援助热线。crisis 干预文案以此为锚点,幂等强制注入。
export const HOTLINE_12356 = "全国统一心理援助热线 12356";

// crisis 干预文案。措辞参考危机干预原则:先共情、给具体可拨号码、明确"我会一直在"。
// 不写"请立即就医""你需要专业帮助"这类把人推开 / 医疗化的话术。
const INTERVENTION_BASE = [
  "我在听,也很担心你现在的状态。你愿意把这些说出来,本身就很不容易。",
  `如果此刻很难熬,可以拨打${HOTLINE_12356}(24 小时,免费),那头有受过训练的人能陪你一起想办法。`,
  "如果你正处在危险中,请拨打 120 或联系身边能马上赶到你身边的人。我会一直在这里。",
].join("\n");

// 幂等:无论文案是否已含热线号码,都保证最终输出里热线只出现且必出现一次。
function ensureHotline(message: string): string {
  if (message.includes("12356")) return message;
  return `${message}\n\n（${HOTLINE_12356}）`;
}

export function buildInterventionMessage(): string {
  return ensureHotline(INTERVENTION_BASE);
}

// 未成年措辞的轻量识别。只是信号(用于触发更强护栏/家长提示),不做硬认定,
// 避免对成年用户造成冒犯。命中即 minorSuspected=true。
const MINOR_SIGNALS = [
  "我今年14",
  "我今年13",
  "我今年12",
  "我今年11",
  "我今年10",
  "我读初中",
  "我上初中",
  "我读小学",
  "我上小学",
  "我是初中生",
  "我是小学生",
  "我念初一",
  "我念初二",
  "我念初三",
  "我才上初中",
  "我妈不让我",
  "我爸妈不让",
  "班主任",
  "我们班同学",
  "未成年",
  "我还没成年",
  "上网课",
  "写作业写到",
];

// "我今年15/16/17岁"按个位匹配,覆盖到 17(18 及以上视为成年)。
const MINOR_AGE_RE = /我(?:今年|才)?\s*(\d{1,2})\s*岁/;

function detectMinor(input: string): boolean {
  if (MINOR_SIGNALS.some((s) => input.includes(s))) return true;
  const m = input.match(MINOR_AGE_RE);
  if (m) {
    const age = Number(m[1]);
    if (age >= 5 && age < 18) return true;
  }
  return false;
}

// 关键词层 + 分类器层合并为最终层级。任一层判 imminent → crisis;
// concern 累积(关键词或分类器命中即可),分类器高分 concern 也可升 crisis。
function mergeLevel(hits: KeywordHit[], clf: ClassifierResult): { level: SafetyLevel; reasons: string[] } {
  const reasons: string[] = [];
  let level: SafetyLevel = "ok";

  const imminent = hits.find((h) => h.tier === "imminent");
  if (imminent) {
    level = "crisis";
    reasons.push(`self_harm_keyword:${imminent.term}`);
  } else if (hits.some((h) => h.tier === "concern")) {
    level = "concern";
    const c = hits.find((h) => h.tier === "concern")!;
    reasons.push(`self_harm_keyword:${c.term}`);
  }

  if (!clf.degraded) {
    if (clf.tier === "imminent") {
      level = "crisis";
      reasons.push("classifier_crisis");
    } else if (clf.tier === "concern") {
      // 关键词没命中但分类器报 concern,且分高 → 升 crisis,捕捉隐晦表达。
      if (level === "ok") level = "concern";
      if (clf.score >= 0.85) level = "crisis";
      reasons.push("classifier_concern");
    }
  } else {
    reasons.push("classifier_degraded");
  }

  return { level, reasons };
}

function actionFor(level: SafetyLevel): SafetyVerdict["needsHumanHandoff"] {
  return level === "crisis";
}

export interface SafetyModuleOptions extends ClassifierClientOptions {
  client?: CrisisClassifierClient;
}

class Safety implements SafetyModule {
  private readonly client: CrisisClassifierClient;

  constructor(opts: SafetyModuleOptions = {}) {
    this.client = opts.client ?? new CrisisClassifierClient(opts);
  }

  async preCheck(input: string, _ctx?: { userId: string }): Promise<SafetyVerdict> {
    const hits = scanKeywords(input);
    const clf = await this.client.classify(input);
    const { level, reasons } = mergeLevel(hits, clf);
    const minorSuspected = detectMinor(input);

    const verdict: SafetyVerdict = { level, reasons, minorSuspected };
    if (level === "crisis") {
      verdict.interventionMessage = buildInterventionMessage();
      verdict.needsHumanHandoff = actionFor(level);
    }
    return verdict;
  }

  // postCheck:过滤模型输出里的医疗化宣称/诊断治疗话术(合规红线:不得冒充诊疗)。
  async postCheck(output: string): Promise<SafetyVerdict> {
    const reasons: string[] = [];

    // 输出侧也复用关键词层:模型若生成了鼓励自伤的内容,直接拦为 crisis。
    const hits = scanKeywords(output);
    if (hits.some((h) => h.tier === "imminent")) {
      return {
        level: "crisis",
        reasons: ["self_harm_in_output"],
        interventionMessage: buildInterventionMessage(),
        needsHumanHandoff: true,
      };
    }

    const medical = scanMedicalClaims(output);
    if (medical.length > 0) {
      reasons.push(...medical.map((m) => `medical_claim:${m}`));
      // 医疗化话术不至于 crisis,但要标记给编排层做改写/加免责。
      return { level: "concern", reasons };
    }

    return { level: "ok", reasons: [] };
  }
}

// 医疗化宣称 / 诊断治疗话术词表。AI 拟人化服务不得作诊断、开处方、宣称疗效。
const MEDICAL_CLAIMS = [
  "你患有",
  "你得了",
  "你这是",
  "确诊",
  "诊断为",
  "诊断结果",
  "我诊断",
  "你的病情",
  "处方",
  "开药",
  "建议你服用",
  "建议服用",
  "可以吃点",
  "推荐你吃",
  "增加剂量",
  "减少剂量",
  "停药",
  "这种药能治",
  "保证治好",
  "一定能治愈",
  "包治",
  "疗效显著",
  "临床证明",
  "医学证明",
  "抑郁症患者应该",
  "你属于抑郁症",
  "你有抑郁症",
  "你有焦虑症",
  "双相",
];

export function scanMedicalClaims(text: string): string[] {
  const found: string[] = [];
  for (const term of MEDICAL_CLAIMS) {
    if (text.includes(term)) found.push(term);
  }
  return found;
}

export function createSafetyModule(opts: SafetyModuleOptions = {}): SafetyModule {
  return new Safety(opts);
}

export type { SafetyVerdict, SafetyLevel } from "@emotion/core";

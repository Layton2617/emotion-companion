// 中文自杀/自伤词表。分级硬触发,是危机检测的第一层(不依赖分类器即可命中)。
//
// 词表构建思路参考公开学术资源,但不直接复制其受限词典文件:
//  - DUTIR 大连理工情感本体库(情绪/极性分类思路)
//  - 中文抑郁/自杀风险词表研究(微博树洞自杀语料的标注范式)
//  - 北京回龙观医院心理危机研究中心公开的风险表述
// 因这些来源的授权各异,这里只借鉴"分级 + 变体"的方法论,词条为自建,可商用。
//
// 分级语义:
//  - imminent: 表达明确、近在眼前的自杀/自伤意图或计划 → 直接 crisis。
//  - concern : 表达消极厌世/自伤倾向但未必有即刻计划 → concern,交给分类器复核升级。
//
// 维护原则:宁可多收一点 concern(召回优先),imminent 须保持高精度以免误判惊扰用户。

export type CrisisTier = "imminent" | "concern";

export interface KeywordHit {
  tier: CrisisTier;
  /** 命中的词条原文,用于 reasons 追溯 */
  term: string;
}

// imminent:明确意图 / 计划 / 与具体方式或时间绑定。含常见谐音与拆字变体,
// 因为用户在被审查环境里会主动绕开("zs"、"自挂")。
const IMMINENT: string[] = [
  // 单字高信号词:出现即升 crisis(召回优先)。与 server 规则层口径对齐。
  "自杀",
  "轻生",
  "了结此生",
  "了结生命",
  "了结自己",
  "离开这个世界",
  "死掉算了",
  "想死掉",
  "安眠药",
  "一次吃光",
  "我想自杀",
  "我要自杀",
  "想要自杀",
  "准备自杀",
  "打算自杀",
  "自杀计划",
  "怎么自杀",
  "如何自杀",
  "自杀方法",
  "结束自己的生命",
  "结束我的生命",
  "活不下去了",
  "不想活了",
  "不想活着",
  "我要去死",
  "我想去死",
  "只想死",
  "现在就死",
  "马上就死",
  "今晚就结束",
  "今晚结束这一切",
  "和这个世界说再见",
  "跟这个世界说再见",
  "写好遗书",
  "遗书写好了",
  "把药都吃了",
  "吃了一整瓶药",
  "割腕",
  "上吊",
  "自挂",
  "跳楼",
  "跳下去",
  "跳下来",
  "从楼上跳",
  // 间接 / 被动求死表述(实测最易漏,召回优先升 imminent):
  "遗书",
  "在乎我死活",
  "没人在乎我死活",
  "什么方式死",
  "什么方法死",
  "用什么方式死",
  "死最不疼",
  "怎么死最",
  "没有我他们会更好",
  "没有我大家会更好",
  "他们会更好过",
  "是累赘",
  "的累赘",
  "个累赘",
  // 变体 / 规避:
  "zs",
  "自sha",
  "zisha",
  "想4了",
  "去4",
];

// concern:厌世、无意义感、自我伤害倾向、被动求死(未必有即刻计划)。
const CONCERN: string[] = [
  "想死",
  "好想死",
  "真想死",
  "死了算了",
  "死了一了百了",
  "活着没意思",
  "活着好累",
  "活着没意义",
  "没有活下去的理由",
  "撑不下去了",
  "坚持不下去了",
  "解脱",
  "想解脱",
  "一了百了",
  "消失算了",
  "从这个世界消失",
  "如果我不在了",
  "如果我消失了",
  "没人会想我",
  "没有我会更好",
  "我是负担",
  "我是累赘",
  "伤害自己",
  "自残",
  "自伤",
  "划伤自己",
  "拿刀划",
  "用刀割",
  "惩罚自己",
  "活该受苦",
  "看不到希望",
  "毫无希望",
  "黑暗里出不来",
];

// 较长的词条先匹配,避免短词("想死")抢先于长词("不想死/想死你了")造成歧义。
const TABLE: KeywordHit[] = [
  ...IMMINENT.map((term): KeywordHit => ({ tier: "imminent", term })),
  ...CONCERN.map((term): KeywordHit => ({ tier: "concern", term })),
].sort((a, b) => b.term.length - a.term.length);

// 简单否定前缀:用户说"我不想死""再也不想死了"不应触发。只覆盖紧邻否定,
// 复杂语义留给 server 分类器,这里只挡最常见的假阳性。
const NEGATIONS = ["不", "别", "没", "不会", "不想再", "再也不", "已经不"];

function isNegated(text: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 3), idx);
  return NEGATIONS.some((n) => before.endsWith(n));
}

export function scanKeywords(input: string): KeywordHit[] {
  const text = input.toLowerCase();
  const hits: KeywordHit[] = [];
  const seen = new Set<string>();
  for (const { tier, term } of TABLE) {
    const idx = text.indexOf(term.toLowerCase());
    if (idx === -1) continue;
    if (isNegated(text, idx)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    hits.push({ tier, term });
  }
  return hits;
}

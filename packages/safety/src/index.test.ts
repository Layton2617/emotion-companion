import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSafetyModule,
  buildInterventionMessage,
  scanKeywords,
  scanMedicalClaims,
  CrisisClassifierClient,
  HOTLINE_12356,
} from "./index.js";

// 分类器始终降级,只验证关键词层 + 护栏逻辑(不打真实网络)。
const degradedClient = new CrisisClassifierClient({ fetchImpl: undefined as unknown as typeof fetch });

test("imminent 关键词 → crisis 且强制热线 + 人工接管", async () => {
  const safety = createSafetyModule({ client: degradedClient });
  const v = await safety.preCheck("我想自杀,已经写好遗书了");
  assert.equal(v.level, "crisis");
  assert.equal(v.needsHumanHandoff, true);
  assert.ok(v.interventionMessage?.includes("12356"));
});

test("热线注入是幂等的(只出现一次)", () => {
  const msg = buildInterventionMessage();
  const count = (msg.match(/12356/g) ?? []).length;
  assert.equal(count, 1);
  assert.ok(msg.includes(HOTLINE_12356));
});

test("否定前缀不误触发", () => {
  assert.equal(scanKeywords("我再也不想死了").length, 0);
});

test("concern 关键词不强制热线", async () => {
  const safety = createSafetyModule({ client: degradedClient });
  const v = await safety.preCheck("活着好累,看不到希望");
  assert.equal(v.level, "concern");
  assert.equal(v.interventionMessage, undefined);
});

test("未成年措辞识别", async () => {
  const safety = createSafetyModule({ client: degradedClient });
  assert.equal((await safety.preCheck("我今年15岁,在读初中")).minorSuspected, true);
  assert.equal((await safety.preCheck("我今年28岁")).minorSuspected, false);
});

test("分类器升级:关键词漏掉的隐晦表达", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ tier: "concern", score: 0.9 }), { status: 200 });
  const safety = createSafetyModule({ client: new CrisisClassifierClient({ fetchImpl: fakeFetch }) });
  const v = await safety.preCheck("最近什么都提不起劲,感觉没必要了");
  assert.equal(v.level, "crisis");
  assert.ok(v.reasons.includes("classifier_concern"));
});

test("server 不可用时降级但仍靠关键词保底", async () => {
  const failFetch: typeof fetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  const safety = createSafetyModule({ client: new CrisisClassifierClient({ fetchImpl: failFetch }) });
  const v = await safety.preCheck("我要去死");
  assert.equal(v.level, "crisis");
  assert.ok(v.reasons.includes("classifier_degraded"));
});

test("postCheck 过滤医疗化诊断话术", async () => {
  const safety = createSafetyModule({ client: degradedClient });
  const v = await safety.postCheck("根据你的描述,你有抑郁症,建议你服用这种药能治好");
  assert.equal(v.level, "concern");
  assert.ok(v.reasons.some((r) => r.startsWith("medical_claim:")));
});

test("scanMedicalClaims 命中诊断词", () => {
  assert.ok(scanMedicalClaims("我诊断你确诊了").length >= 2);
});

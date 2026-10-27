// 예시 문장과 규칙 기반 문장의 숫자가 모두 엔진 계산값과 맞는지 확인한다.
// 실행: node tools/test_narratives.mjs
import { readFileSync } from 'node:fs';
import { prepare, verify, robustness, baseSensitivity } from '../assets/js/engine.js';
import { ruleNarrative, replyLetter, allowedNumbers, checkNumbers, narrativeTexts } from '../assets/js/narrative.js';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const data = prepare(read('data/market.json'), read('data/passthrough.json'));
const findings = read('data/findings.json');
const narr = read('data/narratives.json');
let bad = 0;
for (const c of read('data/cases.json')) {
  const res = verify(data, c);
  const rb = robustness(data, c);
  const sens = baseSensitivity(data, c);
  const claims = findings.claims.filter((k) => k.keys.some((key) => c.items.some((it) => it.key === key)));
  const allowed = allowedNumbers(c, res, { rb, sens, claims });
  const pre = checkNumbers(narrativeTexts(narr[c.id]), allowed);
  const rule = ruleNarrative(c, res, { rb, sens });
  const ruleChk = checkNumbers(narrativeTexts(rule), allowed);
  const letter = checkNumbers([replyLetter(c, res)], allowed);
  console.log(c.id, 'pre', pre.ok, pre.count, pre.offenders.join(' '), '| rule', ruleChk.ok, ruleChk.offenders.join(' '), '| letter', letter.ok, letter.offenders.join(' '));
  if (!pre.ok || !ruleChk.ok || !letter.ok) bad += 1;
  if (c.id === 'S1') {
    console.log('--- rule narrative S1 ---');
    console.log(narrativeTexts(rule).join('\n'));
    console.log('--- reply S1 ---');
    console.log(replyLetter(c, res));
  }
}
// 담당자 개입·정책 변경·복수 자재 조합에서도 규칙 기반 문장의 숫자가 엔진 값과 맞는지
const scenarios = [
  { name: 'idx override', ov: { indexRate: { value: 0.25, reason: 't' } } },
  { name: 'decision override', ov: { decision: { value: 'fast', reason: 't' } } },
  { name: 'applied override', ov: { appliedRate: { value: 0.2, reason: 't' } } },
  { name: 'all overrides', ov: { indexRate: { value: 0.31, reason: 't' }, decision: { value: 'explain', reason: 't' }, appliedRate: { value: 0.123, reason: 't' } } },
  { name: 'policy 4.5/2.2', policy: { tolerancePp: 0.045, explainMultiple: 2.2 } },
  { name: 'evidence', patch: { evidenceRate: 0.33 } },
  { name: 'linked', patch: { linked: true, linkRatio: 0.8, linkThreshold: 0.05 } },
  { name: 'multi', patch: { items: [{ key: 'paint_water', weight: 0.7 }, { key: 'pur_foam', weight: 0.3 }] } },
  { name: 'delay', patch: { delayMonths: 2 } },
];
for (const c of read('data/cases.json')) {
  for (const sc of scenarios) {
    const req = { ...c, ...(sc.patch || {}) };
    const policy = { ...(sc.policy || {}) };
    const res = verify(data, req, policy, sc.ov || {});
    if (!res.ok) { console.log(c.id, sc.name, 'invalid', res.issues); continue; }
    const rb = robustness(data, req, sc.ov || {});
    const sens = baseSensitivity(data, req, policy);
    const claims = findings.claims.filter((k) => k.keys.some((key) => req.items.some((it) => it.key === key)));
    const allowed = allowedNumbers(req, res, { rb, sens, claims });
    const rule = checkNumbers(narrativeTexts(ruleNarrative(req, res, { rb, sens })), allowed);
    const letter = checkNumbers([replyLetter(req, res)], allowed);
    if (!rule.ok || !letter.ok) { bad += 1; console.log('FAIL', c.id, sc.name, rule.offenders, letter.offenders); }
  }
}
console.log(bad ? `FAILED ${bad}` : 'ALL NUMBERS CHECKED');
process.exit(bad ? 1 : 0);

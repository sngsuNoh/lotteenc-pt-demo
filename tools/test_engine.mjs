// 웹 엔진(assets/js/engine.js)이 Python 검증 도구와 같은 결과를 내는지 확인한다.
// 실행: node tools/test_engine.mjs   (저장소 루트에서)
import { readFileSync } from 'node:fs';
import { prepare, verify, robustness } from '../assets/js/engine.js';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const data = prepare(read('data/market.json'), read('data/passthrough.json'));
const cases = read('data/cases.json');

const csv = readFileSync(new URL('analysis/outputs/verification/verification_summary.csv', root), 'utf8').replace(/^﻿/, '');
const lines = csv.trim().split('\n');
const header = lines[0].split(',');
const col = (name) => header.indexOf(name);
const py = {};
for (const line of lines.slice(1)) {
  const cells = line.split(',');
  const id = cells[0].split('_')[0];
  py[id] = {
    decision: cells[col('decision')],
    index_pct: Number(cells[col('index_pct')]),
    requested_amount: Number(cells[col('requested_amount')]),
    eligible_cost: Number(cells[col('eligible_cost')]),
    recognized_now: Number(cells[col('recognized_now')]),
    recognized_max: Number(cells[col('recognized_max')]),
  };
}
const label = { fast: '신속 반영', explain: '소명 요청', deep: '정밀 검증', reject: '기각 · 하락 반영 검토' };
let fail = 0;
for (const c of cases) {
  const r = verify(data, c);
  const p = py[c.id];
  const checks = [
    ['decision', label[r.decision], p.decision],
    ['index_pct', Math.round(r.indexRate * 1000) / 10, p.index_pct],
    ['requested', Math.round(r.requestedAmount), p.requested_amount],
    ['eligible', Math.round(r.eligible), p.eligible_cost],
    ['now', Math.round(r.recognizedNow), p.recognized_now],
    ['max', Math.round(r.recognizedMax), p.recognized_max],
  ];
  for (const [k, a, b] of checks) {
    const ok = typeof a === 'number' ? Math.abs(a - b) <= 1 : a === b;
    if (!ok) fail += 1;
    console.log(`${c.id} ${k.padEnd(10)} web=${a}  python=${b}  ${ok ? 'OK' : 'MISMATCH'}`);
  }
  const rb = robustness(data, c);
  console.log(`${c.id} robustness same=${rb.same}/${rb.total} ->`, rb.cells.map((x) => x.decision).join(','));
}
const total = cases.reduce((s, c) => s + verify(data, c).recognizedNow, 0);
const req = cases.reduce((s, c) => s + verify(data, c).requestedAmount, 0);
console.log('합계 요청', Math.round(req), '우선 인정', Math.round(total));
console.log(fail ? `FAILED ${fail}` : 'ALL MATCH');
process.exit(fail ? 1 : 0);

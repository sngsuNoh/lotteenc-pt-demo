// 보고서 문장. 예시 2건은 Claude가 미리 쓴 문장을, 직접 입력한 요청은 규칙 기반 문장을 쓴다.
// 어느 쪽이든 문장 속 숫자는 엔진 계산값과 대조한다(숫자 가드레일).
import { pct, pp, times, won, ym, day, num } from './format.js';
import { DECISIONS, POLICY_GRID } from './engine.js';

export function itemsLabel(res) {
  const rows = res.facts.rows;
  if (rows.length === 1) return rows[0].material;
  return `${rows[0].material} 외 ${rows.length - 1}종`;
}

// 받침에 따라 '으로/로'를 붙인다(받침 ㄹ은 '로').
export function ro(word) {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return `${word}(으)로`;
  const jong = (ch - 0xac00) % 28;
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`;
}

export function ruleNarrative(req, res, ctx) {
  const d = res.decision;
  const item = itemsLabel(res);
  const idx = pct(res.indexRate);
  const reqp = pct(res.requested);
  const s = res.schedule;
  const tol = res.policy.tolerancePp;
  const mult = res.policy.explainMultiple;
  const band = res.facts.band;
  const rows = res.facts.rows;
  const ov = res.overridden || [];
  const ovIdx = ov.includes('indexRate');
  const ovDec = ov.includes('decision');
  const ovApp = ov.includes('appliedRate');
  const idxName = ovIdx ? '담당자가 확인한 상승률' : '지표 상승률';
  const nowText = ovApp
    ? `담당자가 정한 적용 상승률 ${pct(res.rateNow)}로 ${won(res.recognizedNow)}을`
    : `지표만큼인 ${won(res.recognizedNow)}을`;

  let headline;
  if (ovDec) headline = `자동 판정은 ${DECISIONS[res.autoDecision].label}이지만 담당자 판단으로 ${ro(DECISIONS[d].label)} 처리합니다. 우선 인정액은 ${won(res.recognizedNow)}입니다.`;
  else if (d === 'fast') headline = `요청 ${reqp}가 ${idxName} ${idx}에 허용오차 ${pp(tol)}를 더한 범위 안이어서 신속 반영합니다. 잔여 물량 기준 ${won(res.recognizedNow)}을 인정합니다.`;
  else if (d === 'explain') headline = `요청 ${reqp}가 ${idxName} ${idx}를 넘지만 그 ${times(mult)} 안이어서, ${nowText} 먼저 인정하고 초과분은 증빙을 받아 판단합니다.`;
  else if (d === 'deep') headline = `요청 ${reqp}가 ${idxName} ${idx}의 ${times(mult)}를 넘어 정밀 검증합니다. ${nowText} 먼저 인정합니다.`;
  else if (d === 'reject') headline = `비교 기간에 ${ovIdx ? '담당자가 확인한 상승률이' : '지표가'} ${idx} 변해 증액 근거가 없습니다. 서면으로 회신하고 하락분 감액을 협의합니다.`;
  else if (d === 'linked') headline = `연동 약정 산식에 따라 ${idxName} ${idx}에 반영 비율 ${pct(req.linkRatio)}를 적용해 ${won(res.recognizedNow)}을 인정합니다.`;
  else headline = `연동 약정의 조정 요건(${pct(req.linkThreshold)})에 못 미쳐 이번에는 조정하지 않습니다. 필요하면 조정 협의로 전환합니다.`;

  const summary = [
    `${req.partner || '파트너사'} 측은 ${item} 재료비 ${won(req.materialCost)}에 대해 ${reqp}(${won(res.requestedAmount)}) 증액을 요청했습니다.`,
    ovIdx
      ? `같은 기간(${ym(req.baseMonth)} → ${ym(res.comp)}) 공표 지표는 ${pct(res.autoIndexRate, { sign: true })}였고, 담당자가 확인한 상승률 ${idx}를 적용했습니다. 파트너사가 제시한 증액률 ${reqp}와 ${pp(Math.abs(res.gapPp))} 차이가 납니다.`
      : res.indexRate >= 0
        ? `같은 기간(${ym(req.baseMonth)} → ${ym(res.comp)}) 공표 지표는 ${idx} 올라, 파트너사가 제시한 증액률 ${reqp}와 ${pp(Math.abs(res.gapPp))} 차이가 납니다.`
        : `같은 기간(${ym(req.baseMonth)} → ${ym(res.comp)}) 공표 지표는 ${pct(Math.abs(res.indexRate))} 내렸습니다.`,
    res.recognizedNow > 0
      ? `기성 ${pct(req.progressDone || 0)}와 선매입·선급금 ${pct(res.excl)}를 뺀 조정 대상 재료비 ${won(res.eligible)}에 ${pct(res.rateNow)}${ovApp ? '(담당자 조정)' : ''}를 적용해 ${won(res.recognizedNow)}을 우선 인정합니다.${res.recognizedMax > res.recognizedNow ? ` 소명되면 최대 ${won(res.recognizedMax)}까지 인정합니다.` : ''}`
      : `조정 대상 재료비는 ${won(res.eligible)}이지만 적용할 상승률이 없어 인정액은 0원입니다.`,
  ];

  const basis = rows.map((r) => `공표 지표: ${r.name} ${num(r.v0)}(${ym(req.baseMonth)}) → ${num(r.v1)}(${ym(res.comp)}), ${pct(r.rate, { sign: true })}${rows.length > 1 ? `, 비중 ${pct(r.weight, { d: 0 })}` : ''}`);
  if (band) basis.push(`원료(${band.inputs.join('·')}) 가격 변동으로 설명 가능한 범위: ${pct(band.lo)} ~ ${pct(band.hi)}. ${res.requested > band.hi ? `요청 ${reqp}는 이 범위를 넘습니다.` : `요청 ${reqp}는 이 범위 안입니다.`}`);
  basis.push(`판정 규칙: 요청이 지표 + ${pp(tol)} 이하면 신속 반영, 지표의 ${times(mult)} 이하면 소명 요청, 그보다 크면 정밀 검증입니다.`);
  if (ctx && ctx.rb) {
    basis.push(ctx.rb.same === ctx.rb.total
      ? `정책 변수 ${ctx.rb.total}개 조합 모두에서 같은 판정입니다.`
      : `정책 변수 ${ctx.rb.total}개 조합 중 ${ctx.rb.same}개에서 같은 판정이고, 나머지는 판정이 바뀌는 경계 사례입니다.`);
  }

  const risks = [];
  if (d === 'deep' || d === 'explain') {
    risks.push('생산자물가지수는 전국 평균 출하가라, 규격·물량·지역 차이는 실매입 증빙으로 확인합니다.');
    risks.push('원료 외 요인(에너지·운송·수급)이 있는지 원가 구성 소명을 받습니다. 편승 여부는 단정하지 않습니다.');
  }
  if (d === 'fast' || d === 'linked') risks.push('가격이 내리면 같은 산식으로 감액해야 하므로, 하락 시 감액 조항을 합의서에 적습니다.');
  if (d === 'reject') risks.push('파트너사가 에너지·운송 등 다른 원가 상승을 주장할 수 있어 해당 지표도 함께 확인합니다.');
  const ovNames = [ovDec && '판정', ovIdx && '지표 상승률', ovApp && '적용 상승률'].filter(Boolean);
  if (ovNames.length) risks.push(`자동 계산값과 다르게 정한 항목(${ovNames.join(', ')})은 사유를 결재 문서에 남기고, 다음 점검월에 다시 확인합니다.`);
  const sens = ctx && ctx.sens ? ctx.sens.filter((x) => x.rate !== null && x.decision && x.decision !== d) : [];
  if (sens.length) {
    const x = sens[0];
    risks.push(`기준월을 ${ym(x.base)}로 잡으면 지표가 ${pct(x.rate)}가 되어 판정이 ${ro(DECISIONS[x.decision].label)} 바뀝니다. 기준월은 계약월 또는 직전 조정월로 고정합니다.`);
  }

  const negotiation = [
    '같은 지표와 산식을 공개해, 파트너사가 인정액 계산을 직접 확인하게 합니다.',
    '추가 자료는 해당 품목의 세금계산서·거래명세서로 한정하고, 다른 경영정보는 요구하지 않습니다(하도급법 제18조).',
    '가격이 내리면 같은 산식으로 감액한다는 조항을 합의서에 넣습니다.',
  ];

  const next = [];
  if (s) next.push(`${day(s.consultBy)}까지 협의를 시작하고 1차 판정 결과를 서면으로 알립니다.`);
  if (d === 'deep' || d === 'explain') next.push('소명 자료를 받으면 롯데건설의 같은 규격 직접 구매 단가와 대조합니다.');
  if (s) next.push(`${day(s.decideBy)}까지 결론을 내고, 합의하지 못하면 분쟁조정 절차를 안내합니다.`);

  return { headline, summary, basis, risks, negotiation, next, author: 'rule' };
}

export function replyLetter(req, res) {
  const item = itemsLabel(res);
  const s = res.schedule;
  const lines = [];
  lines.push(`${req.partner || '파트너사'} 귀중`);
  lines.push('');
  lines.push(`귀사가 ${s ? day(s.received) : '접수일'}에 요청하신 ${item} 자재비 조정(요청 ${pct(res.requested)})에 대해 1차 검토 결과를 알려 드립니다.`);
  lines.push('');
  lines.push(`1. 판정: ${res.decisionInfo.label}`);
  lines.push(`2. 우선 인정액: ${won(res.recognizedNow)} (조정 대상 재료비 ${won(res.eligible)} × ${pct(res.rateNow)})`);
  const ppiText = `한국은행 생산자물가지수(${res.facts.rows.map((r) => r.name).join(', ')}) ${ym(req.baseMonth)} → ${ym(res.comp)} ${pct(res.autoIndexRate, { sign: true })}`;
  lines.push((res.overridden || []).includes('indexRate')
    ? `3. 산정 기준: 확인한 상승률 ${pct(res.indexRate, { sign: true })}(참고: ${ppiText}), 기성·선매입·선급금분 제외`
    : `3. 산정 기준: ${ppiText}, 기성·선매입·선급금분 제외`);
  if (res.decision === 'deep' || res.decision === 'explain') {
    lines.push(`4. 추가 검토: 초과분은 해당 품목의 세금계산서·거래명세서를 받아 검토하며, 최대 ${won(res.recognizedMax)}까지 인정할 수 있습니다. 받은 자료는 이 협의에만 사용합니다.`);
  } else if (res.decision === 'reject') {
    lines.push('4. 추가 검토: 다음 점검월에 지표가 오르면 같은 산식으로 다시 반영합니다.');
  } else {
    lines.push('4. 합의 사항: 기준월, 지표, 산식, 다음 점검월을 합의서에 적고, 지표가 내리면 같은 산식으로 조정합니다.');
  }
  if (s) lines.push(`5. 일정: ${day(s.consultBy)}까지 협의를 시작하며, ${day(s.decideBy)}까지 결론을 낼 예정입니다.`);
  lines.push('');
  lines.push('외주구매 담당 드림(데모)');
  return lines.join('\n');
}

// ---------------------------------------------------------------- 숫자 가드레일
const TOKEN = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const norm = (t) => t.replace(/,/g, '');

function addTokens(set, text) {
  if (text === null || text === undefined) return;
  const m = String(text).match(TOKEN);
  if (m) m.forEach((t) => set.add(norm(t)));
}

export function allowedNumbers(req, res, ctx = {}) {
  const set = new Set();
  // 법령 조문 번호, 일수, 월, 작은 개수
  for (let i = 0; i <= 31; i += 1) set.add(String(i));
  ['64', '90', '100', '2025', '2026', '2027'].forEach((v) => set.add(v));
  POLICY_GRID.tolerances.forEach((t) => addTokens(set, pp(t)));
  POLICY_GRID.multiples.forEach((m) => { set.add(m.toFixed(1)); addTokens(set, times(m)); });
  const P = res.policy;
  const vals = [
    pct(res.indexRate), pct(Math.abs(res.indexRate)), pct(res.requested), pp(Math.abs(res.gapPp)), times(res.multiple),
    pct(res.autoIndexRate), pct(Math.abs(res.autoIndexRate)), pct(res.autoRateNow),
    req.linked ? pct(req.linkRatio) : '', req.linked ? pct(req.linkThreshold) : '',
    pct(res.rateNow), pct(res.rateMax), pct(res.excl), pct(res.share), pct(res.remaining), pct(req.progressDone || 0),
    pct(req.prepurchased || 0), pct(req.advanceFunded || 0),
    won(res.recognizedNow), won(res.recognizedMax), won(res.requestedAmount), won(res.eligible), won(req.materialCost),
    pp(P.tolerancePp), times(P.explainMultiple), pct(res.indexRate + P.tolerancePp), pct(res.indexRate * P.explainMultiple),
    ym(req.baseMonth), ym(res.comp), req.baseMonth, res.comp,
  ];
  res.bridge.forEach((b) => vals.push(won(b.value), won(Math.abs(b.value))));
  res.facts.rows.forEach((r) => {
    vals.push(num(r.v0), num(r.v1), pct(r.rate), pct(Math.abs(r.rate)), pct(r.weight, { d: 0 }));
    if (r.band) vals.push(pct(r.band.lo), pct(r.band.mid), pct(r.band.hi), pct(r.band.inputRise), pct(Math.abs(r.band.inputRise)), pct(Math.abs(r.band.lo)), pct(Math.abs(r.band.hi)));
  });
  if (res.facts.band) vals.push(pct(res.facts.band.lo), pct(res.facts.band.hi), pct(Math.abs(res.facts.band.lo)), pct(Math.abs(res.facts.band.hi)));
  if (res.schedule) Object.values(res.schedule).forEach((v) => vals.push(v, day(v)));
  if (ctx.rb) vals.push(String(ctx.rb.same), String(ctx.rb.total), String(ctx.rb.total - ctx.rb.same));
  if (ctx.sens) ctx.sens.forEach((x) => { if (x.rate !== null) vals.push(pct(x.rate), ym(x.base)); });
  if (ctx.claims) ctx.claims.forEach((c) => vals.push(String(c.lo), String(c.hi)));
  vals.forEach((v) => addTokens(set, v));
  return set;
}

export function checkNumbers(texts, allowed) {
  const offenders = [];
  let count = 0;
  texts.forEach((t) => {
    const m = String(t).match(TOKEN) || [];
    m.forEach((tok) => {
      count += 1;
      if (!allowed.has(norm(tok))) offenders.push(tok);
    });
  });
  return { ok: offenders.length === 0, offenders, count };
}

export function narrativeTexts(n) {
  return [n.headline, ...n.summary, ...n.basis, ...n.risks, ...n.negotiation, ...n.next];
}

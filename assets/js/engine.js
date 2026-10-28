// 자재비 증액 요청 검증 엔진.
// analysis/src/verify_tool.py의 규칙을 그대로 옮겼다. 숫자는 모두 여기서 만든다.

export const DEFAULT_POLICY = {
  tolerancePp: 0.03,     // 신속 반영 허용오차: 지표 + 3%p
  explainMultiple: 1.5,  // 소명 요청 상한: 지표 × 1.5
  consultDays: 10,       // 하도급법 제16조의2: 신청일부터 10일 안에 협의 개시
  decideDays: 30,        // 30일 안에 합의하지 못하면 분쟁조정 신청 가능 → 결론 목표
};

export const DECISIONS = {
  fast: {
    label: '신속 반영',
    rule: '요청 ≤ 지표 + 허용오차',
    action: '요청액을 인정합니다. 합의서에 기준월, 지표, 산식, 다음 점검월, 하락 시 감액을 적습니다.',
  },
  explain: {
    label: '소명 요청',
    rule: '요청 ≤ 지표 × 소명배수',
    action: '지표만큼 먼저 인정하고, 초과분은 해당 품목의 세금계산서·거래명세서를 받아 추가로 인정합니다.',
  },
  deep: {
    label: '정밀 검증',
    rule: '그 밖의 경우',
    action: '지표만큼 먼저 인정하고, 초과분은 원가 구성 소명, 복수 견적, 직접 구매 단가로 대조한 뒤 판단합니다.',
  },
  reject: {
    label: '기각·하락 검토',
    rule: '지표 ≤ 0',
    action: '지표가 오르지 않아 증액 근거가 없습니다. 성실히 협의한 뒤 서면으로 회신하고, 하락분 감액을 협의합니다.',
  },
  linked: {
    label: '연동 산식 적용',
    rule: '연동 약정이 있고 조정 요건 충족',
    action: '약정한 산식대로 조정하고 다음 조정 주기를 확인합니다.',
  },
  linked_unmet: {
    label: '연동 요건 미충족',
    rule: '연동 약정이 있으나 조정 요건 미달',
    action: '약정 조정 요건에 못 미칩니다. 필요하면 하도급법 제16조의2 조정 협의로 전환합니다.',
  },
};

export const POLICY_GRID = { tolerances: [0.02, 0.03, 0.05], multiples: [1.3, 1.5, 2.0] };

// ---------------------------------------------------------------- 날짜·월
export function shiftMonth(ym, months) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) - months;
  const yy = Math.floor(t / 12);
  const mm = t - yy * 12 + 1;
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

export function addMonths(ym, n) {
  return shiftMonth(ym, -n);
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function monthRange(a, b) {
  const out = [];
  let cur = a;
  let guard = 0;
  while (cur <= b && guard < 400) {
    out.push(cur);
    cur = addMonths(cur, 1);
    guard += 1;
  }
  return out;
}

// ---------------------------------------------------------------- 데이터 접근
export function prepare(market, passthrough) {
  const monthIndex = {};
  market.months.forEach((m, i) => { monthIndex[m] = i; });
  return { ...market, monthIndex, passthrough };
}

export function idx(data, key, ym) {
  const s = data.series[key];
  const i = data.monthIndex[ym];
  if (!s || i === undefined) return null;
  const v = s.values[i];
  return v === null || v === undefined ? null : v;
}

export function seriesName(data, key) {
  const s = data.series[key];
  return s ? s.short : key;
}

// 원료 가격 변동(대표 경로)으로 설명 가능한 상승률 범위. 원료가 기간 중 올랐으면 고점까지의 상승을, 아니면 비교월 변화를 쓴다.
export function explainedBand(data, item, base, comp) {
  const x = data.primaryInput[item];
  if (!x) return null;
  const row = data.passthrough.find((r) => r.input === x && r.output === item);
  if (!row) return null;
  const i0 = idx(data, x, base);
  const ic = idx(data, x, comp);
  if (!i0 || !ic) return null;
  const win = monthRange(base, comp).map((m) => idx(data, x, m)).filter((v) => v !== null);
  const wmax = Math.max(...win);
  const lx = wmax > i0 ? Math.log(wmax / i0) : Math.log(ic / i0);
  const up = lx > 0;
  const b = up ? row.up_cum : row.down_cum;
  const lo = up ? row.up_lo90 : row.down_lo90;
  const hi = up ? row.up_hi90 : row.down_hi90;
  let eLo = Math.exp(lo * lx) - 1;
  const eMid = Math.exp(b * lx) - 1;
  let eHi = Math.exp(hi * lx) - 1;
  if (eLo > eHi) [eLo, eHi] = [eHi, eLo];
  return {
    input: x,
    inputName: seriesName(data, x),
    inputRise: Math.exp(lx) - 1,
    upward: up,
    elasticity: b,
    lo: eLo,
    mid: eMid,
    hi: eHi,
    pair: row.pair,
  };
}

// ---------------------------------------------------------------- 판정
export function decide(indexRate, requestedRate, policy, req) {
  let code;
  if (indexRate <= 0) code = 'reject';
  else if (requestedRate <= indexRate + policy.tolerancePp) code = 'fast';
  else if (requestedRate <= Math.max(indexRate * policy.explainMultiple, indexRate + policy.tolerancePp)) code = 'explain';
  else code = 'deep';
  if (req && req.linked) {
    code = Math.abs(indexRate) >= (req.linkThreshold || 0) ? 'linked' : 'linked_unmet';
  }
  return code;
}

function normWeights(items) {
  const total = items.reduce((s, it) => s + (Number(it.weight) > 0 ? Number(it.weight) : 0), 0);
  if (total <= 0) return items.map(() => 1 / Math.max(items.length, 1));
  return items.map((it) => (Number(it.weight) > 0 ? Number(it.weight) : 0) / total);
}

export function indexFacts(data, req, base, comp) {
  const weights = normWeights(req.items);
  const rows = req.items.map((it, i) => {
    const key = it.indexKey || it.key;
    const v0 = idx(data, key, base);
    const v1 = idx(data, key, comp);
    const rate = v0 && v1 ? v1 / v0 - 1 : null;
    const band = explainedBand(data, key, base, comp);
    return { key: it.key, indexKey: key, name: seriesName(data, key), material: seriesName(data, it.key), weight: weights[i], v0, v1, rate, band };
  });
  const valid = rows.every((r) => r.rate !== null);
  const rate = valid ? rows.reduce((s, r) => s + r.weight * r.rate, 0) : null;
  const allBands = rows.every((r) => r.band);
  const band = valid && allBands
    ? {
        lo: rows.reduce((s, r) => s + r.weight * r.band.lo, 0),
        mid: rows.reduce((s, r) => s + r.weight * r.band.mid, 0),
        hi: rows.reduce((s, r) => s + r.weight * r.band.hi, 0),
        inputs: [...new Set(rows.map((r) => r.band.inputName))],
      }
    : null;
  return { rows, rate, band, valid };
}

export function validate(data, req) {
  const issues = [];
  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  if (!req.items || !req.items.length) issues.push('자재를 하나 이상 고르세요.');
  if (!(Number(req.materialCost) > 0)) issues.push('계약 재료비를 입력하세요.');
  if (!(req.requestedRate > -1)) issues.push('요청 상승률을 입력하세요.');
  if (!req.baseMonth || !req.compareMonth) issues.push('기준월과 비교월을 고르세요.');
  else {
    const comp = shiftMonth(req.compareMonth, req.delayMonths || 0);
    if (req.baseMonth < first || comp > last) issues.push(`지표는 ${first}부터 ${last}까지 있습니다.`);
    if (comp <= req.baseMonth) issues.push('비교월은 기준월보다 뒤여야 합니다.');
  }
  const share = (1 - (req.progressDone || 0)) * (1 - (req.prepurchased || 0) - (req.advanceFunded || 0));
  if (share < 0) issues.push('기성·선매입·선급금 비율의 합이 100%를 넘습니다.');
  return issues;
}

// overrides: { indexRate: {value, reason}, decision: {value, reason}, appliedRate: {value, reason} }
export function verify(data, req, policy = DEFAULT_POLICY, overrides = {}) {
  const issues = validate(data, req);
  if (issues.length) return { ok: false, issues };
  const P = { ...DEFAULT_POLICY, ...policy };
  const comp = shiftMonth(req.compareMonth, req.delayMonths || 0);
  const facts = indexFacts(data, req, req.baseMonth, comp);
  if (!facts.valid) return { ok: false, issues: ['선택한 기간에 지표 값이 없는 자재가 있습니다.'] };

  const autoIndexRate = facts.rate;
  const indexRate = overrides.indexRate ? overrides.indexRate.value : autoIndexRate;
  const requested = Number(req.requestedRate);
  const autoDecision = decide(indexRate, requested, P, req);
  const decision = overrides.decision ? overrides.decision.value : autoDecision;

  // 범위
  const done = Number(req.progressDone) || 0;
  const pre = Number(req.prepurchased) || 0;
  const adv = Number(req.advanceFunded) || 0;
  const remaining = 1 - done;
  const excl = pre + adv;
  const share = remaining * (1 - excl);
  const cost = Number(req.materialCost);
  const eligible = cost * share;

  // 산정
  let autoRateNow;
  if (decision === 'linked') autoRateNow = indexRate * (req.linkRatio ?? 1);
  else if (decision === 'fast') autoRateNow = requested;
  else if (decision === 'reject' || decision === 'linked_unmet') autoRateNow = 0;
  else autoRateNow = indexRate;
  let rateMax = autoRateNow;
  if (decision === 'explain' || decision === 'deep') {
    const cap = requested;
    const ev = req.evidenceRate;
    rateMax = ev !== null && ev !== undefined && ev !== ''
      ? Math.min(cap, Math.max(indexRate + P.tolerancePp, Number(ev)))
      : Math.min(cap, indexRate + P.tolerancePp);
  }
  const rateNow = overrides.appliedRate ? overrides.appliedRate.value : autoRateNow;
  const recognizedNow = eligible * rateNow;
  const recognizedMax = eligible * Math.max(rateMax, rateNow);
  const requestedAmount = cost * requested;

  const bridge = [
    { key: 'req', label: '요청액', note: `재료비 × ${fmtPct(requested)}`, value: requestedAmount, kind: 'total' },
    { key: 'done', label: '기성분 제외', note: `기성 ${fmtPct(done, 0)}`, value: -cost * done * requested, kind: 'delta' },
    { key: 'stock', label: '선매입·선급금 제외', note: `잔여분의 ${fmtPct(excl, 0)}`, value: -cost * remaining * excl * requested, kind: 'delta' },
    { key: 'index', label: '지표 기준 조정', note: `${fmtPct(requested)} → ${fmtPct(rateNow)}`, value: eligible * (rateNow - requested), kind: 'delta' },
    { key: 'ok', label: '우선 인정액', note: DECISIONS[decision].label, value: recognizedNow, kind: 'end' },
  ];

  const schedule = req.received
    ? { received: req.received, consultBy: addDays(req.received, P.consultDays), decideBy: addDays(req.received, P.decideDays) }
    : null;

  const warnings = [];
  if (req.restrictClause) warnings.push('계약서의 조정 신청 제한 조항은 부당특약으로 볼 수 있어(하도급법 시행령 제6조의4 제4호), 그 조항을 근거로 협의를 거절하지 않습니다.');
  if (!req.subcontract) warnings.push('하도급법 조정 협의 대상이 아닐 수 있어, 구매계약 조건에 따라 협의하고 상생협약의 신속 조정 기준을 준용합니다.');
  if (req.delayMonths) warnings.push(`파트너사 귀책 지연 ${req.delayMonths}개월: 비교월을 원래 공정 시점인 ${Number(comp.slice(0, 4))}년 ${Number(comp.slice(5, 7))}월로 당겨 계산했습니다.`);
  if (facts.band && requested > facts.band.hi && indexRate > 0) warnings.push('요청이 원료 가격 변동으로 설명 가능한 범위의 상단을 넘습니다. 원가 구성 소명을 받아야 합니다.');
  if (facts.band && autoIndexRate > facts.band.hi + 0.005) warnings.push('품목 지표 자체가 원료 가격 변동으로 설명 가능한 범위보다 더 올랐습니다. 원료 외 요인(에너지·운송·수급)을 함께 봅니다.');

  return {
    ok: true,
    comp,
    facts,
    autoIndexRate,
    indexRate,
    requested,
    gapPp: requested - indexRate,
    multiple: indexRate > 0 ? requested / indexRate : null,
    autoDecision,
    decision,
    decisionInfo: DECISIONS[decision],
    policy: P,
    remaining,
    excl,
    share,
    eligible,
    autoRateNow,
    rateNow,
    rateMax: Math.max(rateMax, rateNow),
    recognizedNow,
    recognizedMax,
    requestedAmount,
    bridge,
    schedule,
    warnings,
    track: req.linked
      ? '연동 약정 산식 우선(하도급법 제3조)'
      : req.subcontract
        ? '하도급법 제16조의2 조정 협의(10일 안에 협의 개시, 30일 안에 미합의 시 분쟁조정 가능)'
        : '구매계약 조건에 따른 단가 협의(상생협약의 비상시기 신속 조정 기준 준용)',
    overridden: Object.keys(overrides).filter((k) => overrides[k]),
  };
}

export function robustness(data, req, overrides = {}) {
  const out = [];
  for (const tol of POLICY_GRID.tolerances) {
    for (const mult of POLICY_GRID.multiples) {
      const ov = overrides.indexRate ? { indexRate: overrides.indexRate } : {};
      const r = verify(data, req, { ...DEFAULT_POLICY, tolerancePp: tol, explainMultiple: mult }, ov);
      out.push({ tol, mult, decision: r.ok ? r.decision : null });
    }
  }
  const base = out.find((c) => c.tol === DEFAULT_POLICY.tolerancePp && c.mult === DEFAULT_POLICY.explainMultiple);
  const same = out.filter((c) => c.decision === base.decision).length;
  return { cells: out, same, total: out.length, baseDecision: base.decision };
}

export function baseSensitivity(data, req, policy = DEFAULT_POLICY) {
  const offsets = [-8, -5, -2, 0];
  const comp = shiftMonth(req.compareMonth, req.delayMonths || 0);
  return offsets.map((o) => {
    const base = addMonths(req.baseMonth, o);
    const facts = indexFacts(data, req, base, comp);
    if (!facts.valid || base >= comp) return { base, rate: null, decision: null, offset: o };
    return { base, rate: facts.rate, decision: decide(facts.rate, Number(req.requestedRate), { ...DEFAULT_POLICY, ...policy }, req), offset: o };
  });
}

// 엔진 안에서만 쓰는 짧은 서식(보고서 서식은 format.js)
function fmtPct(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  const s = Math.abs(v * 100).toFixed(d).replace(/\.0+$/, '');
  return `${v < 0 ? '−' : ''}${s}%`;
}

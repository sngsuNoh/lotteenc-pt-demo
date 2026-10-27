// 데이터 로드와 검증 세션(입력·정책·담당자 개입 기록) 관리.
import { prepare, verify, robustness, baseSensitivity, DEFAULT_POLICY } from './engine.js';
import { ruleNarrative, replyLetter, allowedNumbers, checkNumbers, narrativeTexts } from './narrative.js';
import { todayISO } from './format.js';

export const S = { ready: false };

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}을(를) 불러오지 못했습니다(${r.status}).`);
  return r.json();
}

export async function loadAll() {
  const [market, passthrough, cases, narr, findings, laws, meta] = await Promise.all([
    getJSON('data/market.json'),
    getJSON('data/passthrough.json'),
    getJSON('data/cases.json'),
    getJSON('data/narratives.json'),
    getJSON('data/findings.json'),
    getJSON('data/laws.json'),
    getJSON('data/meta.json'),
  ]);
  S.data = prepare(market, passthrough);
  S.cases = cases;
  S.narr = narr;
  S.findings = findings;
  S.laws = laws;
  S.meta = meta;
  S.ready = true;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const sessions = {};
const CUSTOM_KEY = 'lotteenc-pt-demo.custom.v1';

function readLocal(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function writeLocal(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장소를 못 쓰면 메모리에만 둔다 */ }
}
function removeLocal(key) {
  try { window.localStorage.removeItem(key); } catch (e) { /* 무시 */ }
}

export function lastMonth() {
  return S.data.months[S.data.months.length - 1];
}

export function defaultCustom() {
  return {
    id: 'new',
    title: '직접 입력한 요청',
    partner: '',
    channel: 'outsourced',
    subcontract: true,
    site: '',
    items: [{ key: 'paint_water', weight: 1 }],
    materialCost: 100000000,
    baseMonth: '2026-02',
    compareMonth: lastMonth(),
    requestedRate: 0.15,
    reason: '원자재 가격 상승',
    progressDone: 0,
    prepurchased: 0,
    advanceFunded: 0,
    linked: false,
    linkRatio: 1,
    linkThreshold: 0.05,
    restrictClause: false,
    delayMonths: 0,
    evidenceRate: null,
    received: todayISO(),
    note: '',
  };
}

function fresh(id) {
  if (id === 'new') {
    return { id, req: defaultCustom(), policy: { ...DEFAULT_POLICY }, overrides: {}, reasons: {}, audit: [], base: null };
  }
  const c = S.cases.find((x) => x.id === id);
  if (!c) return null;
  return { id, req: clone(c), policy: { ...DEFAULT_POLICY }, overrides: {}, reasons: {}, audit: [], base: clone(c) };
}

export function getSession(id) {
  if (sessions[id]) return sessions[id];
  let s = fresh(id);
  if (!s) return null;
  if (id === 'new') {
    const saved = readLocal(CUSTOM_KEY);
    if (saved && saved.req && Array.isArray(saved.req.items) && saved.req.items.length) {
      s = {
        ...s,
        req: { ...s.req, ...saved.req },
        policy: { ...DEFAULT_POLICY, ...(saved.policy || {}) },
        overrides: saved.overrides || {},
        reasons: saved.reasons || {},
        audit: saved.audit || [],
      };
    }
  }
  sessions[id] = s;
  return s;
}

export function saveSession(s) {
  if (s.id !== 'new') return;
  writeLocal(CUSTOM_KEY, { req: s.req, policy: s.policy, overrides: s.overrides, reasons: s.reasons, audit: s.audit });
}

export function resetSession(id) {
  delete sessions[id];
  if (id === 'new') removeLocal(CUSTOM_KEY);
  return getSession(id);
}

export function logAudit(s, entry) {
  s.audit.push({ at: new Date().toISOString(), ...entry });
  saveSession(s);
}

export function hasChanges(s) {
  return !isPristine(s);
}

export function isPristine(s) {
  if (!s.base) return false;
  if (Object.keys(s.overrides).some((k) => s.overrides[k])) return false;
  if (s.policy.tolerancePp !== DEFAULT_POLICY.tolerancePp || s.policy.explainMultiple !== DEFAULT_POLICY.explainMultiple) return false;
  return JSON.stringify(s.req) === JSON.stringify(s.base);
}

export function claimsFor(req) {
  return S.findings.claims.filter((k) => k.keys.some((key) => req.items.some((it) => it.key === key)));
}

// 화면과 보고서가 함께 쓰는 계산 묶음
export function compute(s) {
  const res = verify(S.data, s.req, s.policy, s.overrides);
  if (!res.ok) return { ok: false, issues: res.issues };
  const rb = robustness(S.data, s.req, s.overrides);
  const sens = baseSensitivity(S.data, s.req, s.policy);
  const pristine = isPristine(s);
  const pre = pristine ? S.narr[s.id] : null;
  const narrative = pre ? { ...pre, author: 'claude' } : ruleNarrative(s.req, res, { rb, sens });
  const allowed = allowedNumbers(s.req, res, { rb, sens, claims: claimsFor(s.req) });
  const guard = checkNumbers(narrativeTexts(narrative), allowed);
  const letter = replyLetter(s.req, res);
  const guardLetter = checkNumbers([letter], allowed);
  return { ok: true, res, rb, sens, narrative, guard, letter, guardLetter, pristine };
}

// 예시 원본 5건의 결과(목록·합계용, 화면에서 바꾼 값과 무관)
let originals = null;
export function originalResults() {
  if (originals) return originals;
  originals = S.cases.map((c) => ({ c, res: verify(S.data, c) }));
  return originals;
}

export function caseTitle(s) {
  if (s.id === 'new') return '직접 입력한 요청';
  return s.base ? s.base.title : s.req.title;
}

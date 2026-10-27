// 첫 화면: 도구 소개와 예시 두 건(판정 도장).
import { S, originalResults } from '../store.js';
import { stampHTML } from '../ui.js';
import { esc, pct, won } from '../format.js';

export const title = () => '';

// 요청 전표. opts.label이 있으면 머리말로 쓰고, 없으면 '자재 + 자재비 조정 요청'
export function slipHTML(c, res, opts = {}) {
  const item = res.facts.rows.map((r) => r.material).join(', ');
  const label = opts.label || `${item} 자재비 조정 요청`;
  const href = opts.href || `#/check/${c.id}`;
  return `<a class="slip" href="${esc(href)}" aria-label="${esc(`${label}, ${c.partner}, ${pct(c.requestedRate)} 인상 요청, 판정 ${res.decisionInfo.label}`)}">
    <span class="slip-kind">${esc(label)}</span>
    <span class="slip-partner">${esc(c.partner)}</span>
    <span class="slip-req">${esc(pct(c.requestedRate))}<small>인상 요청</small></span>
    <span class="slip-facts">지표 <b>${esc(pct(res.indexRate, { sign: true }))}</b><br>우선 인정 <b>${esc(won(res.recognizedNow))}</b></span>
    ${stampHTML(res.decision, { land: !!opts.land, delay: opts.delay || 0 })}
  </a>`;
}

export function footHTML() {
  const m = S.meta;
  return `<p class="foot">${esc(m.version)}<br>${esc(m.dataNote)}</p>`;
}

export function creditHTML() {
  const m = S.meta;
  return `<p class="notice">${esc(m.author)}<br>${esc(m.dataDisclaimer)}</p>
    ${footHTML()}`;
}

export function render(page) {
  const all = originalResults();
  const pick = (id) => all.find((x) => x.c.id === id);
  const a = pick('S1');
  const b = pick('S4');
  const label = (n, x) => `예시 ${n}: ${x.res.facts.rows.map((r) => r.material).join(', ')} 자재비 조정 요청`;
  page.innerHTML = `
    <section class="hero">
      <h1 class="hero-title"><span class="hero-pre">파트너사 상생과 원가 경쟁력 확보를 실현하는</span><span class="hero-main">자재비 인상 요청<br>검토 자동화 도구</span></h1>
      <p class="hero-lead">파트너사의 자재비 증액 요청을 한국은행 생산자물가지수와 원가 구조로 검증합니다.<br>각 단계별 담당자 판단에 의한 조정 후 검토 보고서로 결과를 확인합니다.</p>
      <div class="hero-slips">
        ${slipHTML(a.c, a.res, { label: label(1, a), land: true, delay: 450 })}
        ${slipHTML(b.c, b.res, { label: label(2, b), land: true, delay: 900 })}
      </div>
      <div class="btn-col">
        <a class="btn btn--primary" href="#/check/S1">예시 요청 검증해 보기</a>
        <a class="btn btn--secondary" href="#/check/new">직접 입력해 검증하기</a>
      </div>
    </section>
    ${creditHTML()}`;
}

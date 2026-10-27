// 첫 화면: 같은 40% 요청 두 장에 도장이 찍힌다.
import { S, originalResults } from '../store.js';
import { stampHTML, ICON } from '../ui.js';
import { esc, pct, won } from '../format.js';

export const title = () => '';

export function slipHTML(c, res, opts = {}) {
  const item = res.facts.rows.map((r) => r.material).join(', ');
  const href = opts.href || `#/check/${c.id}`;
  return `<a class="slip" href="${esc(href)}" aria-label="${esc(`${c.partner} ${item} ${pct(c.requestedRate)} 요청, 판정 ${res.decisionInfo.label}`)}">
    <span class="slip-kind" aria-hidden="true">자재비 조정 요청</span>
    <span class="slip-partner">${esc(c.partner)}</span>
    <span class="slip-item">${esc(item)}</span>
    <span class="slip-req">${esc(pct(c.requestedRate))}<small>인상 요청</small></span>
    <span class="slip-facts">지표 <b>${esc(pct(res.indexRate, { sign: true }))}</b><br>우선 인정 <b>${esc(won(res.recognizedNow))}</b></span>
    ${stampHTML(res.decision, { land: !!opts.land, delay: opts.delay || 0 })}
  </a>`;
}

export function render(page) {
  const all = originalResults();
  const s1 = all.find((x) => x.c.id === 'S1');
  const s2 = all.find((x) => x.c.id === 'S2');
  const m = S.meta;
  const totalReq = all.reduce((a, x) => a + x.res.requestedAmount, 0);
  const totalOk = all.reduce((a, x) => a + x.res.recognizedNow, 0);
  page.innerHTML = `
    <section class="hero">
      <h1 class="hero-title">같은 40% 요청,<br>결론은 다릅니다</h1>
      <p class="hero-lead">파트너사의 자재비 증액 요청을 한국은행 생산자물가지수와 원가 구조로 검증합니다. 단계마다 담당자가 판단을 더하고, 끝나면 검토 보고서를 PDF로 받습니다.</p>
      <div class="hero-slips">
        ${slipHTML(s1.c, s1.res, { land: true, delay: 450 })}
        ${slipHTML(s2.c, s2.res, { land: true, delay: 900 })}
      </div>
      <div class="btn-col">
        <a class="btn btn--primary" href="#/check/S1">예시 요청 검증해 보기</a>
        <a class="btn btn--secondary" href="#/check/new">직접 입력해 검증하기</a>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">이 데모에서 볼 수 있는 것</h2>
      <ul class="feature-list section-body">
        <li><a href="#/cases"><span><b>예시 5건과 합계</b><span>요청 ${esc(won(totalReq))} 중 먼저 인정하는 ${esc(won(totalOk))}</span></span>${ICON.next}</a></li>
        <li><a href="#/slides"><span><b>발표자료</b><span>면접에서 발표한 PDF</span></span>${ICON.next}</a></li>
        <li><a href="#/laws"><span><b>관련 법령</b><span>하도급법·공정거래법 조문이 검증의 어느 단계에 쓰이는지</span></span>${ICON.next}</a></li>
        <li><a href="#/market"><span><b>2026년 지표</b><span>같은 유가 충격이 자재마다 0~66%로 갈린 과정</span></span>${ICON.next}</a></li>
        <li><a href="#/method"><span><b>방법과 한계</b><span>판정 규칙, 데이터, 숫자 검증 방식</span></span>${ICON.next}</a></li>
      </ul>
    </section>

    <p class="notice">${esc(m.disclaimer)}</p>
    <p class="foot">${esc(m.version)}<br>${esc(m.dataNote)}</p>`;
}

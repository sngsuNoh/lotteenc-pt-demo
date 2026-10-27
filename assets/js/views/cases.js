// 예시 5건: 같은 40% 두 건을 나란히, 나머지 세 건은 목록, 맨 아래 합계.
import { originalResults } from '../store.js';
import { slipHTML } from './home.js';
import { vchipHTML } from '../ui.js';
import { esc, pct, pp, won } from '../format.js';

export const title = () => '예시 5건';

export function render(page) {
  const all = originalResults();
  const byId = Object.fromEntries(all.map((x) => [x.c.id, x]));
  const s1 = byId.S1;
  const s2 = byId.S2;
  const rest = all.filter((x) => !['S1', 'S2'].includes(x.c.id));
  const totalReq = all.reduce((a, x) => a + x.res.requestedAmount, 0);
  const totalOk = all.reduce((a, x) => a + x.res.recognizedNow, 0);
  const totalMax = all.reduce((a, x) => a + x.res.recognizedMax, 0);

  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">예시 5건</h1>
      <p class="page-lead">요청과 파트너사는 모두 가상입니다. 지표는 한국은행이 공표한 실제 생산자물가지수입니다. 한 건을 누르면 검증 과정을 단계별로 볼 수 있습니다.</p>
    </div>

    <section class="section" style="margin-top:8px">
      <h2 class="section-title">같은 40% 요청, 반대 결론</h2>
      <p class="section-lead">두 단열재 파트너사가 같은 날 같은 40%를 요청했습니다. 품목 지표가 다르게 움직였기 때문에 결론이 갈립니다.</p>
      <div class="pair section-body">
        ${slipHTML(s1.c, s1.res)}
        ${slipHTML(s2.c, s2.res)}
      </div>
      <dl class="ledger" style="margin-top:14px">
        <dt>EPS 단열재: 요청과 지표 차이</dt><dd>${esc(pp(s1.res.gapPp))}</dd>
        <dt>우레탄 단열재: 요청과 지표 차이</dt><dd>${esc(pp(s2.res.gapPp))}</dd>
        <dt class="is-last">두 건 모두 조정 대상 재료비</dt><dd class="is-last">${esc(won(s1.res.eligible))}</dd>
      </dl>
    </section>

    <section class="section">
      <h2 class="section-title">나머지 세 건</h2>
      <ul class="caselist section-body">
        ${rest.map(({ c, res }) => `<li><a class="caserow" href="#/check/${esc(c.id)}">
          <span class="caserow-title">${esc(c.title)}</span>${vchipHTML(res.decision)}
          <span class="caserow-sub">${esc(c.partner)}, ${esc(c.channel === 'material' ? '직접 구매 자재' : '하도급')}<br>요청 <b>${esc(pct(c.requestedRate))}</b>, 지표 <b>${esc(pct(res.indexRate, { sign: true }))}</b>, 우선 인정 <b>${esc(won(res.recognizedNow))}</b></span>
        </a></li>`).join('')}
      </ul>
    </section>

    <section class="section">
      <h2 class="section-title">5건 합계</h2>
      <dl class="totals">
        <div><dt>요청액</dt><dd class="num">${esc(won(totalReq))}</dd></div>
        <div><dt>우선 인정</dt><dd class="num">${esc(won(totalOk))}</dd></div>
      </dl>
      <p class="section-lead" style="margin-top:12px">기성분과 선매입 재고를 뺀 잔여 물량에, 판정에 따라 요청률이나 지표 상승률을 적용해 먼저 인정한 금액입니다. 파트너사가 증빙으로 소명하면 최대 ${esc(won(totalMax))}까지 인정할 수 있습니다.</p>
      <div class="btn-col" style="margin-top:16px">
        <a class="btn btn--primary" href="#/check/S1">EPS 단열재 건부터 검증하기</a>
        <a class="btn btn--secondary" href="#/check/new">직접 입력해 검증하기</a>
      </div>
    </section>`;
}


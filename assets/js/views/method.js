// 사용방법: 검증 순서와 1차 판정 규칙을 쉽게 풀어 쓴다.
import { DEFAULT_POLICY } from '../engine.js';
import { esc, pp, times } from '../format.js';
import { vchipHTML } from '../ui.js';
import { creditHTML } from './home.js';

export const title = () => '사용방법';

export function render(page) {
  const tol = pp(DEFAULT_POLICY.tolerancePp);
  const mult = times(DEFAULT_POLICY.explainMultiple);
  const rules = [
    { code: 'fast', cond: `요청 상승률이 ‘지표 상승률 + 허용오차(${tol})’ 이하`, act: '요청액을 그대로 인정하고, 합의서에 기준월·지표·산식과 하락 시 감액 조항을 적습니다.' },
    { code: 'explain', cond: `요청 상승률이 ‘지표 상승률 × 소명 요청 배수(${mult})’ 이하`, act: '지표 상승률만큼 먼저 인정하고, 넘는 부분은 세금계산서·거래명세서를 받아 확인한 만큼 추가로 인정합니다.' },
    { code: 'deep', cond: '요청 상승률이 위 두 기준을 모두 넘음', act: '지표 상승률만큼 먼저 인정하고, 넘는 부분은 원가 구성 소명, 복수 견적, 직접 구매 단가와 대조해 판단합니다.' },
    { code: 'reject', cond: '지표 상승률이 0% 이하(요청 상승률과 관계없이)', act: '증액 근거가 없어 서면으로 회신하고, 지표가 내린 만큼의 감액을 협의합니다.' },
  ];
  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">사용방법</h1>
      <p class="page-lead">검증 도구의 사용 방법과 기능별 해석입니다.</p>
    </div>

    <section class="section" style="margin-top:8px">
      <h2 class="section-title">검증 순서</h2>
      <ol class="steps-list section-body">
        <li><b>접수</b><span>파트너사의 자재비 인상 요청으로부터 업체 정보, 자재, 재료비, 기준월과 비교월, 요청 상승률을 파악합니다.</span></li>
        <li><b>자격 검증</b><span>하도급과 직접 구매 등 거래의 형태, 연동 약정과 부당특약 여부를 검증한 후 협의 경로와 법정 기간을 제시합니다.</span></li>
        <li><b>가격 사실 검증</b><span>품목별 생산자물가지수, 원료 가격 변동, 실매입 증빙, 직접 구매 단가를 활용해 검증합니다.</span></li>
        <li><b>범위 검증</b><span>기성분, 선매입 재고, 선급금을 제외한 잔여 물량을 검증합니다.</span></li>
        <li><b>산정</b><span>판정에 따라 적용 상승률을 제시하고 우선 인정액과 최대 인정액을 산출합니다.</span></li>
      </ol>
    </section>

    <section class="section">
      <h2 class="section-title">1차 판정 규칙</h2>
      <p class="section-lead">파트너사가 요청한 상승률(요청 상승률)을 같은 기간 해당 품목의 생산자물가지수 상승률(지표 상승률)과 비교해 네 가지로 나눕니다.</p>
      <dl class="terms section-body">
        <div><dt>허용오차(기본 ${esc(tol)})</dt><dd>규격·지역 차이 등으로 생기는 작은 차이를 인정해 주는 여유폭입니다. 요청 상승률이 지표 상승률에 이 값을 더한 수준 이하이면 지표로 설명되는 요청으로 보고 바로 반영합니다.</dd></div>
        <div><dt>소명 요청 배수(기본 ${esc(mult)})</dt><dd>요청 상승률이 허용오차를 넘더라도 지표 상승률의 ${esc(mult)} 이하이면, 지표만큼 먼저 인정하고 넘는 부분만 증빙으로 확인합니다. ${esc(mult)}를 넘으면 정밀 검증합니다.</dd></div>
      </dl>
      <ul class="rulecards section-body">
        ${rules.map((r) => `<li data-v="${r.code}">${vchipHTML(r.code)}<p class="rule-cond">${esc(r.cond)}</p><p class="rule-act">${esc(r.act)}</p></li>`).join('')}
      </ul>
    </section>

    ${creditHTML()}`;
}

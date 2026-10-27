// 방법과 한계.
import { S } from '../store.js';
import { DECISIONS, DEFAULT_POLICY } from '../engine.js';
import { esc, pp, times } from '../format.js';
import { vchipHTML, repoURL } from '../ui.js';

export const title = () => '방법과 한계';

export function render(page) {
  const P = DEFAULT_POLICY;
  const repo = repoURL('/tree/main/analysis');
  const nSeries = Object.keys(S.data.series).length;
  const nMonths = S.data.months.length;
  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">방법과 한계</h1>
      <p class="page-lead">숫자는 검증 엔진이 계산하고, 문장은 그 숫자를 설명합니다. 어떤 문장이든 숫자는 엔진 값과 다시 대조합니다.</p>
    </div>

    <section class="section" style="margin-top:8px">
      <h2 class="section-title">검증 순서</h2>
      <ol class="steps-list section-body">
        <li><b>접수</b><span>파트너사, 자재, 재료비, 기준월과 비교월, 요청 상승률을 요청서에서 옮깁니다.</span></li>
        <li><b>자격 검증</b><span>하도급인지 직접 구매인지, 연동 약정과 부당특약이 있는지 보고 협의 경로와 법정 기한을 정합니다.</span></li>
        <li><b>가격 사실 검증</b><span>품목 생산자물가지수, 원료로 설명되는 범위, 실매입 증빙, 직접 구매 단가 순으로 대조합니다.</span></li>
        <li><b>범위 검증</b><span>기성분, 선매입 재고, 선급금으로 이미 산 물량을 빼고 남은 물량만 조정합니다.</span></li>
        <li><b>산정</b><span>판정에 따라 적용 상승률을 정하고, 우선 인정액과 소명 시 최대 인정액을 계산합니다.</span></li>
      </ol>
    </section>

    <section class="section">
      <h2 class="section-title">1차 판정 규칙</h2>
      <p class="section-lead">기본값은 허용오차 ${esc(pp(P.tolerancePp))}, 소명 요청 배수 ${esc(times(P.explainMultiple))}입니다. 검증 화면에서 바꿔 볼 수 있고, 9개 조합의 판정을 함께 보여 줍니다.</p>
      <ul class="rules section-body">
        ${['fast', 'explain', 'deep', 'reject'].map((k) => `<li data-v="${k}"><span>${vchipHTML(k)}</span><span><b>${esc(DECISIONS[k].rule)}</b><br><span class="ink2">${esc(DECISIONS[k].action)}</span></span></li>`).join('')}
      </ul>
      <p class="small ink2" style="margin-top:10px">정밀 검증도 지표만큼은 먼저 인정합니다. 근거가 있는 몫까지 늦추지 않기 위해서입니다.</p>
    </section>

    <section class="section">
      <h2 class="section-title">데이터</h2>
      <div class="prose section-body">
        <p>한국은행 경제통계시스템(ECOS) Open API에서 생산자물가지수 품목별 43개, 총지수와 화학제품 대분류, 수입물가 원유(원화 기준), 두바이유, 원/달러 환율까지 <b>${nSeries}개 시계열, ${nMonths}개월</b>을 받았습니다. 내려받은 값은 시계열마다 개수와 합계를 원본과 대조했습니다.</p>
        <p>생산자물가지수는 국내 출하가의 전국 평균입니다. 개별 계약의 규격, 물량, 지역 단가와 다를 수 있어 실매입 증빙으로 보완합니다. 2026년 7~9월 값은 잠정치라 바뀔 수 있습니다.</p>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">원료로 설명되는 범위</h2>
      <div class="prose section-body">
        <p>원료에서 중간재, 건자재로 이어지는 공정 경로 21개를 정하고, 2015년부터의 월별 자료로 원료가 오를 때와 내릴 때의 전이율을 따로 추정했습니다(시차 0~6개월, Newey-West 표준오차).</p>
        <p>요청 기간에 원료가 오른 폭에 상승 전이율의 90% 신뢰구간을 곱해, 품목 가격이 원료만으로 오를 수 있는 범위를 냅니다. 요청이 이 범위를 넘으면 원가 구성 소명을 받습니다. 지표 자체가 범위를 넘으면 에너지, 운송, 수급 같은 원료 밖 요인을 함께 봅니다.</p>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">문장과 숫자</h2>
      <div class="prose section-body">
        <p>예시 5건의 보고서 문장은 Claude가 엔진 결과를 보고 미리 썼습니다. 직접 입력하거나 예시 값을 바꾸면 규칙 기반 문장으로 바뀝니다.</p>
        <p>어느 쪽이든 문장에서 숫자를 모두 뽑아 엔진 계산값, 날짜, 정책 변수와 대조합니다. 맞지 않는 숫자가 있으면 보고서에 표시합니다. 보고서 하단의 숫자 확인 문구가 그 결과입니다.</p>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">한계</h2>
      <ul class="rlist section-body">
        <li>전이율은 원료 하나를 기준으로 한 모형입니다. 에너지, 운송비, 인건비 같은 다른 원가는 따로 보지 않았습니다.</li>
        <li>허용오차와 소명 요청 배수는 예시값입니다. 실제로는 과거 조정 이력으로 보정해야 합니다.</li>
        <li>요청 사례와 파트너사는 모두 가상입니다. 롯데건설의 내부 자료는 쓰지 않았습니다.</li>
        <li>법령 요지는 참고용이며 법률 자문이 아닙니다.</li>
      </ul>
    </section>

    <section class="section">
      <h2 class="section-title">코드</h2>
      <div class="prose section-body">
        <p>분석과 검증 엔진의 Python 원본, 원자료, 결과 표는 이 사이트 저장소의 analysis 폴더에 있습니다. 화면의 검증 엔진은 그 규칙을 자바스크립트로 옮긴 것이고, 예시 5건에서 Python 결과와 원 단위까지 같은지 확인했습니다.</p>
        ${repo ? `<p><a href="${esc(repo)}" target="_blank" rel="noopener">GitHub에서 analysis 폴더 보기</a></p>` : ''}
      </div>
    </section>

    <p class="notice">${esc(S.meta.disclaimer)}</p>
    <p class="foot">${esc(S.meta.version)}<br>${esc(S.meta.dataNote)}<br>서체: IBM Plex Sans KR(SIL Open Font License). 라이브러리: PDF.js(Apache 2.0), jsPDF·html2canvas(MIT).</p>`;
}

// 2026년 건설자재 가격 지표: 자재별 단가 변화, 상승·하락 전이율 비대칭, 자재별 가격 변동.
import { S } from '../store.js';
import { idx, seriesName } from '../engine.js';
import { esc, pct, ym, num } from '../format.js';
import { barList, dumbbell, lineChart } from '../charts.js';
import { footHTML } from './home.js';

export const title = () => '2026년 건설자재 가격 지표';

const CONTEXT = ['crude_imp_krw', 'naphtha'];
const MATERIAL_GROUPS = ['petro_material', 'other_material'];

export function render(page, params, ctx) {
  const D = S.data;
  const F = S.findings;
  const shock = F.shock;
  const g = (k) => (D.series[k] ? D.series[k].group : '');

  const ctxRows = CONTEXT.map((k) => shock.find((x) => x.key === k)).filter(Boolean);
  const matRows = shock.filter((x) => MATERIAL_GROUPS.includes(g(x.key))).sort((a, b) => b.peak_rise_pct - a.peak_rise_pct);
  const top = matRows[0];
  const minRise = matRows[matRows.length - 1].peak_rise_pct;
  const crude = shock.find((x) => x.key === 'crude_imp_krw');
  const toRow = (x, isCtx) => ({
    name: seriesName(D, x.key),
    value: x.peak_rise_pct / 100,
    dot: x.sep_vs_feb_pct / 100,
    ctx: isCtx,
    detail: `고점 ${ym(x.peak_month)}. 고점 뒤 ${x.retrace_pct === null ? '-' : `${x.retrace_pct}%`} 되돌림. 9월은 2월 대비 ${pct(x.sep_vs_feb_pct / 100, { sign: true })}.`,
  });

  const pairs = S.data.passthrough.filter((r) => r.stage === '석유화학 계열 건자재').slice().sort((a, b) => b.up_cum - a.up_cum);
  const dumbRows = pairs.map((r) => ({
    name: seriesName(D, r.output),
    sub: `${seriesName(D, r.input)}에서`,
    up: r.up_cum,
    down: r.down_cum,
    detail: `상승 전이율 ${num(r.up_cum)}, 하락 전이율 ${num(r.down_cum)}. ${r.asymmetry_robust ? '시차와 표본을 바꿔도 비대칭이 유지됩니다.' : '비대칭이 강건하지는 않습니다.'}`,
  }));

  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">2026년 건설자재 가격 지표</h1>
      <p class="page-lead">한국은행 공표 데이터를 수집 및 시각화했습니다.</p>
    </div>

    <section class="section" style="margin-top:8px">
      <h2 class="section-title">유가 상승으로 인한 자재별 단가 변화</h2>
      <p class="section-lead">2026년 2월 대비 원유 수입물가(원화 기준)와 자재별 생산자물가의 최고 상승폭(막대), 9월 현재 수준(점)입니다. 원유가 최고 ${esc(pct(crude.peak_rise_pct / 100))} 오르는 동안 자재별 상승폭은 ${esc(pct(minRise / 100))}에서 ${esc(pct(top.peak_rise_pct / 100))}까지 크게 달랐습니다.</p>
      <div class="sheet section-body">
        <ul class="legend"><li><span class="sw sw--bar" style="background:var(--series-champ)"></span>2월 대비 최고 상승폭</li><li><span class="sw sw--bar" style="background:var(--series-ctx)"></span>원유·나프타(참고)</li><li><span class="sw sw--dot" style="background:var(--series-1)"></span>9월 수준</li></ul>
        <div data-shock></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">가격 상승과 하락의 전이율 비대칭</h2>
      <p class="section-lead">원료 가격이 1% 변화한 시점부터 6개월 간 제품 가격의 변동 전이율을 시각화했습니다.<br>상승 시 전이율이 하락 시 전이율보다 대체로 크게 나타나므로 하락 국면을 반영하는 장치의 필요성을 확인했습니다.</p>
      <div class="sheet section-body">
        <ul class="legend"><li><span class="sw sw--dot" style="background:var(--series-1)"></span>상승 전이율</li><li><span class="sw sw--dot" style="background:var(--series-dark)"></span>하락 전이율</li></ul>
        <div data-dumb></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">자재별 가격 변동 확인하기</h2>
      <p class="section-lead">자재·원료 등 48개 지표 각각의 가격 변동을 시각화했습니다. 공표 지수는 2020년=100입니다.</p>
      <div class="sheet section-body">
        <div class="explorer-controls">
          <label class="field" style="margin-top:0"><span class="field-label">지표</span><select class="select" data-pick>${Object.entries(S.data.groups).map(([gk, gl]) => `<optgroup label="${esc(gl)}">${Object.entries(D.series).filter(([, sr]) => sr.group === gk).map(([k, sr]) => `<option value="${esc(k)}"${k === 'eps_foam' ? ' selected' : ''}>${esc(sr.short)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <div class="seg" role="group" aria-label="기간"><button type="button" data-span="short" aria-pressed="true">2024년부터</button><button type="button" data-span="all" aria-pressed="false">전체</button></div>
        </div>
        <div class="stat-row" data-stats></div>
        <div data-explorer></div>
      </div>
    </section>
    ${footHTML()}`;

  barList(page.querySelector('[data-shock]'), [...ctxRows.map((x) => toRow(x, true)), ...matRows.map((x) => toRow(x, false))], { fmt: (v) => pct(v, { d: 1 }) });
  dumbbell(page.querySelector('[data-dumb]'), dumbRows, { fmt: (v) => num(v) });

  let span = 'short';
  let key = 'eps_foam';
  let dispose = null;
  const stats = page.querySelector('[data-stats]');
  const box = page.querySelector('[data-explorer]');
  function drawExplorer() {
    if (dispose) dispose();
    const months = span === 'all' ? D.months : D.months.filter((m) => m >= '2024-01');
    const sr = D.series[key];
    const values = months.map((m) => idx(D, key, m));
    const last = D.months[D.months.length - 1];
    const feb = idx(D, key, '2026-02');
    const now = idx(D, key, last);
    let peakM = '2026-02';
    D.months.filter((m) => m >= '2026-02').forEach((m) => { const v = idx(D, key, m); if (v !== null && v > (idx(D, key, peakM) ?? -Infinity)) peakM = m; });
    stats.innerHTML = `<span>${esc(ym(last))} <b>${esc(now === null ? '-' : num(now))}</b></span><span>2026년 2월 대비 <b>${esc(feb && now ? pct(now / feb - 1, { sign: true }) : '-')}</b></span><span>2월 이후 고점 <b>${esc(ym(peakM))}</b></span>`;
    const febAt = months.indexOf('2026-02');
    dispose = lineChart(box, {
      months,
      series: [{ name: sr.short, values, color: 'series-1', width: 2, endLabel: false }],
      marks: febAt >= 0 ? [{ at: febAt, label: '2026년 2월' }] : [],
      height: 220,
      yFmt: (t) => String(Math.round(t)),
      tipFmt: (v) => `${num(v)}${sr.unit && sr.unit !== '2020=100' ? ` ${sr.unit}` : ''}`,
      table: true,
      legend: false,
      caption: `${sr.name}, 단위 ${sr.unit}, ECOS 코드 ${sr.code}.`,
      aria: `${sr.short} 추이`,
    });
  }
  page.querySelector('[data-pick]').addEventListener('change', (e) => { key = e.target.value; drawExplorer(); });
  page.querySelectorAll('[data-span]').forEach((b) => b.addEventListener('click', () => {
    span = b.dataset.span;
    page.querySelectorAll('[data-span]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawExplorer();
  }));
  drawExplorer();
  ctx.onCleanup(() => { if (dispose) dispose(); });
}

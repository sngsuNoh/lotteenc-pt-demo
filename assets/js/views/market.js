// 2026년 지표: 충격의 분산, 비대칭 전이, 2차 유가 상승, 지표 찾아보기.
import { S } from '../store.js';
import { idx, seriesName } from '../engine.js';
import { esc, pct, ym, num } from '../format.js';
import { barList, dumbbell, lineChart } from '../charts.js';

export const title = () => '2026년 지표';

const FOCUS = ['eps_foam', 'pur_foam', 'paint_oil', 'ascon', 'plastic_pipe'];
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
  const bottomNames = matRows.filter((x) => x.peak_rise_pct === minRise).map((x) => seriesName(D, x.key)).join('·');
  const crude = shock.find((x) => x.key === 'crude_imp_krw');
  const toRow = (x, isCtx) => ({
    name: seriesName(D, x.key),
    value: x.peak_rise_pct / 100,
    dot: x.sep_vs_feb_pct / 100,
    ctx: isCtx,
    focus: FOCUS.includes(x.key),
    detail: `고점 ${ym(x.peak_month)}. 고점 뒤 ${x.retrace_pct === null ? '-' : `${x.retrace_pct}%`} 되돌림. 9월은 2월 대비 ${pct(x.sep_vs_feb_pct / 100, { sign: true })}.`,
  });

  const pairs = S.data.passthrough.filter((r) => r.stage === '석유화학 계열 건자재').slice().sort((a, b) => b.up_cum - a.up_cum);
  const ref = S.data.passthrough.find((r) => r.output === 'naphtha');
  const dumbRows = [ref, ...pairs].filter(Boolean).map((r) => ({
    name: seriesName(D, r.output),
    sub: `${seriesName(D, r.input)}에서`,
    up: r.up_cum,
    down: r.down_cum,
    detail: `상승 전이율 ${num(r.up_cum)}, 하락 전이율 ${num(r.down_cum)}. ${r.asymmetry_robust ? '시차와 표본을 바꿔도 비대칭이 유지됩니다.' : '비대칭이 강건하지는 않습니다.'}`,
  }));

  const wave = F.secondWave.map((x) => ({
    name: seriesName(D, x.key),
    value: x.jul_to_sep_pct / 100,
    ctx: !MATERIAL_GROUPS.includes(g(x.key)),
    detail: `7월 → 9월 ${pct(x.jul_to_sep_pct / 100, { sign: true })}, 2월 → 9월 ${pct(x.feb_to_sep_pct / 100, { sign: true })}.`,
  }));
  const waveMat = wave.filter((w) => !w.ctx).map((w) => w.value);
  const dubai = F.secondWave.find((x) => x.key === 'dubai');

  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">2026년 지표</h1>
      <p class="page-lead">검증 기준이 된 한국은행 공표 지표입니다. 막대나 행을 누르면 자세한 값이 나옵니다.</p>
    </div>

    <section class="section" style="margin-top:8px">
      <h2 class="section-title">같은 유가 충격, 자재마다 다른 상승</h2>
      <p class="section-lead">원유(원화 수입물가)는 2026년 2월보다 최고 ${esc(pct(crude.peak_rise_pct / 100))} 올랐지만, 건자재는 ${esc(bottomNames)} ${esc(pct(minRise / 100))}부터 ${esc(seriesName(D, top.key))} ${esc(pct(top.peak_rise_pct / 100))}까지 갈렸습니다. 굵은 글씨는 예시 5건의 자재입니다.</p>
      <div class="sheet section-body">
        <ul class="legend"><li><span class="sw sw--bar" style="background:var(--series-1)"></span>2월 대비 고점 상승률</li><li><span class="sw sw--bar" style="background:var(--series-ctx)"></span>원유·나프타(참고)</li><li><span class="sw sw--dot" style="background:var(--ink)"></span>9월 수준</li></ul>
        <div data-shock></div>
        <p class="chart-cap">2026년 2월=0. 7~9월은 잠정치입니다.</p>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">오를 때는 크게, 내릴 때는 덜</h2>
      <p class="section-lead">원료가 1% 움직일 때 6개월 동안 제품 가격이 따라 움직인 정도입니다(2015~2026년 월별 회귀). 건자재는 오를 때의 전이율이 내릴 때보다 컸고, 원유에서 나프타로 가는 원자재 단계는 대칭에 가까웠습니다.</p>
      <div class="sheet section-body">
        <ul class="legend"><li><span class="sw sw--dot" style="background:var(--series-2)"></span>상승 전이율</li><li><span class="sw sw--dot" style="background:var(--series-1)"></span>하락 전이율</li></ul>
        <div data-dumb></div>
        <p class="chart-cap">값은 원료 1% 변화당 제품 변화(%). 하락 시 같은 산식으로 감액하는 조항이 필요한 이유입니다.</p>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">7~9월 유가 재상승은 아직 건자재에 오지 않았다</h2>
      <p class="section-lead">두바이유는 7월부터 9월까지 ${esc(pct(dubai.jul_to_sep_pct / 100, { sign: true }))} 다시 올랐지만, 건자재 지표는 ${esc(pct(Math.min(...waveMat), { sign: true }))}에서 ${esc(pct(Math.max(...waveMat), { sign: true }))} 사이였습니다. 2차 상승을 이유로 한 재요청은 지표로는 근거가 약합니다.</p>
      <div class="sheet section-body">
        <ul class="legend"><li><span class="sw sw--bar" style="background:var(--series-ctx)"></span>유가·원료·중간재</li><li><span class="sw sw--bar" style="background:var(--series-1)"></span>건자재</li></ul>
        <div data-wave></div>
        <p class="chart-cap">2026년 7월 대비 9월 변화. 잠정치입니다.</p>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">지표 찾아보기</h2>
      <p class="section-lead">48개 시계열 중 하나를 골라 볼 수 있습니다. 공표 지수는 2020년=100입니다.</p>
      <div class="sheet section-body">
        <div class="explorer-controls">
          <label class="field" style="margin-top:0"><span class="field-label">지표</span><select class="select" data-pick>${Object.entries(S.data.groups).map(([gk, gl]) => `<optgroup label="${esc(gl)}">${Object.entries(D.series).filter(([, sr]) => sr.group === gk).map(([k, sr]) => `<option value="${esc(k)}"${k === 'eps_foam' ? ' selected' : ''}>${esc(sr.short)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <div class="seg" role="group" aria-label="기간"><button type="button" data-span="short" aria-pressed="true">2024년부터</button><button type="button" data-span="all" aria-pressed="false">전체</button></div>
        </div>
        <div class="stat-row" data-stats></div>
        <div data-explorer></div>
      </div>
    </section>
    <p class="foot">${esc(S.meta.dataNote)}</p>`;

  barList(page.querySelector('[data-shock]'), [...ctxRows.map((x) => toRow(x, true)), ...matRows.map((x) => toRow(x, false))], { fmt: (v) => pct(v, { d: 1 }) });
  dumbbell(page.querySelector('[data-dumb]'), dumbRows, { fmt: (v) => num(v) });
  barList(page.querySelector('[data-wave]'), wave, { fmt: (v) => pct(v, { sign: true }) });

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

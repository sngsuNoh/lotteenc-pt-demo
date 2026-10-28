// 검토 보고서: 모바일에서 읽는 판과 A4 두 쪽(PDF·인쇄) 판. 파트너사 회신문도 만든다.
import { S, getSession, compute, caseTitle } from '../store.js';
import { idx, monthRange, addMonths } from '../engine.js';
import { esc, pct, won, ym, day, num, todayISO } from '../format.js';
import { stampHTML, ICON, toast } from '../ui.js';
import { lineChart, bridgeHTML } from '../charts.js';
import { robustHTML, sensHTML } from './check.js';
import { itemsLabel } from '../narrative.js';
import { exportPDF } from '../export.js';

export const title = (params) => `${params[0] || 'new'} 검토 보고서`;

const HOST = 'a4host';

function docInfo(s, r) {
  const today = todayISO();
  return {
    no: `검토 ${s.id === 'new' ? 'N' : s.id}-${today.replace(/-/g, '')}`,
    date: day(today),
    today,
    partner: s.req.partner || '파트너사',
    item: itemsLabel(r.res),
    site: s.req.site || '',
  };
}

function listHTML(items, cls = 'rlist') {
  return `<ul class="${cls}">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

function kpisHTML(res) {
  const more = res.recognizedMax > res.recognizedNow + 1;
  return `<dl class="kpis">
    <div class="kpi"><dt>요청액</dt><dd>${esc(won(res.requestedAmount))}</dd></div>
    <div class="kpi"><dt>지표 상승률</dt><dd>${esc(pct(res.indexRate, { sign: true }))} <small>요청 ${esc(pct(res.requested))}</small></dd></div>
    <div class="kpi"><dt>우선 인정액</dt><dd>${esc(won(res.recognizedNow))}</dd></div>
    <div class="kpi"><dt>소명 시 최대</dt><dd>${more ? esc(won(res.recognizedMax)) : '<small>추가 인정 없음</small>'}</dd></div>
  </dl>`;
}

function scheduleHTML(res) {
  if (!res.schedule) return '<p class="ink2">접수일이 없어 일정을 계산하지 않았습니다.</p>';
  const sc = res.schedule;
  return `<dl class="ledger">
    <dt>접수</dt><dd>${esc(day(sc.received))}</dd>
    <dt>협의 개시 기한</dt><dd>${esc(day(sc.consultBy))}</dd>
    <dt class="is-last">결론 목표</dt><dd class="is-last">${esc(day(sc.decideBy))}</dd>
  </dl>`;
}

function auditHTML(s, limit = 0) {
  if (!s.audit.length) return '<p class="ink2">담당자가 바꾼 값이 없습니다. 모든 수치는 자동 계산값입니다.</p>';
  const list = s.audit.slice();
  const shown = limit ? list.slice(-limit) : list;
  const more = list.length - shown.length;
  return `<ul class="rlist">${shown.map((a) => `<li>${esc(a.step)}: ${esc(a.what)} ${esc(a.from)} → ${esc(a.to)}. 사유: ${esc(a.reason)}</li>`).join('')}${more > 0 ? `<li>그 밖에 ${more}건은 검증 화면의 개입 기록에 있습니다.</li>` : ''}</ul>`;
}

function guardHTML(g, author) {
  const who = author === 'claude'
    ? '문장은 Claude가 이 예시의 엔진 결과를 보고 미리 썼습니다.'
    : '문장은 입력값으로 만든 규칙 기반 문장입니다.';
  if (g.ok) {
    return `<p class="guard">${ICON.check}<span>숫자 확인: 문장 속 숫자 ${g.count}개가 모두 검증 엔진 계산값과 일치합니다. ${esc(who)}</span></p>`;
  }
  return `<p class="guard is-bad">${ICON.alert}<span>숫자 확인: 엔진 계산값과 맞지 않는 숫자 ${g.offenders.length}개(${esc(g.offenders.join(', '))})가 있습니다. 해당 문장을 고친 뒤 쓰세요. ${esc(who)}</span></p>`;
}

function chartCfg(s, res, opts = {}) {
  const row = res.facts.rows[0];
  const base = s.req.baseMonth;
  const comp = res.comp;
  let start = addMonths(base, -6);
  if (start < S.data.months[0]) start = S.data.months[0];
  const months = monthRange(start, comp);
  const v0 = idx(S.data, row.indexKey, base);
  const series = [{ name: `${row.name}(지표)`, color: 'series-1', width: 2.5, endLabel: true, values: months.map((m) => { const v = idx(S.data, row.indexKey, m); return v && v0 ? (v / v0) * 100 : null; }) }];
  if (row.band) {
    const x0 = idx(S.data, row.band.input, base);
    series.push({ name: `${row.band.inputName}(원료)`, color: 'series-ctx', width: 2, endLabel: true, values: months.map((m) => { const v = idx(S.data, row.band.input, m); return v && x0 ? (v / x0) * 100 : null; }) });
  }
  const at = months.length - 1;
  return {
    months,
    series,
    refs: [{ y: 100 * (1 + res.requested), label: `요청 ${pct(res.requested)}`, legend: '요청 수준' }],
    range: row.band ? { at, lo: 100 * (1 + row.band.lo), hi: 100 * (1 + row.band.hi), legend: '원료 가격 변동으로 설명 가능한 범위' } : null,
    marks: [{ at: months.indexOf(base), label: '기준월' }, { at, label: '비교월' }].filter((m) => m.at >= 0),
    height: opts.height || 210,
    yFmt: (t) => String(Math.round(t)),
    tipFmt: (v) => v.toFixed(1),
    endFmt: (sr, i) => pct(sr.values[i] / 100 - 1, { sign: true }),
    table: !!opts.table,
    tableFmt: (v) => (v === null || v === undefined ? '-' : v.toFixed(1)),
    caption: `기준월(${ym(base)})=100. 공표 지수(2020=100) ${row.name} ${num(row.v0)} → ${num(row.v1)}.${res.facts.rows.length > 1 ? ' 첫 번째 자재만 그렸습니다.' : ''}`,
    interactive: opts.interactive !== false,
    fixedWidth: opts.fixedWidth,
    aria: `${row.name} 지표 추이`,
  };
}

// ---------------------------------------------------------------- 모바일 판
function mobileInternal(s, r, info) {
  const { res, narrative: n } = r;
  return `<article class="rsheet">
    <div class="rsheet-meta"><span>${esc(info.no)}</span><span>${esc(info.date)} 작성</span></div>
    <h2 class="rsheet-title">자재비 증액 요청 검토 보고서</h2>
    <p class="rsheet-sub">${esc(info.partner)}, ${esc(info.item)}${info.site ? `<br>${esc(info.site)}` : ''}</p>
    <div class="verdict">${stampHTML(res.decision, { size: 'lg' })}<p class="verdict-text">${esc(n.headline)}</p></div>
    ${kpisHTML(res)}
    <section class="rsec"><h3 class="rsec-title">요약</h3>${listHTML(n.summary)}</section>
    <section class="rsec"><h3 class="rsec-title">인정액 산정</h3>${bridgeHTML(res)}</section>
    <section class="rsec"><h3 class="rsec-title">가격 근거</h3>${listHTML(n.basis)}<div data-chart="m" style="margin-top:14px"></div></section>
    <section class="rsec"><h3 class="rsec-title">판정 강건성</h3>${robustHTML(r.rb)}<div style="margin-top:14px">${sensHTML(r.sens)}</div></section>
    <section class="rsec"><h3 class="rsec-title">리스크와 대응</h3>${listHTML(n.risks)}</section>
    <section class="rsec"><h3 class="rsec-title">협상 방향</h3>${listHTML(n.negotiation)}</section>
    <section class="rsec"><h3 class="rsec-title">다음 단계</h3>${listHTML(n.next)}<div style="margin-top:10px">${scheduleHTML(res)}</div></section>
    <section class="rsec"><h3 class="rsec-title">담당자 개입 기록</h3>${auditHTML(s)}</section>
    <div class="rsec">${guardHTML(r.guard, n.author)}</div>
    <p class="notice" style="margin-top:18px">${esc(S.meta.reportDisclaimer)}</p>
  </article>`;
}

function mobileReply(s, r, info) {
  return `<article class="rsheet">
    <div class="rsheet-meta"><span>${esc(info.no)}</span><span>${esc(info.date)}</span></div>
    <h2 class="rsheet-title">자재비 조정 요청 검토 결과 회신</h2>
    <p class="rsheet-sub">파트너사에 보내는 1차 회신 초안입니다. 내부 협상 방향은 넣지 않았습니다.</p>
    <div class="letter" style="margin-top:16px">${esc(r.letter)}</div>
    <div class="rsec">${guardHTML(r.guardLetter, 'rule')}</div>
    <p class="notice" style="margin-top:18px">${esc(S.meta.reportDisclaimer)}</p>
  </article>`;
}

// ---------------------------------------------------------------- A4 판
function a4Head(info, kicker, titleText) {
  return `<header class="a4-head">
    <div><p class="a4-kicker">${esc(kicker)}</p><h1 class="a4-title">${esc(titleText)}</h1></div>
    <p class="a4-docno">${esc(info.no)}<br>${esc(info.date)}</p>
  </header>`;
}
function a4Foot(pageNo, total) {
  return `<footer class="a4-foot"><span>${esc(S.meta.reportDisclaimer)}</span><span>${pageNo} / ${total}</span></footer>`;
}

function a4Internal(s, r, info) {
  const { res, narrative: n } = r;
  const p1 = `<section class="a4" data-page="1"><div class="a4-body">
    ${a4Head(info, '내부 검토용(데모)', '자재비 증액 요청 검토 보고서')}
    <p class="rsheet-sub" style="margin-top:10px">${esc(info.partner)}, ${esc(info.item)}${info.site ? `, ${esc(info.site)}` : ''}. 요청 사유: ${esc(s.req.reason || '-')}</p>
    <div class="verdict">${stampHTML(res.decision, { size: 'lg' })}<p class="verdict-text">${esc(n.headline)}</p></div>
    ${kpisHTML(res)}
    <div class="a4-row">
      <div>
        <section class="a4-sec"><h2 class="a4-sec-title">요약</h2>${listHTML(n.summary)}</section>
        <section class="a4-sec"><h2 class="a4-sec-title">가격 근거</h2>${listHTML(n.basis)}</section>
        <section class="a4-sec"><h2 class="a4-sec-title">기준월 민감도</h2>${sensHTML(r.sens)}</section>
      </div>
      <div>
        <section class="a4-sec"><h2 class="a4-sec-title">인정액 산정</h2>${bridgeHTML(res)}</section>
        <section class="a4-sec"><h2 class="a4-sec-title">법정 일정과 협의 경로</h2>${scheduleHTML(res)}<p class="ink2" style="margin-top:6px">${esc(res.track)}</p></section>
      </div>
    </div>
  </div>${a4Foot(1, 2)}</section>`;
  const p2 = `<section class="a4" data-page="2"><div class="a4-body">
    <section class="a4-sec" style="margin-top:0"><h2 class="a4-sec-title">지표 추이</h2><div data-chart="a4"></div></section>
    <div class="a4-row">
      <div>
        <section class="a4-sec"><h2 class="a4-sec-title">판정 강건성</h2>${robustHTML(r.rb)}</section>
      </div>
      <div>
        <section class="a4-sec"><h2 class="a4-sec-title">리스크와 대응</h2>${listHTML(n.risks)}</section>
        <section class="a4-sec"><h2 class="a4-sec-title">협상 방향</h2>${listHTML(n.negotiation)}</section>
      </div>
    </div>
    <section class="a4-sec"><h2 class="a4-sec-title">다음 단계</h2>${listHTML(n.next)}</section>
    <section class="a4-sec"><h2 class="a4-sec-title">담당자 개입 기록</h2>${auditHTML(s, 5)}</section>
    <div class="a4-sec">${guardHTML(r.guard, n.author)}</div>
  </div>${a4Foot(2, 2)}</section>`;
  return p1 + p2;
}

function a4Reply(s, r, info) {
  return `<section class="a4" data-page="1"><div class="a4-body">
    ${a4Head(info, '파트너사 회신(데모)', '자재비 조정 요청 검토 결과 회신')}
    <div class="letter" style="margin-top:22px">${esc(r.letter)}</div>
  </div>${a4Foot(1, 1)}</section>`;
}

function fitPages(root) {
  root.querySelectorAll('.a4').forEach((pg) => {
    const body = pg.querySelector('.a4-body');
    const avail = 1123 - 50 - 62;
    pg.classList.remove('is-tight', 'is-tighter');
    if (body.getBoundingClientRect().height <= avail) return;
    pg.classList.add('is-tight');
    if (body.getBoundingClientRect().height <= avail) return;
    pg.classList.remove('is-tight');
    pg.classList.add('is-tighter');
  });
}

function buildA4(el, s, r, info, mode) {
  el.innerHTML = mode === 'reply' ? a4Reply(s, r, info) : a4Internal(s, r, info);
  const chartBox = el.querySelector('[data-chart="a4"]');
  if (chartBox) lineChart(chartBox, chartCfg(s, r.res, { fixedWidth: 678, interactive: false, height: 230 }));
  fitPages(el);
}

function safeName(t) {
  return String(t || '').replace(/\(주\)|㈜/g, '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24);
}

// ---------------------------------------------------------------- 화면
export function render(page, params, ctx) {
  const id = params[0] || 'new';
  const s = getSession(id);
  if (!s) {
    page.innerHTML = '<div class="empty"><p class="empty-title">없는 보고서입니다.</p><p><a href="#/">처음으로 돌아가기</a></p></div>';
    return;
  }
  const r = compute(s);
  if (!r.ok) {
    page.innerHTML = `<a class="backlink" href="#/check/${esc(id)}">${ICON.back}검증 화면</a><div class="empty"><p class="empty-title">아직 보고서를 만들 수 없습니다.</p><p>${esc(r.issues.join(' '))}</p></div>`;
    return;
  }
  const info = docInfo(s, r);
  let mode = params[1] === 'reply' ? 'reply' : 'internal';
  document.body.classList.add('has-a4');
  ctx.onCleanup(() => {
    document.body.classList.remove('has-a4');
    const host = document.getElementById(HOST);
    if (host) host.innerHTML = '';
  });

  page.innerHTML = `
    <a class="backlink" href="#/check/${esc(id)}">${ICON.back}검증 화면</a>
    <div class="page-head"><h1 class="page-title">검토 보고서</h1></div>
    <div class="report-tools">
      <div class="seg" role="group" aria-label="보고서 종류">
        <button type="button" data-mode="internal" aria-pressed="${mode === 'internal'}">내부 검토 보고서</button>
        <button type="button" data-mode="reply" aria-pressed="${mode === 'reply'}">파트너사 회신문</button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" data-act="pdf">${ICON.download}PDF 내려받기</button>
        <button type="button" class="btn btn--secondary" data-act="print">${ICON.print}인쇄</button>
      </div>
      <p class="small ink2" data-fallback hidden></p>
    </div>
    <div data-mobile></div>`;

  const mobile = page.querySelector('[data-mobile]');
  const host = document.getElementById(HOST);
  let disposer = null;

  function draw() {
    if (disposer) disposer();
    disposer = null;
    mobile.innerHTML = mode === 'reply' ? mobileReply(s, r, info) : mobileInternal(s, r, info);
    const box = mobile.querySelector('[data-chart="m"]');
    if (box) disposer = lineChart(box, chartCfg(s, r.res, { table: true }));
    buildA4(host, s, r, info, mode);
  }

  page.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.mode && t.dataset.mode !== mode) {
      mode = t.dataset.mode;
      page.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      draw();
    } else if (t.dataset.act === 'print') {
      window.print();
    } else if (t.dataset.act === 'pdf') {
      t.disabled = true;
      const kind = mode === 'reply' ? '회신문' : '검토보고서';
      const fname = `${kind}_${id === 'new' ? '직접입력' : id}_${safeName(info.partner)}_${info.today.replace(/-/g, '')}.pdf`;
      try {
        const url = await exportPDF(HOST, fname, { title: `${kind} ${caseTitle(s)}`, subject: '자재비 증액 요청 검토(데모, 가상 사례)' });
        const fb = page.querySelector('[data-fallback]');
        fb.innerHTML = `내려받기가 시작되지 않았다면 <a href="${url}" target="_blank" rel="noopener">PDF를 새 창에서 여세요</a>.`;
        fb.hidden = false;
      } catch (err) {
        console.error(err);
        toast('PDF를 만들지 못했습니다. 인쇄 버튼에서 PDF로 저장할 수 있습니다.', 5000);
      } finally {
        t.disabled = false;
      }
    }
  });

  draw();
  ctx.onCleanup(() => { if (disposer) disposer(); });
}

// 검증 화면: 접수 → 자격 → 가격 사실 → 범위 → 산정 → 결정. 담당자는 사유를 남기고 값을 바꿀 수 있다.
import { S, getSession, saveSession, resetSession, logAudit, compute, caseTitle } from '../store.js';
import { DECISIONS, DEFAULT_POLICY, idx, seriesName, monthRange, addMonths } from '../engine.js';
import { esc, pct, pp, times, won, ym, day, num } from '../format.js';
import { stampHTML, vchipHTML, ICON, debounce, toast } from '../ui.js';
import { lineChart, bridgeHTML } from '../charts.js';
import { ro } from '../narrative.js';

export const title = (params) => ((params[0] || 'new') === 'new' ? '직접 입력해 검증하기' : `${params[0]} 검증`);

// ---------------------------------------------------------------- 입력 도우미
function parseNum(str) {
  const t = String(str ?? '').replace(/[,\s%원개월]/g, '').replace(/−/g, '-');
  if (t === '' || t === '-' || t === '.') return NaN;
  return Number(t);
}
function pctInput(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return String(Math.round(v * 10000) / 100);
}
function wonInput(v) {
  if (!Number.isFinite(v)) return '';
  return Math.round(v).toLocaleString('ko-KR');
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function seriesOptions(groups, selected) {
  return groups.map((g) => {
    const opts = Object.entries(S.data.series)
      .filter(([, sr]) => sr.group === g)
      .map(([k, sr]) => `<option value="${esc(k)}"${k === selected ? ' selected' : ''}>${esc(sr.short)}</option>`)
      .join('');
    return `<optgroup label="${esc(S.data.groups[g])}">${opts}</optgroup>`;
  }).join('');
}
const MATERIAL_GROUPS = ['petro_material', 'other_material'];
const ALL_GROUPS = ['petro_material', 'other_material', 'mid', 'upstream', 'service', 'aggregate', 'driver'];

function monthOptions(selected) {
  const months = S.data.months.slice().reverse();
  const byYear = {};
  months.forEach((m) => { (byYear[m.slice(0, 4)] ||= []).push(m); });
  return Object.keys(byYear).sort().reverse().map((y) => `<optgroup label="${y}년">${byYear[y].map((m) => `<option value="${m}"${m === selected ? ' selected' : ''}>${esc(ym(m))}</option>`).join('')}</optgroup>`).join('');
}

function pctField(f, label, value, hint = '', unit = '%') {
  return `<label class="field"><span class="field-label">${esc(label)}</span><span class="affix"><input class="input" data-f="${f}" inputmode="decimal" autocomplete="off" value="${esc(pctInput(value))}"><span class="affix-unit">${unit}</span></span>${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}</label>`;
}

// 담당자 개입 패널(값 + 사유)
function ovrBlock(key, o) {
  const valueField = o.kind === 'pct'
    ? `<label class="field"><span class="field-label">${esc(o.valueLabel || '적용할 값')}</span><span class="affix"><input class="input" data-ovr-val inputmode="decimal" autocomplete="off"><span class="affix-unit">%</span></span></label>`
    : `<label class="field"><span class="field-label">${esc(o.valueLabel || '바꿀 값')}</span><select class="select" data-ovr-val>${o.options}</select></label>`;
  return `<div class="ovr" data-ovr="${esc(key)}">
    <div data-ovr-status="${esc(key)}"></div>
    <div class="override" data-ovr-panel="${esc(key)}" hidden>
      <p class="override-title">${esc(o.title)}</p>
      <p class="override-cur" data-ovr-cur="${esc(key)}"></p>
      ${valueField}
      <label class="field"><span class="field-label">사유</span><textarea class="textarea" data-ovr-reason placeholder="${esc(o.placeholder || '예: 세금계산서 3건 확인')}"></textarea><span class="field-hint">보고서의 담당자 개입 기록에 그대로 남습니다.</span></label>
      <p class="override-err" hidden></p>
      <div class="btn-row"><button type="button" class="btn btn--primary btn--sm" data-ovr-apply="${esc(key)}">적용</button><button type="button" class="btn btn--secondary btn--sm" data-ovr-cancel="${esc(key)}">취소</button></div>
    </div>
  </div>`;
}

function stepShell(n, titleText, body, open) {
  return `<details class="step" data-step="${n}"${open ? ' open' : ''}>
    <summary><span class="step-no" aria-hidden="true">${n}</span><span><span class="step-title">${esc(titleText)}</span><span class="step-result" data-sum="${n}"></span></span>${ICON.caret}</summary>
    <div class="step-body">${body}</div>
  </details>`;
}

// ---------------------------------------------------------------- 화면
export function render(page, params, ctx) {
  const id = params[0] || 'new';
  const s = getSession(id);
  if (!s) {
    page.innerHTML = `<div class="empty"><p class="empty-title">없는 예시입니다.</p><p><a href="#/cases">예시 5건으로 돌아가기</a></p></div>`;
    return;
  }
  const isNew = id === 'new';
  const req = s.req;
  let disposers = [];
  let polCommitted = { ...s.policy };
  let lastDecision = null;

  const head = isNew
    ? `<a class="backlink" href="#/">${ICON.back}처음으로</a>
       <div class="page-head"><h1 class="page-title">직접 입력해 검증하기</h1><p class="page-lead">요청서 내용을 넣으면 단계마다 결과가 바로 바뀝니다. 입력한 내용은 이 브라우저에만 저장되고 어디로도 전송되지 않습니다.</p></div>`
    : `<a class="backlink" href="#/cases">${ICON.back}예시 5건</a>
       <div class="page-head"><h1 class="page-title">${esc(caseTitle(s))}</h1><p class="page-lead">${esc(s.base.note)} 요청과 파트너사는 가상입니다.</p></div>`;

  const step0 = `
    <p>요청서에 적힌 내용을 옮깁니다. 숫자는 쉼표 없이 입력해도 됩니다.</p>
    <div class="field-row">
      <label class="field"><span class="field-label">파트너사</span><input class="input" data-f="partner" autocomplete="off" placeholder="예: 가상 F방수" value="${esc(req.partner)}"></label>
      <label class="field"><span class="field-label">접수일</span><input class="input" type="date" data-f="received" value="${esc(req.received || '')}"></label>
    </div>
    <label class="field"><span class="field-label">공사</span><input class="input" data-f="site" autocomplete="off" placeholder="예: 가상 공동주택 현장, 방수 공사" value="${esc(req.site || '')}"></label>
    <div data-items></div>
    <button type="button" class="btn btn--quiet btn--sm" data-add-item>${ICON.plus}자재 추가</button>
    <label class="field"><span class="field-label">계약 재료비</span><span class="affix"><input class="input" data-f="materialCost" inputmode="numeric" autocomplete="off" value="${esc(wonInput(req.materialCost))}"><span class="affix-unit">원</span></span><span class="field-hint" data-hint="materialCost"></span></label>
    <div class="field-row">
      <label class="field"><span class="field-label">기준월</span><select class="select" data-f="baseMonth">${monthOptions(req.baseMonth)}</select><span class="field-hint">계약월 또는 직전 조정월</span></label>
      <label class="field"><span class="field-label">비교월</span><select class="select" data-f="compareMonth">${monthOptions(req.compareMonth)}</select><span class="field-hint" data-hint="compareMonth">요청 시점의 최신 공표월</span></label>
    </div>
    <div class="field-row">
      ${pctField('requestedRate', '요청 상승률', req.requestedRate)}
      <label class="field"><span class="field-label">요청 사유</span><input class="input" data-f="reason" autocomplete="off" value="${esc(req.reason || '')}"></label>
    </div>
    <div data-out="0"></div>`;

  const step1 = `
    <p>요청을 어떤 절차로 다룰지 정합니다. 절차에 따라 법정 기한과 조정 기준이 달라집니다.</p>
    <div class="field"><span class="field-label">거래 유형</span>
      <div class="seg" role="group" aria-label="거래 유형">
        <button type="button" data-channel="outsourced" aria-pressed="${req.channel !== 'material'}">하도급(외주)</button>
        <button type="button" data-channel="material" aria-pressed="${req.channel === 'material'}">직접 구매 자재</button>
      </div>
    </div>
    <label class="check"><input type="checkbox" data-f="linked"${req.linked ? ' checked' : ''}><span>하도급대금 연동 약정이 있음<small>약정한 산식이 있으면 그 산식을 먼저 적용합니다.</small></span></label>
    <div class="field-row" data-linkfields${req.linked ? '' : ' hidden'}>
      ${pctField('linkRatio', '반영 비율', req.linkRatio, '지표 변동분 중 대금에 반영할 몫')}
      ${pctField('linkThreshold', '조정 요건', req.linkThreshold, '지표가 이만큼 이상 변하면 조정')}
    </div>
    <label class="check"><input type="checkbox" data-f="restrictClause"${req.restrictClause ? ' checked' : ''}><span>계약서에 조정 신청을 제한하는 조항이 있음<small>이런 조항은 부당특약으로 볼 수 있어 협의를 거절할 근거가 되지 않습니다.</small></span></label>
    <label class="field"><span class="field-label">파트너사 책임으로 늦어진 공정</span><span class="affix"><input class="input" data-f="delayMonths" inputmode="numeric" autocomplete="off" value="${esc(String(req.delayMonths || 0))}"><span class="affix-unit">개월</span></span><span class="field-hint">늦어진 만큼 비교월을 원래 공정 시점으로 당겨 계산합니다.</span></label>
    <div data-out="1"></div>`;

  const step2 = `
    <p>공표 지표로 요청을 대조합니다. 품목 지표를 먼저 보고, 원료로 설명되는 범위를 확인한 뒤, 넘는 부분은 증빙으로 봅니다.</p>
    <div data-out="2"></div>
    <div class="sub">담당자 개입</div>
    <p>지표를 다른 품목으로 바꾸거나, 실매입 자료로 확인한 상승률을 넣을 수 있습니다. 바꾼 값과 사유는 보고서에 남습니다.</p>
    <div data-indexkeys></div>
    ${ovrBlock('indexRate', { kind: 'pct', title: '지표 상승률 직접 입력', valueLabel: '적용할 지표 상승률', placeholder: '예: 같은 규격 직접 구매 단가 상승률로 대체' })}
    ${ovrBlock('evidence', { kind: 'pct', title: '증빙으로 확인한 상승률', valueLabel: '증빙 상승률', placeholder: '예: 세금계산서 3건 평균, 운반비 포함' })}`;

  const step3 = `
    <p>요청한 상승률을 어디까지 적용할지 정합니다. 이미 납품했거나 오르기 전에 사 둔 물량은 조정 대상이 아닙니다.</p>
    <div class="field-row">
      ${pctField('progressDone', '기성 완료율', req.progressDone, '이미 기성을 받은 비율')}
      ${pctField('prepurchased', '선매입 재고', req.prepurchased, '잔여분 중 미리 사 둔 비율')}
    </div>
    ${pctField('advanceFunded', '선급금 충당', req.advanceFunded, '잔여분 중 선급금으로 이미 산 비율')}
    <div data-out="3"></div>`;

  const step4 = `
    <p>판정에 따라 적용 상승률을 정하고 인정액을 계산합니다.</p>
    <div data-out="4"></div>
    <div class="sub">담당자 개입</div>
    ${ovrBlock('appliedRate', { kind: 'pct', title: '적용 상승률 조정', valueLabel: '적용 상승률', placeholder: '예: 협의 결과 지표와 요청의 중간값으로 합의' })}`;

  const decisionOptions = Object.entries(DECISIONS).map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('');

  page.innerHTML = `${head}
    <div class="sumbar" data-out="sumbar" aria-live="polite"></div>
    ${stepShell(0, '접수', step0, isNew)}
    ${stepShell(1, '자격 검증', step1, false)}
    ${stepShell(2, '가격 사실 검증', step2, !isNew)}
    ${stepShell(3, '범위 검증', step3, false)}
    ${stepShell(4, '산정', step4, false)}

    <section class="section" aria-labelledby="dec-title">
      <h2 class="section-title" id="dec-title">결정</h2>
      <div class="sheet" style="margin-top:12px">
        <div data-out="dec"></div>
        ${ovrBlock('decision', { kind: 'select', title: '판정 바꾸기', valueLabel: '바꿀 판정', options: decisionOptions, placeholder: '예: 공정 차질이 커서 신속 반영으로 처리' })}
      </div>
      <div class="sheet">
        <p class="sheet-title">정책 변수</p>
        <p class="sheet-sub">판정 기준은 예시값입니다. 실제로는 과거 조정 이력으로 보정합니다.</p>
        <div class="field"><span class="field-label">신속 반영 허용오차: <b data-pol-val="tol"></b></span><input type="range" min="0" max="10" step="0.5" data-pol="tol" value="${s.policy.tolerancePp * 100}" aria-label="신속 반영 허용오차"><span class="field-hint">요청이 지표에 이 값을 더한 수준 이하면 신속 반영합니다.</span></div>
        <div class="field"><span class="field-label">소명 요청 배수: <b data-pol-val="mult"></b></span><input type="range" min="1.1" max="3" step="0.1" data-pol="mult" value="${s.policy.explainMultiple}" aria-label="소명 요청 배수"><span class="field-hint">요청이 지표의 이 배수 이하면 소명 요청, 넘으면 정밀 검증입니다.</span></div>
        <button type="button" class="linkbtn" data-pol-reset style="margin-top:10px">기본값(3%p, 1.5배)으로</button>
        <div class="sub" style="margin-top:18px;font-weight:700;font-size:14.5px">정책 변수를 바꿔도 판정이 같은가</div>
        <div data-out="robust"></div>
      </div>
      <div class="sheet">
        <p class="sheet-title">기준월을 바꾸면</p>
        <p class="sheet-sub">기준월을 앞당기면 상승률이 커 보입니다. 기준월은 계약월이나 직전 조정월로 고정합니다.</p>
        <div data-out="sens" style="margin-top:10px"></div>
      </div>
      <div class="btn-col" style="margin-top:16px">
        <a class="btn btn--primary" href="#/report/${esc(id)}">${ICON.doc}검토 보고서 보기</a>
        <button type="button" class="btn btn--secondary" data-reset-all>${isNew ? '입력 비우기' : '예시 원래대로'}</button>
      </div>
    </section>

    <section class="section" aria-labelledby="audit-title">
      <h2 class="section-title" id="audit-title">담당자 개입 기록</h2>
      <p class="section-lead">자동 계산값을 바꾼 내용과 사유입니다. 보고서에도 그대로 들어갑니다.</p>
      <div class="sheet" style="margin-top:12px"><ul class="audit" data-out="audit"></ul></div>
    </section>`;

  const q = (sel) => page.querySelector(sel);
  const out = (k) => page.querySelector(`[data-out="${k}"]`);
  const sum = (k) => page.querySelector(`[data-sum="${k}"]`);

  // ------------------------------------------------------------ 자재 행
  function renderItems() {
    const box = q('[data-items]');
    const many = req.items.length > 1;
    box.innerHTML = req.items.map((it, i) => `
      <div class="matrow" style="${many ? '' : 'grid-template-columns:minmax(0,1fr)'}">
        <label class="field"><span class="field-label">${many ? `자재 ${i + 1}` : '자재'}</span><select class="select" data-f="item-key" data-i="${i}">${seriesOptions(MATERIAL_GROUPS, it.key)}</select></label>
        ${many ? `<label class="field"><span class="field-label">비중</span><span class="affix"><input class="input" data-f="item-w" data-i="${i}" inputmode="decimal" autocomplete="off" value="${esc(pctInput(it.weight))}"><span class="affix-unit">%</span></span></label>
        <button type="button" class="iconbtn" data-del-item="${i}" aria-label="자재 ${i + 1} 삭제">${ICON.close}</button>` : ''}
      </div>`).join('');
    q('[data-add-item]').hidden = req.items.length >= 4;
    renderIndexKeys();
  }

  function renderIndexKeys() {
    const box = q('[data-indexkeys]');
    box.innerHTML = req.items.map((it, i) => ovrBlock(`indexKey:${i}`, {
      kind: 'select',
      title: `${seriesName(S.data, it.key)}: 대조할 지표 바꾸기`,
      valueLabel: '대조할 지표',
      options: seriesOptions(ALL_GROUPS, it.indexKey || it.key),
      placeholder: '예: 해당 규격의 지표가 없어 원료 수지 지표로 대체',
    })).join('');
  }

  // ------------------------------------------------------------ 결과 그리기
  function chartFor(res, row) {
    const host = document.createElement('div');
    host.className = 'section-body';
    const base = req.baseMonth;
    const comp = res.comp;
    const first = S.data.months[0];
    let start = addMonths(base, -6);
    if (start < first) start = first;
    const months = monthRange(start, comp);
    const v0 = idx(S.data, row.indexKey, base);
    const series = [{ name: `${row.name}(지표)`, color: 'series-1', width: 2.5, endLabel: true, values: months.map((m) => { const v = idx(S.data, row.indexKey, m); return v && v0 ? (v / v0) * 100 : null; }) }];
    if (row.band) {
      const x0 = idx(S.data, row.band.input, base);
      series.push({ name: `${row.band.inputName}(원료)`, color: 'series-ctx', width: 2, endLabel: true, values: months.map((m) => { const v = idx(S.data, row.band.input, m); return v && x0 ? (v / x0) * 100 : null; }) });
    }
    const at = months.length - 1;
    const cfg = {
      months,
      series,
      refs: [{ y: 100 * (1 + res.requested), label: `요청 ${pct(res.requested)}`, legend: '요청 수준' }],
      range: row.band ? { at, lo: 100 * (1 + row.band.lo), hi: 100 * (1 + row.band.hi), legend: '원료로 설명되는 범위' } : null,
      marks: [{ at: months.indexOf(base), label: '기준월' }, { at, label: '비교월' }].filter((m) => m.at >= 0),
      height: 230,
      yFmt: (t) => String(Math.round(t)),
      tipFmt: (v) => v.toFixed(1),
      endFmt: (sr, i) => pct(sr.values[i] / 100 - 1, { sign: true }),
      table: true,
      tableFmt: (v) => (v === null || v === undefined ? '-' : v.toFixed(1)),
      caption: `기준월(${ym(base)})을 100으로 맞춘 값입니다. 공표 지수(2020=100)는 ${row.name} ${num(row.v0)} → ${num(row.v1)}입니다.`,
      aria: `${row.name} 지표 추이. 기준월 대비 ${pct(row.rate, { sign: true })}.`,
    };
    return { host, cfg };
  }

  function rulesHTML(res) {
    const P = res.policy;
    const i = res.indexRate;
    const auto = res.autoDecision;
    const rows = [];
    if (req.linked) {
      rows.push({ code: auto === 'linked' ? 'linked' : 'linked_unmet', text: `연동 약정: 지표 변동이 ${pct(req.linkThreshold)} 이상이면 산식대로 조정` });
    }
    rows.push({ code: 'reject', text: '지표가 오르지 않았으면(0% 이하) 증액 근거 없음' });
    rows.push({ code: 'fast', text: `요청 ≤ 지표 + ${pp(P.tolerancePp)} = ${pct(i + P.tolerancePp)}` });
    rows.push({ code: 'explain', text: `요청 ≤ 지표 × ${times(P.explainMultiple)} = ${pct(Math.max(i * P.explainMultiple, i + P.tolerancePp))}` });
    rows.push({ code: 'deep', text: '그 밖의 경우' });
    return `<ul class="rules">${rows.map((r) => `<li class="${r.code === auto ? 'is-hit' : ''}" data-v="${r.code}"><span>${vchipHTML(r.code)}</span><span>${esc(r.text)}${r.code === auto ? ' <span class="tag">해당</span>' : ''}</span></li>`).join('')}</ul>`;
  }

  function ovrStatus(key, active, text, reason) {
    const st = q(`[data-ovr-status="${CSS.escape(key)}"]`);
    if (!st) return;
    const opener = {
      indexRate: '지표 상승률 직접 입력',
      evidence: '증빙 상승률 넣기',
      appliedRate: '적용 상승률 조정',
      decision: '판정 바꾸기',
    }[key] || '대조 지표 바꾸기';
    const panel = q(`[data-ovr-panel="${CSS.escape(key)}"]`);
    const panelOpen = panel && !panel.hidden;
    st.innerHTML = active
      ? `<div class="override-on"><span class="tag">담당자 조정</span><span>${text}</span><button type="button" class="linkbtn" data-ovr-revert="${esc(key)}">자동값으로 되돌리기</button></div>${reason ? `<p class="tiny muted" style="margin-top:2px">사유: ${esc(reason)}</p>` : ''}`
      : `<button type="button" class="btn btn--secondary btn--sm" data-ovr-open="${esc(key)}" style="margin-top:10px"${panelOpen ? ' hidden' : ''}>${esc(opener)}</button>`;
    const step = st.closest('.step');
    if (step && active) step.classList.add('has-override');
  }

  function update() {
    disposers.forEach((d) => d());
    disposers = [];
    page.querySelectorAll('.step').forEach((el) => el.classList.remove('has-override'));
    const r = compute(s);
    saveSession(s);
    const ok = r.ok;
    const res = r.res;

    // 요약 막대
    const changed = ok && lastDecision !== null && lastDecision !== res.decision;
    if (ok) lastDecision = res.decision;
    out('sumbar').innerHTML = ok
      ? `${stampHTML(res.decision, { size: 'sm', land: changed, delay: 0 })}<div class="sumbar-fig">우선 인정<b>${esc(won(res.recognizedNow))}</b></div><a class="btn btn--primary btn--sm" href="#/report/${esc(id)}">보고서 보기</a>`
      : `<span class="sumbar-issues">입력을 확인하세요. ${esc(r.issues.join(' '))}</span>`;

    // 0. 접수
    const hint = q('[data-hint="materialCost"]');
    hint.textContent = Number(req.materialCost) > 0 ? `${won(req.materialCost)}` : '숫자로 입력하세요.';
    const provisional = S.data.provisional.includes(req.compareMonth) || S.data.provisional.includes(req.baseMonth);
    q('[data-hint="compareMonth"]').textContent = provisional ? '7~9월 지표는 잠정치라 확정치로 다시 확인합니다.' : '요청 시점의 최신 공표월';
    if (ok) {
      sum(0).textContent = `${req.partner || '파트너사'}, ${res.facts.rows.map((x) => x.material).join('·')} ${pct(res.requested)} 요청(${won(res.requestedAmount)})`;
      out(0).innerHTML = `<dl class="ledger" style="margin-top:14px"><dt>요청액</dt><dd>${esc(won(res.requestedAmount))}<small>재료비 × ${esc(pct(res.requested))}</small></dd>${res.facts.rows.length > 1 ? res.facts.rows.map((x) => `<dt>${esc(x.material)} 비중</dt><dd>${esc(pct(x.weight, { d: 0 }))}</dd>`).join('') : ''}</dl>`;
    } else {
      sum(0).textContent = '입력을 확인하세요.';
      out(0).innerHTML = `<div class="callout" style="margin-top:14px">${r.issues.map(esc).join('<br>')}</div>`;
    }

    if (!ok) {
      [1, 2, 3, 4].forEach((k) => { sum(k).textContent = '접수 단계의 입력을 먼저 확인하세요.'; out(k).innerHTML = ''; });
      out('dec').innerHTML = '<p class="ink2">입력이 완성되면 판정이 나옵니다.</p>';
      out('robust').innerHTML = '';
      out('sens').innerHTML = '';
      renderAudit();
      return;
    }

    // 1. 자격
    const w1 = res.warnings.filter((w) => /부당특약|조정 협의 대상|귀책/.test(w));
    const w2 = res.warnings.filter((w) => !w1.includes(w));
    const trackShort = req.linked ? '연동 약정 산식' : req.subcontract ? '하도급법 조정 협의' : '구매계약 단가 협의';
    sum(1).textContent = res.schedule ? `${trackShort}, ${day(res.schedule.consultBy)}까지 협의 개시` : trackShort;
    out(1).innerHTML = `<dl class="ledger" style="margin-top:14px">
        <dt>협의 경로</dt><dd style="font-weight:600;max-width:15em">${esc(res.track)}</dd>
        ${res.schedule ? `<dt>접수일</dt><dd>${esc(day(res.schedule.received))}</dd>
        <dt>협의 개시 기한</dt><dd>${esc(day(res.schedule.consultBy))}<small>접수 후 ${res.policy.consultDays}일</small></dd>
        <dt class="is-last">결론 목표</dt><dd class="is-last">${esc(day(res.schedule.decideBy))}<small>접수 후 ${res.policy.decideDays}일</small></dd>` : '<dt class="is-last">일정</dt><dd class="is-last">접수일을 넣으면 계산합니다.</dd>'}
      </dl>${w1.map((w) => `<p class="callout" style="margin-top:10px">${esc(w)}</p>`).join('')}`;

    // 2. 가격 사실
    sum(2).textContent = `지표 ${pct(res.indexRate, { sign: true })}, 요청과 ${pp(Math.abs(res.gapPp))} 차이`;
    const band = res.facts.band;
    const ovIdx = s.overrides.indexRate;
    out(2).innerHTML = `
      <div class="fact-big"><b>${esc(pct(res.indexRate, { sign: true }))}</b><span>${ovIdx ? '담당자가 입력한 지표 상승률' : `지표 상승률(${esc(ym(req.baseMonth))} → ${esc(ym(res.comp))})`}</span></div>
      <p style="margin-top:4px">요청 ${esc(pct(res.requested))}와 ${esc(pp(Math.abs(res.gapPp)))} 차이${res.multiple ? `, 지표의 ${esc(times(res.multiple))}` : ''}입니다.${ovIdx ? ` 자동 계산값은 ${esc(pct(res.autoIndexRate, { sign: true }))}입니다.` : ''}</p>
      <dl class="ledger" style="margin-top:12px">
        ${res.facts.rows.map((x, i, arr) => `<dt>${esc(x.name)}${x.indexKey !== x.key ? ` <span class="tag">대조 지표 변경</span>` : ''}${arr.length > 1 ? `<small class="muted" style="display:block;font-size:12.5px">비중 ${esc(pct(x.weight, { d: 0 }))}</small>` : ''}</dt><dd>${esc(num(x.v0))} → ${esc(num(x.v1))}<small>${esc(pct(x.rate, { sign: true }))}</small></dd>`).join('')}
        ${band ? `<dt class="is-last">원료로 설명되는 범위<small class="muted" style="display:block;font-size:12.5px">${esc(band.inputs.join('·'))} 기준, 90% 신뢰구간</small></dt><dd class="is-last">${esc(pct(band.lo))} ~ ${esc(pct(band.hi))}</dd>` : '<dt class="is-last">원료로 설명되는 범위</dt><dd class="is-last">이 품목은 원료 경로가 없습니다</dd>'}
      </dl>
      <div data-charts></div>
      ${w2.map((w) => `<p class="callout" style="margin-top:10px">${esc(w)}</p>`).join('')}
      <div class="sub" style="margin-top:18px;font-weight:700;font-size:14.5px">1차 판정 규칙</div>
      ${rulesHTML(res)}`;
    const chartsBox = out(2).querySelector('[data-charts]');
    res.facts.rows.forEach((row) => {
      const { host, cfg } = chartFor(res, row);
      chartsBox.appendChild(host);
      disposers.push(lineChart(host, cfg));
    });
    ovrStatus('indexRate', !!ovIdx, ovIdx ? `지표 상승률 <b>${esc(pct(ovIdx.value, { sign: true }))}</b> 적용` : '', ovIdx && ovIdx.reason);
    const ev = req.evidenceRate;
    const hasEv = ev !== null && ev !== undefined && ev !== '' && Number.isFinite(Number(ev));
    ovrStatus('evidence', hasEv, hasEv ? `증빙 상승률 <b>${esc(pct(Number(ev)))}</b>` : '', s.reasons.evidence);
    req.items.forEach((it, i) => {
      const key = `indexKey:${i}`;
      const on = !!it.indexKey && it.indexKey !== it.key;
      ovrStatus(key, on, on ? `${esc(seriesName(S.data, it.key))} → <b>${esc(seriesName(S.data, it.indexKey))}</b> 지표로 대조` : '', s.reasons[key]);
    });
    const cur = (k, t) => { const el = q(`[data-ovr-cur="${CSS.escape(k)}"]`); if (el) el.textContent = t; };
    cur('indexRate', `자동 계산값: ${pct(res.autoIndexRate, { sign: true })}`);
    cur('evidence', `지금 최대 인정 상승률: ${pct(res.rateMax)}. 증빙 상승률을 넣으면 요청 ${pct(res.requested)} 안에서 최대치를 올립니다.`);

    // 3. 범위
    sum(3).textContent = `조정 대상 재료비 ${won(res.eligible)}(재료비의 ${pct(res.share, { d: 0 })})`;
    out(3).innerHTML = `<dl class="ledger" style="margin-top:14px">
      <dt>계약 재료비</dt><dd>${esc(won(req.materialCost))}</dd>
      <dt>기성분 제외</dt><dd>${esc(won(-req.materialCost * (req.progressDone || 0)))}<small>기성 ${esc(pct(req.progressDone || 0))}</small></dd>
      <dt>선매입·선급금 제외</dt><dd>${esc(won(-req.materialCost * res.remaining * res.excl))}<small>잔여분의 ${esc(pct(res.excl))}</small></dd>
      <dt class="is-total">조정 대상 재료비</dt><dd class="is-total">${esc(won(res.eligible))}</dd>
    </dl>`;

    // 4. 산정
    const ovApp = s.overrides.appliedRate;
    sum(4).textContent = `우선 인정 ${won(res.recognizedNow)}${res.recognizedMax > res.recognizedNow + 1 ? `, 소명 시 최대 ${won(res.recognizedMax)}` : ''}`;
    out(4).innerHTML = `
      <div class="fact-big"><b>${esc(won(res.recognizedNow))}</b><span>우선 인정액</span></div>
      <p style="margin-top:4px">조정 대상 재료비 ${esc(won(res.eligible))} × 적용 상승률 ${esc(pct(res.rateNow))}${ovApp ? '(담당자 조정)' : ''}${res.recognizedMax > res.recognizedNow + 1 ? `. 증빙으로 소명되면 최대 ${esc(won(res.recognizedMax))}(${esc(pct(res.rateMax))})까지 인정합니다` : ''}.</p>
      <div class="section-body">${bridgeHTML(res)}</div>`;
    ovrStatus('appliedRate', !!ovApp, ovApp ? `적용 상승률 <b>${esc(pct(ovApp.value))}</b>` : '', ovApp && ovApp.reason);
    cur('appliedRate', `자동 계산값: ${pct(res.autoRateNow)}`);

    // 결정
    const ovDec = s.overrides.decision;
    out('dec').innerHTML = `<div class="verdict" style="margin-top:0">${stampHTML(res.decision, { size: 'lg', land: changed, delay: 0 })}<p class="verdict-text">${esc(res.decisionInfo.action)}</p></div>
      ${ovDec ? `<p class="small ink2" style="margin-top:12px">자동 판정은 ${esc(DECISIONS[res.autoDecision].label)}입니다.</p>` : ''}`;
    ovrStatus('decision', !!ovDec, ovDec ? `판정 <b>${esc(DECISIONS[ovDec.value].label)}</b>` : '', ovDec && ovDec.reason);
    cur('decision', `자동 판정: ${DECISIONS[res.autoDecision].label}`);

    // 정책 변수와 강건성
    q('[data-pol-val="tol"]').textContent = pp(s.policy.tolerancePp);
    q('[data-pol-val="mult"]').textContent = times(s.policy.explainMultiple);
    out('robust').innerHTML = robustHTML(r.rb);
    out('sens').innerHTML = sensHTML(r.sens);

    renderAudit();
  }

  function renderAudit() {
    const box = out('audit');
    box.innerHTML = s.audit.length
      ? s.audit.slice().reverse().map((a) => `<li><p class="audit-what">${esc(a.step)}: ${esc(a.what)} ${esc(a.from)} → ${esc(a.to)}</p><p class="audit-why">${esc(a.reason)}</p><p class="audit-when">${esc(new Date(a.at).toLocaleString('ko-KR'))}</p></li>`).join('')
      : '<li class="ink2">아직 없습니다. 모든 값이 자동 계산값입니다.</li>';
  }

  const updateSoon = debounce(update, 140);

  // ------------------------------------------------------------ 입력 처리
  function onField(el, f) {
    const v = el.value;
    switch (f) {
      case 'partner': case 'site': case 'reason': req[f] = v; break;
      case 'received': req.received = v || null; break;
      case 'materialCost': { const n = parseNum(v); req.materialCost = Number.isFinite(n) ? n : 0; break; }
      case 'baseMonth': case 'compareMonth': req[f] = v; break;
      case 'requestedRate': { const n = parseNum(v); req.requestedRate = Number.isFinite(n) ? n / 100 : NaN; break; }
      case 'progressDone': case 'prepurchased': case 'advanceFunded': { const n = parseNum(v); req[f] = Number.isFinite(n) ? clamp01(n / 100) : 0; break; }
      case 'linkRatio': { const n = parseNum(v); req.linkRatio = Number.isFinite(n) ? Math.max(0, n / 100) : 1; break; }
      case 'linkThreshold': { const n = parseNum(v); req.linkThreshold = Number.isFinite(n) ? Math.max(0, n / 100) : 0; break; }
      case 'delayMonths': { const n = parseNum(v); req.delayMonths = Number.isFinite(n) ? Math.max(0, Math.min(24, Math.round(n))) : 0; break; }
      case 'linked': req.linked = el.checked; q('[data-linkfields]').hidden = !el.checked; break;
      case 'restrictClause': req.restrictClause = el.checked; break;
      case 'item-key': {
        const i = Number(el.dataset.i);
        req.items[i].key = v;
        delete req.items[i].indexKey;
        delete s.reasons[`indexKey:${i}`];
        renderIndexKeys();
        break;
      }
      case 'item-w': { const i = Number(el.dataset.i); const n = parseNum(v); req.items[i].weight = Number.isFinite(n) ? Math.max(0, n / 100) : 0; break; }
      default: return;
    }
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') update();
    else updateSoon();
  }

  page.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.f && el.tagName !== 'SELECT' && el.type !== 'checkbox') onField(el, el.dataset.f);
    if (el.dataset.pol) {
      const val = Number(el.value);
      if (el.dataset.pol === 'tol') s.policy.tolerancePp = Math.round(val * 10) / 1000;
      else s.policy.explainMultiple = Math.round(val * 10) / 10;
      updateSoon();
    }
  });
  page.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.f && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date')) onField(el, el.dataset.f);
    if (el.dataset.f === 'materialCost' && Number(req.materialCost) > 0) el.value = wonInput(req.materialCost);
    if (el.dataset.pol) commitPolicy();
  });

  function commitPolicy() {
    const changes = [];
    if (polCommitted.tolerancePp !== s.policy.tolerancePp) changes.push(['허용오차', pp(polCommitted.tolerancePp), pp(s.policy.tolerancePp)]);
    if (polCommitted.explainMultiple !== s.policy.explainMultiple) changes.push(['소명 요청 배수', times(polCommitted.explainMultiple), times(s.policy.explainMultiple)]);
    changes.forEach(([what, from, to]) => logAudit(s, { step: '결정', what, from, to, reason: '정책 변수 조정' }));
    polCommitted = { ...s.policy };
    update();
  }

  page.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t || !page.contains(t)) return;
    const d = t.dataset;
    if (d.channel) {
      req.channel = d.channel;
      req.subcontract = d.channel !== 'material';
      page.querySelectorAll('[data-channel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.channel === d.channel)));
      update();
    } else if ('addItem' in d) {
      const n = req.items.length + 1;
      const used = new Set(req.items.map((it) => it.key));
      const next = Object.keys(S.data.series).find((k) => MATERIAL_GROUPS.includes(S.data.series[k].group) && !used.has(k));
      req.items.push({ key: next, weight: 1 });
      req.items.forEach((it) => { it.weight = 1 / n; });
      renderItems();
      update();
    } else if (d.delItem !== undefined) {
      const i = Number(d.delItem);
      req.items.splice(i, 1);
      const n = req.items.length;
      req.items.forEach((it) => { it.weight = 1 / n; });
      s.reasons = Object.fromEntries(Object.entries(s.reasons).filter(([k]) => !k.startsWith('indexKey:')));
      req.items.forEach((it) => { delete it.indexKey; });
      renderItems();
      update();
    } else if (d.ovrOpen) {
      const panel = q(`[data-ovr-panel="${CSS.escape(d.ovrOpen)}"]`);
      panel.hidden = false;
      t.hidden = true;
      const first = panel.querySelector('[data-ovr-val]');
      if (first && first.tagName === 'INPUT') first.focus();
    } else if (d.ovrCancel) {
      closePanel(d.ovrCancel);
    } else if (d.ovrApply) {
      applyOverride(d.ovrApply);
    } else if (d.ovrRevert) {
      revertOverride(d.ovrRevert);
    } else if ('polReset' in d) {
      s.policy = { ...DEFAULT_POLICY };
      q('[data-pol="tol"]').value = String(DEFAULT_POLICY.tolerancePp * 100);
      q('[data-pol="mult"]').value = String(DEFAULT_POLICY.explainMultiple);
      commitPolicy();
    } else if ('resetAll' in d) {
      resetSession(id);
      toast(isNew ? '입력을 비웠습니다.' : '예시를 원래 값으로 되돌렸습니다.');
      ctx.rerender();
    }
  });

  function closePanel(key) {
    const panel = q(`[data-ovr-panel="${CSS.escape(key)}"]`);
    if (!panel) return;
    panel.hidden = true;
    panel.querySelector('[data-ovr-reason]').value = '';
    const err = panel.querySelector('.override-err');
    err.hidden = true;
    const val = panel.querySelector('[data-ovr-val]');
    if (val.tagName === 'INPUT') val.value = '';
    const opener = q(`[data-ovr-open="${CSS.escape(key)}"]`);
    if (opener) opener.hidden = false;
  }

  function applyOverride(key) {
    const panel = q(`[data-ovr-panel="${CSS.escape(key)}"]`);
    const err = panel.querySelector('.override-err');
    const reason = panel.querySelector('[data-ovr-reason]').value.trim();
    const valEl = panel.querySelector('[data-ovr-val]');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    const before = compute(s);
    if (!before.ok) return fail('접수 단계의 입력을 먼저 완성하세요.');
    const r0 = before.res;
    let num1 = null;
    if (valEl.tagName === 'INPUT') {
      const n = parseNum(valEl.value);
      if (!Number.isFinite(n)) return fail('값을 숫자로 입력하세요.');
      num1 = n / 100;
    }
    if (!reason) return fail('사유를 입력하세요. 보고서의 개입 기록에 남습니다.');
    if (key === 'indexRate') {
      s.overrides.indexRate = { value: num1, reason };
      logAudit(s, { step: '가격 사실', what: '지표 상승률', from: pct(r0.autoIndexRate, { sign: true }), to: pct(num1, { sign: true }), reason });
    } else if (key === 'evidence') {
      req.evidenceRate = num1;
      s.reasons.evidence = reason;
      logAudit(s, { step: '가격 사실', what: '증빙 상승률', from: '없음', to: pct(num1), reason });
    } else if (key === 'appliedRate') {
      s.overrides.appliedRate = { value: num1, reason };
      logAudit(s, { step: '산정', what: '적용 상승률', from: pct(r0.autoRateNow), to: pct(num1), reason });
    } else if (key === 'decision') {
      const v = valEl.value;
      s.overrides.decision = { value: v, reason };
      logAudit(s, { step: '결정', what: '판정', from: DECISIONS[r0.autoDecision].label, to: DECISIONS[v].label, reason });
    } else if (key.startsWith('indexKey:')) {
      const i = Number(key.split(':')[1]);
      const it = req.items[i];
      const v = valEl.value;
      const from = seriesName(S.data, it.indexKey || it.key);
      if (v === it.key) delete it.indexKey; else it.indexKey = v;
      s.reasons[key] = reason;
      logAudit(s, { step: '가격 사실', what: `${seriesName(S.data, it.key)} 대조 지표`, from, to: seriesName(S.data, v), reason });
    }
    closePanel(key);
    update();
  }

  function revertOverride(key) {
    const before = compute(s);
    const r0 = before.ok ? before.res : null;
    const note = '자동 계산값으로 되돌림';
    if (key === 'indexRate' && s.overrides.indexRate) {
      const v = s.overrides.indexRate.value;
      delete s.overrides.indexRate;
      logAudit(s, { step: '가격 사실', what: '지표 상승률', from: pct(v, { sign: true }), to: r0 ? `${pct(r0.autoIndexRate, { sign: true })}(자동)` : '자동', reason: note });
    } else if (key === 'evidence') {
      const v = req.evidenceRate;
      req.evidenceRate = null;
      delete s.reasons.evidence;
      logAudit(s, { step: '가격 사실', what: '증빙 상승률', from: pct(Number(v)), to: '없음', reason: note });
    } else if (key === 'appliedRate' && s.overrides.appliedRate) {
      const v = s.overrides.appliedRate.value;
      delete s.overrides.appliedRate;
      logAudit(s, { step: '산정', what: '적용 상승률', from: pct(v), to: '자동', reason: note });
    } else if (key === 'decision' && s.overrides.decision) {
      const v = s.overrides.decision.value;
      delete s.overrides.decision;
      logAudit(s, { step: '결정', what: '판정', from: DECISIONS[v].label, to: r0 ? `${DECISIONS[r0.autoDecision].label}(자동)` : '자동', reason: note });
    } else if (key.startsWith('indexKey:')) {
      const i = Number(key.split(':')[1]);
      const it = req.items[i];
      const from = seriesName(S.data, it.indexKey || it.key);
      delete it.indexKey;
      delete s.reasons[key];
      logAudit(s, { step: '가격 사실', what: `${seriesName(S.data, it.key)} 대조 지표`, from, to: `${seriesName(S.data, it.key)}(자동)`, reason: note });
    }
    renderIndexKeys();
    update();
  }

  renderItems();
  update();
  ctx.onCleanup(() => disposers.forEach((d) => d()));
}

// ---------------------------------------------------------------- 공용 표(보고서에서도 씀)
export function robustHTML(rb) {
  const tols = [...new Set(rb.cells.map((c) => c.tol))];
  const mults = [...new Set(rb.cells.map((c) => c.mult))];
  const cell = (t, m) => rb.cells.find((c) => c.tol === t && c.mult === m);
  const isBase = (t, m) => t === DEFAULT_POLICY.tolerancePp && m === DEFAULT_POLICY.explainMultiple;
  const rows = tols.map((t) => `<tr><th scope="row">${esc(pp(t))}</th>${mults.map((m) => {
    const c = cell(t, m);
    const d = c && c.decision;
    return `<td data-v="${esc(d || 'reject')}" class="${isBase(t, m) ? 'is-base' : ''}">${esc(d ? DECISIONS[d].label : '-')}</td>`;
  }).join('')}</tr>`).join('');
  const line = rb.same === rb.total
    ? `${rb.total}개 조합 모두 같은 판정입니다.`
    : `${rb.total}개 조합 중 ${rb.same}개가 기본값과 같은 판정입니다. 판정이 갈리는 경계 사례라 담당자 판단이 필요합니다.`;
  return `<table class="grid3"><thead><tr><th scope="col"><span class="sr-only">허용오차</span></th>${mults.map((m) => `<th scope="col">${esc(times(m))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody><caption>가로는 소명 요청 배수, 세로는 신속 반영 허용오차입니다. 테두리 칸이 기본값(3%p, 1.5배)입니다.</caption></table><p class="small" style="margin-top:8px">${esc(line)}</p>`;
}

export function sensHTML(sens) {
  const rows = sens.map((x) => `<tr class="${x.offset === 0 ? 'is-base' : ''}"><td>${esc(ym(x.base))}${x.offset === 0 ? ' <span class="tag">입력값</span>' : ''}</td><td>${x.rate === null ? '-' : esc(pct(x.rate, { sign: true }))}</td><td>${x.decision ? vchipHTML(x.decision) : '-'}</td></tr>`).join('');
  const cur = sens.find((x) => x.offset === 0);
  const flip = sens.find((x) => x.rate !== null && x.decision && cur && x.decision !== cur.decision);
  const line = flip
    ? `기준월을 ${ym(flip.base)}로 잡으면 판정이 ${ro(DECISIONS[flip.decision].label)} 바뀝니다.`
    : '기준월을 앞당겨도 판정은 같습니다.';
  return `<table class="datatable"><thead><tr><th scope="col">기준월</th><th scope="col">지표 상승률</th><th scope="col">판정</th></tr></thead><tbody>${rows}</tbody></table><p class="small" style="margin-top:8px">${esc(line)}</p>`;
}

// 차트. 선은 SVG(색은 속성으로 직접 지정), 글자는 HTML로 얹는다.
// 이렇게 하면 화면·다크 모드·PDF(html2canvas)에서 모두 같은 서체로 그려진다.
import { esc, ym, ymShort, won } from './format.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const darkMQ = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function palette(el) {
  const cs = getComputedStyle(el || document.documentElement);
  const cache = {};
  const c = (name) => {
    if (!(name in cache)) cache[name] = cs.getPropertyValue(`--${name}`).trim() || '#888888';
    return cache[name];
  };
  return { c };
}

// 폭이 바뀌거나 다크 모드가 바뀌면 다시 그린다.
export function mount(el, draw) {
  let lastW = 0;
  const run = () => {
    const w = Math.floor(el.clientWidth);
    if (!w) return;
    lastW = w;
    draw(w, palette(el));
  };
  let ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => {
      const w = Math.floor(el.clientWidth);
      if (w && w !== lastW) run();
    });
    ro.observe(el);
  }
  const onTheme = () => requestAnimationFrame(run);
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', onTheme);
  run();
  return () => {
    if (ro) ro.disconnect();
    if (darkMQ && darkMQ.removeEventListener) darkMQ.removeEventListener('change', onTheme);
  };
}

function node(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  Object.keys(attrs).forEach((k) => {
    if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, String(attrs[k]));
  });
  return n;
}

function niceStep(range, count) {
  const raw = range / Math.max(count, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return s * mag;
}

export function niceTicks(min, max, count = 4) {
  let lo0 = min;
  let hi0 = max;
  if (!Number.isFinite(lo0) || !Number.isFinite(hi0)) { lo0 = 0; hi0 = 1; }
  if (lo0 === hi0) { lo0 -= 1; hi0 += 1; }
  const step = niceStep(hi0 - lo0, count);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { lo, hi, step, ticks };
}

function fmtTick(v, step) {
  const d = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  const s = Math.abs(v).toFixed(d);
  return `${v < 0 ? '−' : ''}${s}`;
}

function addLabel(box, cls, x, y, text, extra = '') {
  const el = document.createElement('span');
  el.className = `chart-lbl chart-lbl--${cls}${extra ? ` ${extra}` : ''}`;
  el.style.left = `${x.toFixed(1)}px`;
  el.style.top = `${y.toFixed(1)}px`;
  el.textContent = text;
  box.appendChild(el);
  return el;
}

function legendHTML(cfg) {
  const items = [];
  cfg.series.forEach((sr) => {
    items.push(`<li><span class="sw sw--line" style="background:var(--${esc(sr.color)})"></span>${esc(sr.name)}</li>`);
  });
  (cfg.refs || []).forEach((r) => {
    if (r.legend) items.push(`<li><span class="sw sw--dash" style="color:var(--${esc(r.color || 'ink-2')})"></span>${esc(r.legend)}</li>`);
  });
  if (cfg.range && cfg.range.legend) {
    items.push(`<li><span class="sw sw--range" style="color:var(--accent);background:var(--accent-tint)"></span>${esc(cfg.range.legend)}</li>`);
  }
  return `<ul class="legend">${items.join('')}</ul>`;
}

function tableHTML(cfg) {
  const fmt = cfg.tableFmt || ((v) => (v === null || v === undefined ? '-' : v.toFixed(2)));
  const head = `<tr><th scope="col">월</th>${cfg.series.map((sr) => `<th scope="col">${esc(sr.name)}</th>`).join('')}</tr>`;
  const rows = cfg.months.map((m, i) => `<tr><td>${esc(ym(m))}</td>${cfg.series.map((sr) => `<td>${esc(fmt(sr.values[i]))}</td>`).join('')}</tr>`);
  return `<table class="datatable"><thead>${head}</thead><tbody>${rows.reverse().join('')}</tbody></table>`;
}

// 선 차트
// cfg: { months, series:[{name, values, color, width, endLabel}], refs:[{y,label,legend,color}], range:{at,lo,hi,legend},
//        marks:[{at,label}], height, yFmt, tipFmt, endFmt, table, tableFmt, caption, interactive, fixedWidth, aria }
export function lineChart(host, cfg) {
  host.innerHTML = '';
  if (cfg.legend !== false) host.insertAdjacentHTML('beforeend', legendHTML(cfg));
  const box = document.createElement('div');
  box.className = 'chart';
  box.setAttribute('role', 'img');
  if (cfg.aria) box.setAttribute('aria-label', cfg.aria);
  host.appendChild(box);
  if (cfg.table) {
    const tools = document.createElement('div');
    tools.className = 'chart-tools';
    tools.innerHTML = '<button type="button" class="linkbtn" aria-expanded="false">표로 보기</button>';
    host.appendChild(tools);
    const wrap = document.createElement('div');
    wrap.className = 'chart-table';
    wrap.hidden = true;
    wrap.innerHTML = tableHTML(cfg);
    host.appendChild(wrap);
    const btn = tools.querySelector('button');
    btn.addEventListener('click', () => {
      const open = wrap.hidden;
      wrap.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '표 닫기' : '표로 보기';
    });
  }
  if (cfg.caption) host.insertAdjacentHTML('beforeend', `<p class="chart-cap">${esc(cfg.caption)}</p>`);
  if (cfg.fixedWidth) {
    drawLine(box, cfg.fixedWidth, palette(box), cfg);
    return () => {};
  }
  return mount(box, (w, pal) => drawLine(box, w, pal, cfg));
}

function drawLine(box, W, pal, cfg) {
  box.innerHTML = '';
  const n = cfg.months.length;
  const H = cfg.height || 220;
  const hasRange = !!cfg.range;
  const L = cfg.padLeft ?? 40;
  const R = hasRange ? 30 : 12;
  const T = cfg.marks && cfg.marks.length ? 24 : 12;
  const B = 24;
  const pw = Math.max(20, W - L - R);
  const ph = Math.max(20, H - T - B);

  const vals = [];
  cfg.series.forEach((sr) => sr.values.forEach((v) => { if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v); }));
  (cfg.refs || []).forEach((r) => vals.push(r.y));
  if (hasRange) vals.push(cfg.range.lo, cfg.range.hi);
  if (cfg.yInclude) cfg.yInclude.forEach((v) => vals.push(v));
  const tk = niceTicks(Math.min(...vals), Math.max(...vals), cfg.yTicks || 4);
  const xAt = (i) => L + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
  const yAt = (v) => T + ph - ((v - tk.lo) / (tk.hi - tk.lo)) * ph;

  const svg = node('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
  box.style.height = `${H}px`;

  tk.ticks.forEach((t, i) => {
    const y = Math.round(yAt(t)) + 0.5;
    svg.appendChild(node('line', { x1: L, x2: L + pw, y1: y, y2: y, stroke: i === 0 ? pal.c('rule-strong') : pal.c('grid'), 'stroke-width': 1 }));
    addLabel(box, 'y', L, yAt(t), cfg.yFmt ? cfg.yFmt(t) : fmtTick(t, tk.step));
  });

  // 세로 표시선(기준월·비교월)
  const markX = (cfg.marks || []).map((m) => ({ ...m, x: Math.round(xAt(m.at)) + 0.5 }));
  markX.forEach((m, k) => {
    svg.appendChild(node('line', { x1: m.x, x2: m.x, y1: T - 6, y2: T + ph, stroke: pal.c('rule-strong'), 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    const lb = addLabel(box, 'mark', m.x, T - 22, m.label);
    const half = (lb.offsetWidth || 48) / 2;
    const prev = markX[k - 1];
    const next = markX[k + 1];
    let align = 'center';
    if (m.x + half > W) align = 'end';
    else if (m.x - half < 0) align = 'start';
    if (next && next.x - m.x < half * 2 + 8) align = 'end';
    if (prev && m.x - prev.x < half * 2 + 8) align = 'start';
    if (align === 'end') lb.style.transform = 'translate(calc(-100% - 3px), 0)';
    if (align === 'start') lb.style.transform = 'translate(3px, 0)';
  });

  (cfg.refs || []).forEach((r) => {
    const y = yAt(r.y);
    svg.appendChild(node('line', { x1: L, x2: L + pw, y1: y, y2: y, stroke: pal.c(r.color || 'ink-2'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    if (r.label) addLabel(box, 'ref', L + 4, y, r.label);
  });

  if (hasRange) {
    const x = xAt(cfg.range.at) + 15;
    const ya = yAt(cfg.range.hi);
    const yb = yAt(cfg.range.lo);
    svg.appendChild(node('rect', { x: x - 4.5, y: Math.min(ya, yb), width: 9, height: Math.max(3, Math.abs(yb - ya)), rx: 3, fill: pal.c('accent-tint'), stroke: pal.c('accent'), 'stroke-width': 1.5 }));
  }

  cfg.series.forEach((sr) => {
    let d = '';
    let pen = false;
    sr.values.forEach((v, i) => {
      if (v === null || v === undefined || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      pen = true;
    });
    svg.appendChild(node('path', { d, fill: 'none', stroke: pal.c(sr.color), 'stroke-width': sr.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  });

  // 끝점과 값 라벨(겹치면 아래쪽 라벨을 점 아래로 내린다)
  const ends = [];
  cfg.series.forEach((sr) => {
    if (!sr.endLabel) return;
    let i = sr.values.length - 1;
    while (i >= 0 && (sr.values[i] === null || sr.values[i] === undefined)) i -= 1;
    if (i < 0) return;
    const x = xAt(i);
    const y = yAt(sr.values[i]);
    svg.appendChild(node('circle', { cx: x, cy: y, r: 4, fill: pal.c(sr.color), stroke: pal.c('sheet'), 'stroke-width': 2 }));
    ends.push({ x, y, text: cfg.endFmt ? cfg.endFmt(sr, i) : String(sr.values[i]) });
  });
  ends.sort((a, b) => a.y - b.y);
  ends.forEach((e, k) => {
    const lb = addLabel(box, 'end', e.x - 6, e.y, e.text);
    const prev = ends[k - 1];
    if (prev && Math.abs(e.y - prev.y) < 30) lb.style.transform = 'translate(-100%, 25%)';
  });

  // x축 라벨: 긴 기간은 1월에, 짧은 기간은 일정 간격으로
  const minGap = 46;
  let idxs = [];
  if (n > 30) {
    const perYear = pw / (n / 12);
    const yearStep = Math.max(1, Math.ceil(minGap / perYear));
    const y0 = Number(cfg.months[0].slice(0, 4));
    cfg.months.forEach((m, i) => {
      if (m.endsWith('-01') && (Number(m.slice(0, 4)) - y0) % yearStep === 0) idxs.push(i);
    });
    if (!idxs.length || idxs[0] !== 0) {
      if (idxs.length && xAt(idxs[0]) - xAt(0) < minGap) idxs.shift();
      idxs.unshift(0);
    }
  } else {
    const every = Math.max(1, Math.ceil((minGap * (n - 1)) / pw));
    for (let i = 0; i < n; i += every) idxs.push(i);
  }
  if (idxs[idxs.length - 1] !== n - 1) {
    if (idxs.length > 1 && xAt(n - 1) - xAt(idxs[idxs.length - 1]) < minGap) idxs.pop();
    idxs.push(n - 1);
  }
  idxs = [...new Set(idxs)];
  idxs.forEach((i) => {
    let extra = '';
    if (i === 0) extra = 'chart-lbl--x-start';
    else if (i === n - 1) extra = 'chart-lbl--x-end';
    addLabel(box, 'x', xAt(i), T + ph + 6, (cfg.xFmt || ymShort)(cfg.months[i]), extra);
  });

  box.prepend(svg);
  if (cfg.interactive !== false) crosshair(box, svg, { L, T, pw, ph, n, xAt, yAt }, cfg, pal);
}

function crosshair(box, svg, g, cfg, pal) {
  const vline = node('line', { x1: 0, x2: 0, y1: g.T, y2: g.T + g.ph, stroke: pal.c('ink-2'), 'stroke-width': 1, visibility: 'hidden' });
  svg.appendChild(vline);
  const dots = cfg.series.map((sr) => {
    const c = node('circle', { r: 4.5, fill: pal.c(sr.color), stroke: pal.c('sheet'), 'stroke-width': 2, visibility: 'hidden' });
    svg.appendChild(c);
    return c;
  });
  svg.appendChild(node('rect', { x: g.L, y: g.T, width: g.pw, height: g.ph, fill: 'transparent' }));
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('aria-hidden', 'true');
  box.appendChild(tip);
  const fmt = cfg.tipFmt || ((v) => (v === null || v === undefined ? '-' : v.toFixed(2)));

  const show = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    const step = g.n > 1 ? g.pw / (g.n - 1) : g.pw;
    let i = Math.round((px - g.L) / step);
    i = Math.max(0, Math.min(g.n - 1, i));
    const x = g.xAt(i);
    vline.setAttribute('x1', x);
    vline.setAttribute('x2', x);
    vline.setAttribute('visibility', 'visible');
    const lines = [`<b>${esc(ym(cfg.months[i]))}</b>`];
    cfg.series.forEach((sr, k) => {
      const v = sr.values[i];
      if (v === null || v === undefined || !Number.isFinite(v)) { dots[k].setAttribute('visibility', 'hidden'); return; }
      dots[k].setAttribute('cx', x);
      dots[k].setAttribute('cy', g.yAt(v));
      dots[k].setAttribute('visibility', 'visible');
      lines.push(`<i style="background:${pal.c(sr.color)}"></i>${esc(sr.name)} ${esc(fmt(v, sr, i))}`);
    });
    tip.innerHTML = lines.join('<br>');
    tip.classList.add('is-on');
    const tw = tip.offsetWidth;
    let left = x + 12;
    if (left + tw > rect.width) left = x - tw - 12;
    if (left < 0) left = 0;
    tip.style.transform = `translate(${left.toFixed(0)}px, ${g.T}px)`;
  };
  const hide = () => {
    vline.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tip.classList.remove('is-on');
  };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointercancel', hide);
}

// 인정액 브리지(폭포) — HTML 막대
export function bridgeHTML(res) {
  const rows = res.bridge;
  const req = rows[0].value;
  const scale = Math.max(req, res.recognizedMax, res.recognizedNow, 1);
  const px = (v) => (Math.max(0, v) / scale) * 100;
  let cum = req;
  const out = rows.map((r) => {
    let left = 0;
    let width = 0;
    let cls = 'is-total';
    if (r.kind === 'total') {
      width = px(r.value);
    } else if (r.kind === 'delta') {
      const a = cum;
      const b = cum + r.value;
      left = px(Math.min(a, b));
      width = Math.abs(px(a) - px(b));
      cls = 'is-delta';
      cum = b;
    } else {
      width = px(r.value);
      cls = 'is-end';
    }
    const val = r.kind === 'delta' && r.value > 0.5 ? `+${won(r.value)}` : won(r.value);
    let extra = '';
    if (r.kind === 'end' && res.recognizedMax > res.recognizedNow + 1) {
      extra = `<span class="bridge-bar is-max" style="left:${px(res.recognizedNow).toFixed(2)}%;width:${(px(res.recognizedMax) - px(res.recognizedNow)).toFixed(2)}%"></span>`;
    }
    return `<div class="bridge-row${r.kind === 'end' ? ' is-end' : ''}">
      <div class="bridge-head"><span class="bridge-label">${esc(r.label)}<span class="bridge-note">${esc(r.note)}</span></span><span class="bridge-val">${esc(val)}</span></div>
      <div class="bridge-track"><span class="bridge-bar ${cls}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></span>${extra}</div>
    </div>`;
  });
  if (res.recognizedMax > res.recognizedNow + 1) out.push(`<p class="bridge-foot">점선은 증빙으로 소명되면 더 인정할 수 있는 최대치(${esc(won(res.recognizedMax))})입니다.</p>`);
  return `<div class="bridge">${out.join('')}</div>`;
}

// 막대 목록(상승률 등). rows: [{name, value, dot, ctx, focus, detail}]
export function barList(host, rows, opts = {}) {
  const fmt = opts.fmt || ((v) => String(v));
  const vals = rows.flatMap((r) => [r.value, r.dot]).filter((v) => v !== null && v !== undefined);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const xp = (v) => ((v - lo) / span) * 100;
  const zero = xp(0);
  host.innerHTML = `<div class="barlist">${rows.map((r, i) => {
    const a = xp(Math.min(0, r.value));
    const b = xp(Math.max(0, r.value));
    const neg = r.value < 0;
    const dot = r.dot !== null && r.dot !== undefined ? `<span class="barrow-dot" style="left:${xp(r.dot).toFixed(2)}%"></span>` : '';
    return `<button type="button" class="barrow${r.focus ? ' is-focus' : ''}" aria-expanded="false" data-i="${i}">
      <span class="barrow-name">${esc(r.name)}</span>
      <span class="barrow-track">${lo < 0 ? `<span class="barrow-zero" style="left:${zero.toFixed(2)}%"></span>` : ''}<span class="barrow-bar${neg ? ' is-neg' : ''}${r.ctx ? ' is-ctx' : ''}" style="left:${a.toFixed(2)}%;width:${Math.max(0.6, b - a).toFixed(2)}%"></span>${dot}</span>
      <span class="barrow-val">${esc(fmt(r.value))}</span>
    </button><div class="barrow-detail" hidden>${esc(r.detail || '')}</div>`;
  }).join('')}</div>`;
  host.querySelectorAll('.barrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const det = btn.nextElementSibling;
      const open = det.hidden;
      det.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

// 덤벨(상승·하락 전이율). rows: [{name, sub, up, down, detail}]
export function dumbbell(host, rows, opts = {}) {
  const fmt = opts.fmt || ((v) => v.toFixed(2));
  const vals = rows.flatMap((r) => [r.up, r.down]);
  let lo = Math.min(0, ...vals);
  if (lo > -0.05) lo = 0;
  const tk = niceTicks(lo, Math.max(...vals), 3);
  const xp = (v) => Math.max(0, Math.min(100, ((v - tk.lo) / (tk.hi - tk.lo)) * 100));
  host.innerHTML = `<div class="dumb">${rows.map((r, i) => {
    const a = xp(Math.min(r.up, r.down));
    const b = xp(Math.max(r.up, r.down));
    return `<button type="button" class="barrow dumbrow" aria-expanded="false" data-i="${i}" style="grid-template-columns:9.4em minmax(0,1fr)">
      <span class="dumbrow-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
      <span class="dumb-track">
        <span class="dumb-line" style="left:${a.toFixed(2)}%;width:${(b - a).toFixed(2)}%"></span>
        <span class="dumb-dot is-down" style="left:${xp(r.down).toFixed(2)}%" title="하락 전이율 ${esc(fmt(r.down))}"></span>
        <span class="dumb-dot is-up" style="left:${xp(r.up).toFixed(2)}%" title="상승 전이율 ${esc(fmt(r.up))}"></span>
      </span>
    </button><div class="barrow-detail" hidden style="padding-left:calc(9.4em + 8px)">${esc(r.detail || '')}</div>`;
  }).join('')}
  <div class="axis-row" aria-hidden="true"><span></span><span class="axis-ticks">${tk.ticks.map((t) => `<span style="left:${xp(t).toFixed(2)}%">${esc(fmtTick(t, tk.step))}</span>`).join('')}</span></div></div>`;
  host.querySelectorAll('.dumbrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const det = btn.nextElementSibling;
      const open = det.hidden;
      det.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

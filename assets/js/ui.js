// 화면 공통 조각: 도장, 판정 칩, 아이콘, 토스트, 스크립트 지연 로드.
import { DECISIONS } from './engine.js';
import { esc } from './format.js';

export const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  caret: '<svg class="step-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.3"/></svg>',
};

// 판정 도장. size: 'sm' | '' | 'lg'
export function stampHTML(decision, opts = {}) {
  const { size = '', land = false, delay = 0, flat = false, label } = opts;
  const info = DECISIONS[decision];
  const text = label || (info ? info.label : '판정 대기');
  const cls = ['stamp'];
  if (size) cls.push(`stamp--${size}`);
  if (land) cls.push('stamp--land');
  if (flat) cls.push('stamp--flat');
  const style = land ? ` style="--delay:${delay}ms"` : '';
  return `<span class="${cls.join(' ')}" data-v="${esc(decision || 'reject')}"${style} role="img" aria-label="판정: ${esc(text)}"><span class="stamp-inner">${esc(text)}</span></span>`;
}

export function vchipHTML(decision) {
  const info = DECISIONS[decision];
  return `<span class="vchip" data-v="${esc(decision)}">${esc(info ? info.label : decision)}</span>`;
}

export function debounce(fn, ms = 160) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer = null;
export function toast(msg, ms = 2600) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  return el;
}
export function hideToast() {
  const el = document.querySelector('.toast');
  if (el) el.hidden = true;
}

const loaded = {};
export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete loaded[src]; reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`)); };
    document.head.appendChild(s);
  });
  return loaded[src];
}

// GitHub Pages 주소에서 저장소 링크를 만든다. 다른 곳에서 열면 null.
export function repoURL(path = '') {
  const host = location.hostname;
  if (!host.endsWith('.github.io')) return null;
  const user = host.replace(/\.github\.io$/, '');
  const repo = location.pathname.split('/').filter(Boolean)[0] || `${user}.github.io`;
  return `https://github.com/${user}/${repo}${path}`;
}

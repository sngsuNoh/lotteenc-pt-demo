// 해시 라우터와 하단 탭.
import { loadAll, S } from './store.js';
import * as home from './views/home.js';
import * as check from './views/check.js';
import * as report from './views/report.js';
import * as slides from './views/slides.js';
import * as laws from './views/laws.js';
import * as market from './views/market.js';
import * as method from './views/method.js';
import { esc } from './format.js';

const ROUTES = { '': home, check, report, slides, laws, market, method };
const TAB = { '': 'verify', check: 'verify', report: 'verify', slides: 'slides', laws: 'laws', market: 'market', method: 'method' };
const SITE = '자재비 증액 요청 검증 자동화 도구';

let cleanups = [];
let lastRoute = null;

// 하단 탭: 아래로 스크롤하면 숨기고, 위로 스크롤하거나 맨 위에 오면 다시 보인다.
const tabbar = {
  el: null,
  lastY: 0,
  ticking: false,
  show() { if (this.el) this.el.classList.remove('is-hidden'); },
  hide() { if (this.el) this.el.classList.add('is-hidden'); },
  init() {
    this.el = document.querySelector('.tabbar');
    if (!this.el) return;
    this.lastY = window.scrollY;
    const step = 6;
    window.addEventListener('scroll', () => {
      if (this.ticking) return;
      this.ticking = true;
      requestAnimationFrame(() => {
        this.ticking = false;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const y = Math.min(Math.max(window.scrollY, 0), max);
        const dy = y - this.lastY;
        if (y < 56) { this.show(); this.lastY = y; return; }
        if (dy > step) { this.hide(); this.lastY = y; } else if (dy < -step) { this.show(); this.lastY = y; }
      });
    }, { passive: true });
    this.el.addEventListener('focusin', () => this.show());
  },
};

function parse() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [name = '', ...rest] = h.split('/').filter((x, i) => x !== '' || i === 0);
  return { name: ROUTES[name] ? name : '', params: rest };
}

async function render() {
  cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  cleanups = [];
  const { name, params } = parse();
  const view = ROUTES[name];
  const main = document.getElementById('main');
  const page = document.createElement('div');
  page.className = 'page';
  main.replaceChildren(page);
  const ctx = {
    onCleanup: (fn) => cleanups.push(fn),
    rerender: () => render(),
  };
  try {
    await view.render(page, params, ctx);
  } catch (e) {
    console.error(e);
    page.innerHTML = `<div class="empty"><p class="empty-title">이 화면을 그리지 못했습니다.</p><p>${esc(e.message || String(e))}</p><p><a href="#/">처음으로</a></p></div>`;
  }
  const t = view.title ? view.title(params) : '';
  document.title = t ? `${t} | ${SITE}` : SITE;
  document.querySelectorAll('.tab').forEach((a) => {
    if (a.dataset.tab === TAB[name]) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const key = `${name}/${params.join('/')}`;
  if (key !== lastRoute) {
    window.scrollTo(0, 0);
    tabbar.lastY = 0;
    tabbar.show();
  }
  lastRoute = key;
}

async function start() {
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML = `<div class="page"><div class="empty"><p class="empty-title">데이터를 불러오지 못했습니다.</p><p>${esc(e.message || String(e))}</p><p>파일을 직접 열었다면(file://) 웹 서버나 GitHub Pages 주소로 열어야 합니다.</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  tabbar.init();
  render();
}

if (S.ready) render(); else start();

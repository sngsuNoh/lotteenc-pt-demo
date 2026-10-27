// 발표자료 PDF 보기(pdf.js). slides/presentation.pdf가 없으면 안내만 보여 준다.
import { S } from '../store.js';
import { esc } from '../format.js';
import { loadScript, ICON } from '../ui.js';

export const title = () => '발표자료';

const LIB = 'assets/lib/pdfjs/pdf.min.js';
const WORKER = 'assets/lib/pdfjs/pdf.worker.min.js';
const CMAPS = 'assets/lib/pdfjs/cmaps/';

export async function render(page, params, ctx) {
  const m = S.meta;
  const url = m.slidesPath || 'slides/presentation.pdf';
  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">발표자료</h1>
    </div>
    <div data-slides><p class="ink2">발표자료를 찾는 중입니다.</p></div>`;
  const box = page.querySelector('[data-slides]');
  let alive = true;
  let observer = null;
  let pdf = null;
  ctx.onCleanup(() => {
    alive = false;
    if (observer) observer.disconnect();
    if (pdf) pdf.destroy();
  });

  let exists = false;
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    exists = head.ok;
  } catch (e) {
    exists = false;
  }
  if (!alive) return;
  if (!exists) {
    box.innerHTML = `<div class="empty"><p class="empty-title">발표자료를 준비하고 있습니다.</p><p>면접 발표에 쓴 PDF가 이곳에 올라옵니다. 그동안 검증 도구와 지표는 먼저 볼 수 있습니다.</p><p class="empty-note">관리자 안내: 저장소의 slides 폴더에 presentation.pdf를 올리면 자동으로 표시됩니다.</p></div>`;
    return;
  }

  try {
    await loadScript(LIB);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = WORKER;
    pdf = await lib.getDocument({ url, cMapUrl: CMAPS, cMapPacked: true, isEvalSupported: false }).promise;
  } catch (e) {
    console.error(e);
    if (!alive) return;
    box.innerHTML = `<div class="empty"><p class="empty-title">PDF를 화면에 그리지 못했습니다.</p><p>아래 링크로 원본을 열어 보세요.</p><p><a href="${esc(url)}">발표자료 PDF 열기</a></p></div>`;
    return;
  }
  if (!alive) return;

  const first = await pdf.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const ratio = vp1.height / vp1.width;
  box.innerHTML = `
    <div class="pdf-bar"><span>${pdf.numPages}쪽</span><a class="btn btn--secondary btn--sm" href="${esc(url)}" download="${esc(m.slidesFileName || 'presentation.pdf')}">${ICON.download}PDF 내려받기</a></div>
    <div class="pdf-pages">${Array.from({ length: pdf.numPages }, (_, i) => `<div class="pdf-item"><figure class="pdf-page" data-p="${i + 1}" style="aspect-ratio:${(1 / ratio).toFixed(4)};margin:0"></figure><p class="pdf-no">${i + 1} / ${pdf.numPages}</p></div>`).join('')}</div>`;

  const rendering = new Set();
  async function draw(fig) {
    const n = Number(fig.dataset.p);
    if (rendering.has(n) || fig.querySelector('canvas')) return;
    rendering.add(n);
    try {
      const p = n === 1 ? first : await pdf.getPage(n);
      const cssW = fig.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = p.getViewport({ scale: (cssW / p.getViewport({ scale: 1 }).width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.setAttribute('aria-label', `발표자료 ${n}쪽`);
      canvas.setAttribute('role', 'img');
      await p.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      if (!alive) return;
      fig.style.aspectRatio = '';
      fig.prepend(canvas);
    } catch (e) {
      console.error(e);
    } finally {
      rendering.delete(n);
    }
  }

  const figs = [...box.querySelectorAll('.pdf-page')];
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) draw(en.target); });
    }, { rootMargin: '600px 0px' });
    figs.forEach((f) => observer.observe(f));
  } else {
    figs.forEach((f) => draw(f));
  }
}

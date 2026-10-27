// 관련 법령: 분야별로 접고 펴는 목록. 조문을 누르면 요지와 쓰이는 단계가 나온다.
import { S } from '../store.js';
import { esc } from '../format.js';
import { ICON } from '../ui.js';

export const title = () => '관련 법령';

function itemHTML(it) {
  const links = [[it.link, it.linkLabel], [it.link2, it.link2Label]]
    .filter(([href]) => href)
    .map(([href, label], i) => `${i ? '<br>' : ''}<a class="law-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`)
    .join('');
  return `<details class="law">
    <summary><span><span class="law-name">${esc(it.name)}</span><span class="law-src">${esc(it.src)}</span></span>${ICON.caret}</summary>
    <div class="law-detail">
      <p class="law-body">${esc(it.body)}</p>
      <p class="law-use">${it.use.map((u) => `<span class="tag">${esc(u)}</span>`).join('')} ${esc(it.useNote)}</p>
      ${links}
    </div>
  </details>`;
}

export function render(page) {
  const L = S.laws;
  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">관련 법령</h1>
      <p class="page-lead">검증 파이프라인 설계 과정에서 참고한 공정거래법 및 하도급법 등 관련 조문입니다.</p>
    </div>
    <div class="lawgroups">
      ${L.groups.map((g) => `<details class="lawgroup">
        <summary><span class="lawgroup-title">${esc(g.title)}</span><span class="lawgroup-count">${g.items.length}개</span>${ICON.caret}</summary>
        <div class="lawgroup-body">${g.items.map(itemHTML).join('')}</div>
      </details>`).join('')}
    </div>
    <p class="foot">조문 요지 기준: ${esc(L.asOf.replace('-', '년 '))}월. 법령 링크는 국가법령정보센터의 현행 법령으로, 협약 링크는 보도 기사로 연결됩니다.</p>`;
}

// 관련 법령: 조문 요지와 검증 단계 연결.
import { S } from '../store.js';
import { esc } from '../format.js';

export const title = () => '관련 법령';

export function render(page) {
  const L = S.laws;
  page.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">관련 법령</h1>
      <p class="page-lead">검증 단계마다 기대는 조문입니다. 각 항목 아래에 이 도구의 어느 단계에서 쓰이는지 적었습니다.</p>
    </div>
    <p class="callout callout--info">${esc(L.disclaimer)}</p>
    <div style="margin-top:24px">
      ${L.groups.map((g) => `<section class="lawgroup">
        <h2 class="lawgroup-title">${esc(g.title)}</h2>
        ${g.items.map((it) => `<article class="law">
          <h3 class="law-name">${esc(it.name)}<span class="law-src">${esc(it.src)}</span></h3>
          <p class="law-body">${esc(it.body)}</p>
          <p class="law-use">${it.use.map((u) => `<span class="tag">${esc(u)}</span>`).join('')} ${esc(it.useNote)}</p>
          <a class="law-link" href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.linkLabel)}</a>${it.link2 ? `<br><a class="law-link" style="margin-top:4px" href="${esc(it.link2)}" target="_blank" rel="noopener">${esc(it.link2Label)}</a>` : ''}
        </article>`).join('')}
      </section>`).join('')}
    </div>
    <p class="foot">조문 요지 기준: ${esc(L.asOf.replace('-', '년 '))}월. 법령 링크는 국가법령정보센터의 현행 법령으로, 협약 링크는 보도 기사로 연결됩니다.</p>`;
}

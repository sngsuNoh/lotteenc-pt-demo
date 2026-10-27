// A4 쪽을 그림으로 떠서 PDF로 묶는다. 라이브러리는 누를 때만 불러온다.
import { loadScript, toast } from './ui.js';

const LIBS = ['assets/lib/html2canvas.min.js', 'assets/lib/jspdf.umd.min.js'];

export async function exportPDF(hostId, filename, props = {}) {
  const host = document.getElementById(hostId);
  const pages = host ? [...host.querySelectorAll('.a4')] : [];
  if (!pages.length) throw new Error('보고서 쪽이 없습니다.');
  toast('PDF를 만드는 중입니다.', 0);
  await Promise.all(LIBS.map(loadScript));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await window.html2canvas(pages[i], {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      width: 794,
      height: 1123,
      windowWidth: 794,
      windowHeight: 1123,
      onclone: (cloned) => {
        const h = cloned.getElementById(hostId);
        if (!h) return;
        h.style.position = 'absolute';
        h.style.left = '0px';
        h.style.top = '0px';
        [...h.querySelectorAll('.a4')].forEach((p, k) => { if (k !== i) p.style.display = 'none'; });
        const app = cloned.querySelector('.app');
        if (app) app.style.display = 'none';
      },
    });
    const img = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) doc.addPage('a4', 'p');
    doc.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }
  doc.setProperties({ title: props.title || filename, subject: props.subject || '', author: '지원자 개인 데모', creator: 'lotteenc-pt-demo' });
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('PDF를 저장했습니다.');
  return url;
}

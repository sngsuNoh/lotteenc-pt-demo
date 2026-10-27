// 화면과 보고서에 쓰는 숫자·날짜 서식. 보고서의 모든 숫자는 이 함수들을 거친다.

const MINUS = '−';

function trimZero(s) {
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function pct(v, opts = {}) {
  const { d = 1, sign = false } = opts;
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  const x = v * 100;
  let s = trimZero(Math.abs(x).toFixed(d));
  if (s === '0') return '0%';
  if (x < 0) s = MINUS + s;
  else if (sign) s = '+' + s;
  return s + '%';
}

export function pp(v, opts = {}) {
  const { d = 1, sign = false } = opts;
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  const x = v * 100;
  let s = trimZero(Math.abs(x).toFixed(d));
  if (x < 0) s = MINUS + s;
  else if (sign && x > 0) s = '+' + s;
  return s + '%p';
}

export function times(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return `${trimZero(v.toFixed(1))}배`;
}

export function won(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  const man = Math.round(v / 10000);
  if (man === 0) {
    const w = Math.round(v);
    return w === 0 ? '0원' : `${w < 0 ? MINUS : ''}${Math.abs(w).toLocaleString('ko-KR')}원`;
  }
  const sign = man < 0 ? MINUS : '';
  const a = Math.abs(man);
  const eok = Math.floor(a / 10000);
  const rest = a % 10000;
  if (eok && rest) return `${sign}${eok}억 ${rest.toLocaleString('ko-KR')}만 원`;
  if (eok) return `${sign}${eok}억 원`;
  return `${sign}${rest.toLocaleString('ko-KR')}만 원`;
}

// 차트 라벨처럼 '원'을 뺀 짧은 금액
export function wonShort(v) {
  return won(v).replace(/ 원$/, '').replace(/원$/, '');
}

export function wonFull(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  const w = Math.round(v);
  return `${w < 0 ? MINUS : ''}${Math.abs(w).toLocaleString('ko-KR')}원`;
}

export function ym(s) {
  if (!s) return '-';
  const [y, m] = s.split('-').map(Number);
  return `${y}년 ${m}월`;
}

export function ymShort(s) {
  if (!s) return '-';
  const [y, m] = s.split('-');
  return `${y.slice(2)}.${Number(m)}`;
}

export function day(s) {
  if (!s) return '-';
  const [y, m, d] = s.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export function num(v, d = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return v.toFixed(d);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

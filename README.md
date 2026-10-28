# 자재비 증액 요청 검증 자동화 도구

롯데건설 외주구매 지원자 노승수가 PT 면접을 위해 만든 데모입니다. 자재비 조정 요청 사례와 파트너사는 가상의 데이터를 활용했고, 지표는 한국은행 경제통계시스템(ECOS)에서 받은 실제 공표값입니다.

- 주소: `https://<GitHub 아이디>.github.io/lotteenc-pt-demo/`
- 서버 없이 동작하는 정적 사이트입니다. 입력값은 방문자의 브라우저에만 저장되고 어디로도 전송되지 않습니다.

## 화면

| 탭 | 내용 |
| --- | --- |
| 검증 | 예시 요청 2건과 판정, 단계별 검증(접수 → 자격 → 가격 사실 → 범위 → 산정 → 결정), 담당자 개입과 기록, 검토 보고서(A4 두 쪽 PDF·인쇄), 파트너사 회신문 |
| 발표자료 | `slides/presentation.pdf`를 화면에서 보기 |
| 법령 | 하도급법·공정거래법 등 조문 요지(분야별로 접고 펴기)와 검증 단계 연결 |
| 지표 | 2026년 건설자재 가격 지표: 자재별 단가 변화, 상승·하락 전이율 비대칭, 자재별 가격 변동 |
| 사용방법 | 검증 순서와 1차 판정 규칙(허용오차, 소명 요청 배수) |

## GitHub Pages에 올리기(웹 화면만으로)

1. GitHub에 로그인한 뒤 오른쪽 위 `+` → `New repository`를 누릅니다.
2. Repository name에 `lotteenc-pt-demo`를 넣고 `Public`을 고른 뒤 `Create repository`를 누릅니다.
3. 새 저장소 화면에서 `uploading an existing file` 링크를 누릅니다(또는 `Add file` → `Upload files`).
4. 압축을 푼 폴더 **안의 내용물**(`index.html`, `assets`, `data`, `analysis`, `slides`, `tools`, `README.md`, `package.json`)을 모두 선택해 끌어다 놓습니다. 폴더를 끌어다 놓으면 하위 구조가 그대로 올라갑니다. 웹 업로드는 한 번에 100개, 파일 하나에 25MB까지이며 이 데모는 그 안에 들어옵니다.
5. 화면 아래 `Commit changes`를 누릅니다.
6. `Settings` → `Pages` → `Build and deployment`에서 Source를 `Deploy from a branch`, Branch를 `main`, 폴더를 `/ (root)`로 고르고 `Save`를 누릅니다.
7. 1~2분 뒤 같은 화면 위쪽에 사이트 주소가 나타납니다. 그 주소로 QR 코드를 만듭니다.

주의할 점

- zip 파일을 그대로 올리면 사이트가 열리지 않습니다. 압축을 풀고 내용물을 올려야 하며, `index.html`이 저장소 맨 위에 있어야 합니다.
- `.nojekyll` 파일은 GitHub의 Jekyll 변환을 끄는 빈 파일입니다. 숨김 파일이라 업로드에서 빠질 수 있는데, 빠져도 사이트는 동작합니다. 넣고 싶으면 `Add file` → `Create new file`에서 이름을 `.nojekyll`로 하고 내용 없이 저장합니다.
- 올린 뒤 바뀐 내용이 바로 안 보이면 1~2분 기다린 뒤 새로고침합니다(GitHub Pages는 약 10분 동안 캐시합니다).
- 검색엔진에 노출되지 않도록 `index.html`에 `noindex`를 넣었습니다. 노출을 원하면 `<meta name="robots" content="noindex">` 줄을 지웁니다.

## 발표자료 추가

1. 저장소에서 `slides` 폴더로 들어갑니다.
2. `Add file` → `Upload files`로 PDF를 올립니다. 파일 이름은 반드시 `presentation.pdf`입니다.
3. 몇 분 뒤 사이트의 `발표자료` 탭에 쪽마다 표시되고, 원본 내려받기 버튼이 생깁니다.

## 고칠 때

| 바꿀 것 | 파일 |
| --- | --- |
| 작성자·버전·출처 문구 | `data/meta.json` |
| 법령 요지와 링크 | `data/laws.json` |
| 예시 요청 2건 | `data/cases.json` |
| 예시 2건의 보고서 문장 | `data/narratives.json`(숫자가 엔진 값과 다르면 보고서에 경고가 뜹니다) |
| 지표 갱신 | `analysis/data/raw`의 CSV를 바꾼 뒤 `python3 tools/build_data.py` |

검증 엔진과 문장 숫자 확인은 Node 18 이상에서 `npm test`로 돌립니다. `test_engine.mjs`는 JavaScript 엔진 결과가 `analysis/`의 Python 결과와 원 단위까지 같은지, `test_narratives.mjs`는 모든 문장의 숫자가 엔진 값과 같은지 확인합니다.

## 내 컴퓨터에서 보기

`index.html`을 더블클릭하면 데이터를 불러오지 못합니다. 폴더에서 웹 서버를 띄워 엽니다.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 구성

```
index.html              앱 진입점
assets/css/app.css      화면·A4 보고서·인쇄 스타일
assets/js/engine.js     검증 엔진(analysis/src/verify_tool.py의 규칙을 옮김)
assets/js/narrative.js  규칙 기반 문장, 회신문, 숫자 가드레일
assets/js/views/        화면별 코드
assets/js/export.js     A4 보고서 PDF 만들기
assets/lib/             PDF.js, jsPDF, html2canvas
assets/fonts/           IBM Plex Sans KR
data/                   지표·예시·문장·법령 JSON
slides/                 발표자료 PDF 자리
analysis/               Python 분석과 원자료, 결과 표·그림
tools/                  데이터 변환 스크립트와 시험 코드
```

## 출처와 라이선스

- 지표: 한국은행 경제통계시스템(ECOS) Open API, 2026년 10월 27일 수집. 2026년 7~9월은 잠정치입니다.
- 서체: IBM Plex Sans KR, SIL Open Font License 1.1(`assets/fonts/LICENSE-IBM-Plex.txt`). 원본 파일을 수정 없이 넣었습니다.
- 라이브러리: PDF.js 3.11.174(Apache License 2.0), jsPDF 2.5.2(MIT), html2canvas 1.4.1(MIT). 라이선스 파일은 `assets/lib`에 있습니다.
- 법령 요지는 참고용이며 법률 자문이 아닙니다.

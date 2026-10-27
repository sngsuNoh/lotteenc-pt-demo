"""분석에 쓰는 시계열의 메타데이터.

모든 수치는 한국은행 경제통계시스템(ECOS) Open API에서 직접 내려받았다.
- 404Y016 생산자물가지수(품목별), 404Y014 생산자물가지수(기본분류): 2020=100
- 401Y015 수입물가지수(기본분류), 품목 201121AA 원유, 원화기준(W): 2020=100
- 902Y003 국제상품가격, 010102 두바이유: 달러/배럴
- 731Y004 주요국 통화의 대원화환율, 0000001 원/미국달러(매매기준율) 월평균(0000100)

group 값
- driver: 유가·환율 등 외생 변수
- upstream: 원유를 정제해 바로 나오는 원료(나프타, 아스팔트, 경유 등)
- mid: 석유화학 중간재(기초유분, 합성수지 등)
- petro_material: 석유화학 계열 건설자재
- other_material: 비석유화학 건설자재(비교군)
- service: 운송·전력 등 서비스·에너지
- aggregate: 총지수·대분류
"""

SERIES = [
    # key, 한글명, stat, item1, item2, 단위, PPI 가중치(천분비), group
    ("dubai", "두바이유", "902Y003", "010102", "", "달러/배럴", None, "driver"),
    ("usdkrw", "원/달러 환율(월평균)", "731Y004", "0000001", "0000100", "원", None, "driver"),
    ("crude_imp_krw", "수입물가 원유(원화기준)", "401Y015", "201121AA", "W", "2020=100", None, "driver"),
    ("naphtha", "나프타", "404Y016", "30412101AA", "", "2020=100", 4.1, "upstream"),
    ("diesel", "경유", "404Y016", "30412501AA", "", "2020=100", 8.5, "upstream"),
    ("bunker_c", "벙커C유", "404Y016", "30412602AA", "", "2020=100", 1.9, "upstream"),
    ("asphalt", "아스팔트", "404Y016", "30413201AA", "", "2020=100", 0.4, "upstream"),
    ("solvent", "솔벤트", "404Y016", "30413203AA", "", "2020=100", 2.0, "upstream"),
    ("ethylene", "에틸렌", "404Y016", "30511101AA", "", "2020=100", 2.2, "mid"),
    ("propylene", "프로필렌", "404Y016", "30511102AA", "", "2020=100", 1.4, "mid"),
    ("benzene", "벤젠", "404Y016", "30511201AA", "", "2020=100", 1.1, "mid"),
    ("styrene_monomer", "스티렌모노머", "404Y016", "30511307AA", "", "2020=100", 0.3, "mid"),
    ("ppg_polyol", "폴리프로필렌글리콜(폴리올)", "404Y016", "30511305AA", "", "2020=100", 0.5, "mid"),
    ("mdi", "메틸렌디이소시아네이트(MDI)", "404Y016", "30511403AA", "", "2020=100", 0.4, "mid"),
    ("plasticizer", "가소제", "404Y016", "30511407AA", "", "2020=100", 0.3, "mid"),
    ("pe_resin", "폴리에틸렌수지", "404Y016", "30521101AA", "", "2020=100", 2.0, "mid"),
    ("ps_resin", "폴리스티렌수지", "404Y016", "30521102AA", "", "2020=100", 0.3, "mid"),
    ("pvc_resin", "PVC수지", "404Y016", "30521104AA", "", "2020=100", 0.4, "mid"),
    ("epoxy_resin", "에폭시수지", "404Y016", "30521106AA", "", "2020=100", 0.2, "mid"),
    ("pu_resin", "폴리우레탄수지", "404Y016", "30521108AA", "", "2020=100", 0.1, "mid"),
    ("paint_oil", "유성페인트", "404Y016", "30561101AA", "", "2020=100", 1.0, "petro_material"),
    ("paint_water", "수성페인트", "404Y016", "30561102AA", "", "2020=100", 0.1, "petro_material"),
    ("paint_urethane", "우레탄도료", "404Y016", "30561103AA", "", "2020=100", 0.5, "petro_material"),
    ("paint_epoxy", "에폭시도료", "404Y016", "30561104AA", "", "2020=100", 0.4, "petro_material"),
    ("thinner", "신너(복합솔벤트)", "404Y016", "30561105AA", "", "2020=100", 0.1, "petro_material"),
    ("adhesive", "합성수지접착제", "404Y016", "30563101AA", "", "2020=100", 0.7, "petro_material"),
    ("plastic_sash", "플라스틱섀시바", "404Y016", "30571101AA", "", "2020=100", 0.2, "petro_material"),
    ("plastic_pipe", "플라스틱파이프", "404Y016", "30571102AA", "", "2020=100", 0.4, "petro_material"),
    ("plastic_floor", "플라스틱장판", "404Y016", "30572101AA", "", "2020=100", 0.2, "petro_material"),
    ("plastic_tile", "플라스틱타일", "404Y016", "30572102AA", "", "2020=100", 0.3, "petro_material"),
    ("plastic_window", "플라스틱창문및문", "404Y016", "30572104AA", "", "2020=100", 1.1, "petro_material"),
    ("eps_foam", "폴리스티렌발포제품(EPS 단열재)", "404Y016", "30572401AA", "", "2020=100", 1.7, "petro_material"),
    ("pur_foam", "우레탄발포제품(우레탄 단열재)", "404Y016", "30572402AA", "", "2020=100", 0.8, "petro_material"),
    ("ascon", "아스콘", "404Y016", "30624401AA", "", "2020=100", 1.0, "petro_material"),
    ("mineral_wool", "암면제품(무기 단열재)", "404Y016", "30624501AA", "", "2020=100", 0.4, "other_material"),
    ("remicon", "레미콘", "404Y016", "30623101AA", "", "2020=100", 4.8, "other_material"),
    ("mortar", "비내화모르타르", "404Y016", "30623102AA", "", "2020=100", 0.3, "other_material"),
    ("cement", "포틀랜드시멘트", "404Y016", "30622101AA", "", "2020=100", 1.3, "other_material"),
    ("crushed_stone", "쇄석(골재)", "404Y016", "20122102AA", "", "2020=100", 0.9, "other_material"),
    ("rebar", "일반철근", "404Y016", "30712101AA", "", "2020=100", 2.0, "other_material"),
    ("section_steel", "형강", "404Y016", "30712201AA", "", "2020=100", 1.2, "other_material"),
    ("flat_glass", "판유리", "404Y016", "30611101AA", "", "2020=100", 0.2, "other_material"),
    ("gypsum", "플라스터제품(석고)", "404Y016", "30624102AA", "", "2020=100", 0.3, "other_material"),
    ("metal_window", "금속제창문", "404Y016", "30811102AA", "", "2020=100", 1.5, "other_material"),
    ("truck_freight", "도로화물운송", "404Y016", "50112201AA", "", "2020=100", 14.3, "service"),
    ("power_industrial", "산업용전력", "404Y016", "40111103AA", "", "2020=100", 22.4, "service"),
    ("ppi_total", "생산자물가 총지수", "404Y014", "*AA", "", "2020=100", 1000.0, "aggregate"),
    ("chemicals", "화학제품(대분류)", "404Y014", "305AA", "", "2020=100", 84.5, "aggregate"),
]

NAME = {s[0]: s[1] for s in SERIES}
GROUP = {s[0]: s[7] for s in SERIES}

GROUP_LABEL = {
    "driver": "유가·환율",
    "upstream": "정유 원료",
    "mid": "석유화학 중간재",
    "petro_material": "석유화학 계열 건자재",
    "other_material": "비석유화학 건자재",
    "service": "운송·전력",
    "aggregate": "총지수·대분류",
}

# 원료 → 제품 전이율을 추정할 짝. 화학공학적 공정 경로를 따랐다.
PASS_THROUGH_PAIRS = [
    ("crude_imp_krw", "naphtha", "원유 → 나프타"),
    ("crude_imp_krw", "asphalt", "원유 → 아스팔트"),
    ("naphtha", "pe_resin", "나프타 → PE수지"),
    ("naphtha", "pvc_resin", "나프타 → PVC수지"),
    ("naphtha", "styrene_monomer", "나프타 → 스티렌모노머"),
    ("naphtha", "propylene", "나프타 → 프로필렌"),
    ("propylene", "ppg_polyol", "프로필렌 → 폴리올"),
    ("mdi", "pur_foam", "MDI → 우레탄 단열재"),
    ("ppg_polyol", "pur_foam", "폴리올 → 우레탄 단열재"),
    ("styrene_monomer", "eps_foam", "스티렌모노머 → EPS 단열재"),
    ("pvc_resin", "plastic_pipe", "PVC수지 → 플라스틱파이프"),
    ("pvc_resin", "plastic_window", "PVC수지 → 플라스틱 창호"),
    ("pvc_resin", "plastic_tile", "PVC수지 → 플라스틱 바닥타일"),
    ("pvc_resin", "plastic_sash", "PVC수지 → 플라스틱 섀시바"),
    ("naphtha", "paint_oil", "나프타 → 유성페인트"),
    ("naphtha", "paint_water", "나프타 → 수성페인트"),
    ("naphtha", "paint_urethane", "나프타 → 우레탄도료"),
    ("naphtha", "paint_epoxy", "나프타 → 에폭시도료"),
    ("naphtha", "adhesive", "나프타 → 합성수지접착제"),
    ("asphalt", "ascon", "아스팔트 → 아스콘"),
    ("diesel", "truck_freight", "경유 → 도로화물운송"),
]

# 시장에서 보도된 인상 요청·통보(원문 확인분). 범위는 [하한, 상한] %.
MARKET_CLAIMS = [
    # 품목군, 주체·내용, 하한, 상한, 날짜, 출처명, URL, 비교할 지표 key 목록
    ("도료", "KCC 인상 공문(이후 철회)", 10, 40, "2026-03-23", "뉴스1",
     "https://www.news1.kr/industry/sb-founded/6125783", ["paint_oil", "paint_water", "paint_urethane", "paint_epoxy"]),
    ("도료", "노루페인트 주요 제품 공문 → 평균 10% 안팎으로 하향", 20, 30, "2026-03", "뉴스1",
     "https://www.news1.kr/industry/sb-founded/6125783", ["paint_oil", "paint_water", "paint_urethane", "paint_epoxy"]),
    ("도료", "SP삼화 전 제품 평균 20% → 평균 10%로 축소", 20, 20, "2026-03-20", "뉴스1",
     "https://www.news1.kr/industry/sb-founded/6125783", ["paint_oil", "paint_water", "paint_urethane", "paint_epoxy"]),
    ("단열재 등 마감재", "현대건설 자재 협력사 안내(단열재·페인트·방수재 등)", 10, 40, "2026-04", "헤럴드경제",
     "https://heraldk.com/2026/04/14/%e2%80%9c%ec%a4%91%eb%8f%99%ec%a0%84%ec%9f%81%ec%9c%bc%eb%a1%9c-%ec%9e%90%ec%9e%ac%ec%88%98%ea%b8%89-%eb%b9%84%ec%83%81-%ea%b0%80%ea%b2%a9-%ec%9d%b8%ec%83%81%eb%8f%84-%ed%86%b5%eb%b3%b4%eb%b0%9b/",
     ["eps_foam", "pur_foam", "mineral_wool"]),
    ("단열재", "내장·단열재(EPS·우레탄) 전년 대비 상승 보도", 30, 50, "2026-04-01", "뉴시스",
     "https://www.newsis.com/view/NISX20260331_0003571306", ["eps_foam", "pur_foam", "mineral_wool"]),
    ("아스콘", "관급가격 톤당 9.4만 원 → 13만 원 예상(약 38%)", 38, 38, "2026-04-06", "전북일보",
     "https://www.jjan.kr/articleAmp/20260406500029", ["ascon"]),
]

BASE_MONTH = "2026-02"   # 전쟁 직전 달(2월 28일 개전, 월평균 대부분이 개전 전)
LAST_MONTH = "2026-09"

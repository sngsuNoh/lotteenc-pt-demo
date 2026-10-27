"""analysis/ 폴더의 원자료와 분석 결과를 웹 데모용 JSON(data/)으로 바꾼다.

실행: python tools/build_data.py   (저장소 루트에서)
필요: pandas
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

import pandas as pd

sys.dont_write_bytecode = True  # 저장소에 __pycache__를 남기지 않는다
ROOT = Path(__file__).resolve().parents[1]
AN = ROOT / "analysis"
OUT = ROOT / "data"
sys.path.insert(0, str(AN / "src"))
from config import SERIES, PASS_THROUGH_PAIRS, MARKET_CLAIMS, GROUP_LABEL  # noqa: E402

SHORT = {
    "crude_imp_krw": "원유(원화 수입물가)",
    "usdkrw": "원/달러 환율",
    "ppg_polyol": "폴리올",
    "mdi": "MDI",
    "pe_resin": "PE수지",
    "ps_resin": "PS수지",
    "pu_resin": "폴리우레탄수지",
    "thinner": "신너",
    "adhesive": "합성수지 접착제",
    "plastic_sash": "플라스틱 섀시바",
    "plastic_pipe": "플라스틱 파이프",
    "plastic_floor": "플라스틱 장판",
    "plastic_tile": "플라스틱 타일",
    "plastic_window": "플라스틱 창호",
    "eps_foam": "EPS 단열재",
    "pur_foam": "우레탄 단열재",
    "mineral_wool": "암면(무기 단열재)",
    "mortar": "모르타르",
    "cement": "시멘트",
    "crushed_stone": "쇄석(골재)",
    "rebar": "철근",
    "gypsum": "석고 제품",
    "metal_window": "금속 창호",
    "truck_freight": "도로화물운송",
    "power_industrial": "산업용 전력",
    "ppi_total": "생산자물가 총지수",
    "chemicals": "화학제품",
}

# 원료 기반 2차 점검에 쓰는 대표 경로(제품 → 원료). analysis/src/verify_tool.py와 같다.
PRIMARY_INPUT = {
    "plastic_pipe": "pvc_resin", "plastic_tile": "pvc_resin", "plastic_window": "pvc_resin",
    "pur_foam": "ppg_polyol", "eps_foam": "styrene_monomer", "paint_oil": "naphtha",
    "paint_epoxy": "naphtha", "paint_water": "naphtha", "paint_urethane": "naphtha",
    "adhesive": "naphtha", "ascon": "asphalt",
}


def num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return round(float(v), 4)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    raw = pd.read_csv(AN / "data/raw/ecos_monthly_201501_202609.csv", dtype={"month": str})
    raw2 = pd.read_csv(AN / "data/raw/ecos_monthly_201501_202609_inputs.csv", dtype={"month": str})
    df = raw.merge(raw2, on="month", how="outer").sort_values("month")
    months = [f"{m[:4]}-{m[4:6]}" for m in df["month"].astype(str)]

    series = {}
    for key, name, stat, i1, i2, unit, w, group in SERIES:
        if key not in df.columns:
            continue
        series[key] = {
            "name": name,
            "short": SHORT.get(key, name),
            "group": group,
            "unit": unit,
            "code": f"{stat}/{i1}" + (f"/{i2}" if i2 else ""),
            "values": [num(v) for v in df[key].tolist()],
        }
    market = {
        "source": "한국은행 경제통계시스템(ECOS) Open API",
        "collected": "2026-10-27",
        "asOf": months[-1],
        "provisional": ["2026-07", "2026-08", "2026-09"],
        "months": months,
        "groups": GROUP_LABEL,
        "primaryInput": PRIMARY_INPUT,
        "series": series,
    }
    (OUT / "market.json").write_text(json.dumps(market, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pt = pd.read_csv(AN / "outputs/tables/passthrough_asymmetry.csv")
    rows = []
    for _, r in pt.iterrows():
        rows.append({k: (num(r[k]) if k not in ("pair", "input", "output", "stage", "asymmetry_robust") else
                         (bool(r[k]) if k == "asymmetry_robust" else r[k]))
                     for k in ["pair", "input", "output", "stage", "up_cum", "up_lo90", "up_hi90", "down_cum",
                               "down_lo90", "down_hi90", "p_up_eq_down", "n_months", "asymmetry_robust"]})
    (OUT / "passthrough.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")

    sp = pd.read_csv(AN / "outputs/tables/shock_profile_2026.csv")
    shock = [{"key": r.series, "peak_rise_pct": num(r.peak_rise_pct), "peak_month": r.peak_month,
              "retrace_pct": num(r.retrace_after_peak_pct), "sep_vs_feb_pct": num(r.sep_vs_feb_pct)}
             for r in sp.itertuples()]
    sw = pd.read_csv(AN / "outputs/tables/second_wave_jul_sep.csv")
    wave = [{"key": r.series, "jul_to_sep_pct": num(r.jul_to_sep_pct), "feb_to_sep_pct": num(r.feb_to_sep_pct)}
            for r in sw.itertuples()]
    claims = [{"group": c[0], "claim": c[1], "lo": c[2], "hi": c[3], "date": c[4], "source": c[5], "url": c[6],
               "keys": c[7]} for c in MARKET_CLAIMS]
    (OUT / "findings.json").write_text(json.dumps({"base": "2026-02", "shock": shock, "secondWave": wave,
                                                    "claims": claims}, ensure_ascii=False, indent=0),
                                       encoding="utf-8")
    print("market series", len(series), "months", len(months), "->", OUT)


if __name__ == "__main__":
    main()

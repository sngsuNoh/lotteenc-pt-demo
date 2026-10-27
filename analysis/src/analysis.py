"""2026년 석유화학발 원가 충격의 건설자재 전이 분석.

문제: 파트너사가 "자재값이 X% 올랐다"며 증액을 요청할 때, 그 X%가
      공표 지표와 원가 구조로 설명되는가?

단계
  1) 수집   : data/raw/*.csv (ECOS Open API, fetch_ecos.py로 재현 가능)
  2) 전처리 : 월 정렬, 결측 점검, 2026년 2월=100 재기준화, 로그 차분
  3) 분석   : (a) 2026 충격 프로파일  (b) 비대칭 전이율(2015~2026)
              (c) 원료로 설명되는 상승률 vs 실제  (d) 시장 요청 vs 지표
              (e) 기준시점 민감도  (f) 2차 유가 상승기 점검
  4) 시각화 : outputs/figures/*.png
  5) 결과   : outputs/tables/*.csv, outputs/summary.json

실행: python src/analysis.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

from config import (BASE_MONTH, GROUP, GROUP_LABEL, LAST_MONTH, MARKET_CLAIMS,
                    NAME, PASS_THROUGH_PAIRS)

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
FIG = ROOT / "outputs" / "figures"
TAB = ROOT / "outputs" / "tables"
for p in (PROC, FIG, TAB):
    p.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- 그림 스타일
for f in ("Noto Sans CJK KR", "NanumGothic", "Malgun Gothic", "AppleGothic"):
    if any(f in x.name for x in font_manager.fontManager.ttflist):
        plt.rcParams["font.family"] = f
        break
plt.rcParams.update({
    "axes.unicode_minus": False, "axes.spines.top": False, "axes.spines.right": False,
    "axes.edgecolor": "#9aa0a6", "axes.labelcolor": "#3c4043", "xtick.color": "#5f6368",
    "ytick.color": "#5f6368", "font.size": 10.5, "axes.titlesize": 13, "axes.titleweight": "bold",
    "figure.dpi": 150, "savefig.bbox": "tight",
})
ACCENT, GREY, LIGHT, INK = "#1a73e8", "#80868b", "#dadce0", "#202124"
GROUP_COLOR = {"upstream": "#5f6368", "mid": "#9aa0a6", "petro_material": ACCENT,
               "other_material": "#c5c9ce", "service": "#c5c9ce", "driver": "#5f6368", "aggregate": "#c5c9ce"}


# ---------------------------------------------------------------- 1) 수집 결과 읽기
def load() -> pd.DataFrame:
    a = pd.read_csv(RAW / "ecos_monthly_201501_202609.csv", dtype={"month": str})
    b = pd.read_csv(RAW / "ecos_monthly_201501_202609_inputs.csv", dtype={"month": str})
    df = a.merge(b, on="month", how="outer")
    df["date"] = pd.to_datetime(df["month"], format="%Y%m")
    return df.set_index("date").drop(columns="month").sort_index()


# ---------------------------------------------------------------- 2) 전처리
def preprocess(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    quality = pd.DataFrame({
        "series": df.columns,
        "name": [NAME.get(c, c) for c in df.columns],
        "group": [GROUP_LABEL.get(GROUP.get(c, ""), "") for c in df.columns],
        "first": [df[c].first_valid_index().strftime("%Y-%m") for c in df.columns],
        "last": [df[c].last_valid_index().strftime("%Y-%m") for c in df.columns],
        "n_obs": [int(df[c].notna().sum()) for c in df.columns],
        "n_missing": [int(df[c].isna().sum()) for c in df.columns],
    })
    base = df.loc[BASE_MONTH].iloc[0]
    rebased = df.divide(base) * 100
    dlog = np.log(df).diff()
    quality.to_csv(TAB / "data_quality.csv", index=False, encoding="utf-8-sig")
    rebased.round(2).to_csv(PROC / "indices_rebased_202602.csv", encoding="utf-8-sig")
    dlog.round(5).to_csv(PROC / "monthly_log_change.csv", encoding="utf-8-sig")
    return rebased, dlog, quality


# ---------------------------------------------------------------- 3a) 2026 충격 프로파일
def shock_profile(df: pd.DataFrame) -> pd.DataFrame:
    base = df.loc[BASE_MONTH].iloc[0]
    win = df.loc["2026-03":LAST_MONTH]
    rows = []
    for k in df.columns:
        if k in ("usdkrw",):
            continue
        s = win[k].dropna()
        if s.empty:
            continue
        pk_m = s.idxmax(); pk = s.max()
        after = df.loc[pk_m:LAST_MONTH, k]
        trough = after.min()
        rise = pk / base[k] - 1
        retr = (pk - trough) / (pk - base[k]) if pk > base[k] * 1.005 else np.nan
        rows.append({
            "series": k, "name": NAME.get(k, k), "group": GROUP.get(k, ""),
            "group_label": GROUP_LABEL.get(GROUP.get(k, ""), ""),
            "base_2026_02": round(base[k], 2),
            "peak": round(pk, 2), "peak_month": pk_m.strftime("%Y-%m"),
            "peak_rise_pct": round(rise * 100, 1),
            "sep_vs_feb_pct": round((df.loc[LAST_MONTH, k].iloc[0] / base[k] - 1) * 100, 1),
            "retrace_after_peak_pct": None if np.isnan(retr) else round(retr * 100, 0),
            "yoy_sep_pct": round((df.loc[LAST_MONTH, k].iloc[0] / df.loc["2025-09", k].iloc[0] - 1) * 100, 1),
        })
    t = pd.DataFrame(rows).sort_values("peak_rise_pct", ascending=False)
    t.to_csv(TAB / "shock_profile_2026.csv", index=False, encoding="utf-8-sig")
    return t


# ---------------------------------------------------------------- 3b) 비대칭 전이율
def _lin(m, w):
    w = np.asarray(w, dtype=float)
    return float(w @ m.params.values), float(np.sqrt(w @ m.cov_params().values @ w))


def fit_asymmetric(dlog: pd.DataFrame, x: str, y: str, lags: int = 6, end: str | None = None) -> dict:
    """Δln y_t = a + Σ_k b+_k·max(Δln x_{t-k},0) + Σ_k b-_k·min(Δln x_{t-k},0) + e (Newey-West 6)."""
    d = pd.DataFrame({"y": dlog[y]})
    for k in range(lags + 1):
        d[f"up{k}"] = dlog[x].shift(k).clip(lower=0)
        d[f"dn{k}"] = dlog[x].shift(k).clip(upper=0)
    d = d.dropna()
    if end:
        d = d.loc[:end]
    m = sm.OLS(d["y"], sm.add_constant(d.drop(columns="y"))).fit(cov_type="HAC", cov_kwds={"maxlags": 6})
    idx = list(m.params.index)
    wu = [1.0 if c.startswith("up") else 0.0 for c in idx]
    wd = [1.0 if c.startswith("dn") else 0.0 for c in idx]
    up, se_u = _lin(m, wu); dn, se_d = _lin(m, wd); diff, se_diff = _lin(m, [a - b for a, b in zip(wu, wd)])
    z90 = stats.norm.ppf(0.95)
    return {"up": up, "up_lo": up - z90 * se_u, "up_hi": up + z90 * se_u,
            "down": dn, "down_lo": dn - z90 * se_d, "down_hi": dn + z90 * se_d,
            "p_asym": 2 * (1 - stats.norm.cdf(abs(diff / se_diff))), "r2": m.rsquared, "n": len(d)}


def passthrough(dlog: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for x, y, label in PASS_THROUGH_PAIRS:
        base = fit_asymmetric(dlog, x, y, 6)
        l3 = fit_asymmetric(dlog, x, y, 3); l9 = fit_asymmetric(dlog, x, y, 9)
        pre = fit_asymmetric(dlog, x, y, 6, end="2025-12-01")
        robust = all(r["up"] > r["down"] for r in (base, l3, l9, pre)) and base["p_asym"] < 0.1 and pre["p_asym"] < 0.2
        rows.append({
            "pair": label, "input": x, "output": y, "stage": GROUP_LABEL.get(GROUP.get(y, ""), ""),
            "up_cum": round(base["up"], 3), "up_lo90": round(base["up_lo"], 3), "up_hi90": round(base["up_hi"], 3),
            "down_cum": round(base["down"], 3), "down_lo90": round(base["down_lo"], 3), "down_hi90": round(base["down_hi"], 3),
            "p_up_eq_down": round(base["p_asym"], 3), "r2": round(base["r2"], 2), "n_months": base["n"],
            "up_lag3": round(l3["up"], 3), "down_lag3": round(l3["down"], 3),
            "up_lag9": round(l9["up"], 3), "down_lag9": round(l9["down"], 3),
            "up_pre2026": round(pre["up"], 3), "down_pre2026": round(pre["down"], 3), "p_pre2026": round(pre["p_asym"], 3),
            "asymmetry_robust": robust,
        })
    t = pd.DataFrame(rows)
    t.to_csv(TAB / "passthrough_asymmetry.csv", index=False, encoding="utf-8-sig")
    return t


# ---------------------------------------------------------------- 3c) 원료로 설명되는 상승률
def explained_vs_actual(df: pd.DataFrame, pt: pd.DataFrame) -> pd.DataFrame:
    base = df.loc[BASE_MONTH].iloc[0]
    win = df.loc["2026-03":LAST_MONTH]
    picks = ["아스팔트 → 아스콘", "PVC수지 → 플라스틱파이프", "MDI → 우레탄 단열재", "폴리올 → 우레탄 단열재",
             "스티렌모노머 → EPS 단열재", "나프타 → 유성페인트", "나프타 → 에폭시도료", "나프타 → 합성수지접착제",
             "PVC수지 → 플라스틱 바닥타일"]
    rows = []
    for _, r in pt[pt["pair"].isin(picks)].iterrows():
        x, y = r["input"], r["output"]
        y_pk_m = win[y].idxmax()
        x_pk = df.loc["2026-03":y_pk_m, x].max()
        lx = math.log(x_pk / base[x])
        exp_mid = math.exp(r["up_cum"] * lx) - 1
        exp_lo = math.exp(r["up_lo90"] * lx) - 1
        exp_hi = math.exp(r["up_hi90"] * lx) - 1
        actual = win[y].max() / base[y] - 1
        verdict = "원료로 설명됨" if exp_lo <= actual <= exp_hi else ("원료 대비 초과 상승" if actual > exp_hi else "원료 대비 덜 오름")
        rows.append({"pair": r["pair"], "input_rise_pct": round((x_pk / base[x] - 1) * 100, 1),
                     "explained_pct": round(exp_mid * 100, 1), "explained_lo90": round(exp_lo * 100, 1),
                     "explained_hi90": round(exp_hi * 100, 1), "actual_peak_pct": round(actual * 100, 1),
                     "verdict": verdict})
    t = pd.DataFrame(rows)
    t.to_csv(TAB / "explained_vs_actual_2026.csv", index=False, encoding="utf-8-sig")
    return t


# ---------------------------------------------------------------- 3d) 시장 요청 vs 지표
def claims_vs_index(prof: pd.DataFrame) -> pd.DataFrame:
    p = prof.set_index("series")
    rows = []
    for grp, who, lo, hi, date, src, url, keys in MARKET_CLAIMS:
        idx = {NAME[k]: p.loc[k, "peak_rise_pct"] for k in keys}
        rows.append({"group": grp, "claim": who, "claim_lo_pct": lo, "claim_hi_pct": hi, "date": date,
                     "source": src, "url": url,
                     "index_min_pct": min(idx.values()), "index_max_pct": max(idx.values()),
                     "index_detail": "; ".join(f"{k} {v:+.1f}%" for k, v in idx.items())})
    t = pd.DataFrame(rows)
    t.to_csv(TAB / "claims_vs_index.csv", index=False, encoding="utf-8-sig")
    return t


# ---------------------------------------------------------------- 3e) 기준시점 민감도
def base_month_sensitivity(df: pd.DataFrame) -> pd.DataFrame:
    items = ["eps_foam", "pur_foam", "ascon", "plastic_pipe", "paint_oil", "rebar", "remicon"]
    bases = ["2025-06", "2025-09", "2025-12", "2026-02"]
    rows = []
    for k in items:
        comp_m = df.loc["2026-03":LAST_MONTH, k].idxmax()
        comp = df.loc[comp_m, k]
        row = {"series": k, "name": NAME[k], "compare_month": comp_m.strftime("%Y-%m")}
        for b in bases:
            row[f"from_{b}"] = round((comp / df.loc[b, k].iloc[0] - 1) * 100, 1)
        row["spread_pp"] = round(max(row[f"from_{b}"] for b in bases) - min(row[f"from_{b}"] for b in bases), 1)
        rows.append(row)
    t = pd.DataFrame(rows)
    t.to_csv(TAB / "base_month_sensitivity.csv", index=False, encoding="utf-8-sig")
    return t


# ---------------------------------------------------------------- 3f) 2차 유가 상승기(7~9월)
def second_wave(df: pd.DataFrame) -> pd.DataFrame:
    keys = ["dubai", "crude_imp_krw", "naphtha", "pvc_resin", "pe_resin", "pur_foam", "eps_foam",
            "ascon", "plastic_pipe", "paint_oil", "adhesive", "rebar"]
    rows = []
    for k in keys:
        jul = df.loc["2026-07", k].iloc[0]; sep = df.loc["2026-09", k].iloc[0]; feb = df.loc[BASE_MONTH, k].iloc[0]
        rows.append({"series": k, "name": NAME[k], "jul_to_sep_pct": round((sep / jul - 1) * 100, 1),
                     "feb_to_sep_pct": round((sep / feb - 1) * 100, 1)})
    t = pd.DataFrame(rows)
    t.to_csv(TAB / "second_wave_jul_sep.csv", index=False, encoding="utf-8-sig")
    return t


# ---------------------------------------------------------------- 4) 시각화
def fig_dispersion(prof: pd.DataFrame) -> None:
    keep = ["crude_imp_krw", "naphtha", "asphalt", "pe_resin", "pvc_resin", "mdi", "ppg_polyol", "styrene_monomer",
            "pur_foam", "ascon", "adhesive", "plastic_pipe", "eps_foam", "paint_epoxy", "paint_oil", "plastic_tile",
            "plastic_window", "rebar", "section_steel", "metal_window", "remicon", "gypsum", "cement", "mineral_wool"]
    t = prof.set_index("series").loc[keep].reset_index().sort_values("peak_rise_pct")
    fig, ax = plt.subplots(figsize=(9.6, 7.6))
    colors = [GROUP_COLOR[g] for g in t["group"]]
    ax.barh(t["name"], t["peak_rise_pct"], color=colors, height=0.66)
    for i, (v, k) in enumerate(zip(t["peak_rise_pct"], t["series"])):
        bold = k in ("pur_foam", "eps_foam", "mineral_wool")
        ax.text(v + 1, i, f"{v:+.1f}%", va="center", fontsize=9.5, color=INK, fontweight="bold" if bold else "normal")
    for lab in ax.get_yticklabels():
        if any(w in lab.get_text() for w in ("단열재",)):
            lab.set_fontweight("bold"); lab.set_color(INK)
    ax.set_xlabel("2026년 2월 대비 3~9월 중 고점 상승률(%)")
    ax.set_xlim(0, 100)
    ax.grid(axis="x", color=LIGHT, linewidth=0.8); ax.set_axisbelow(True)
    ax.set_title("같은 유가 충격, 자재마다 다른 상승률: 단열재만 봐도 0%에서 66%까지", loc="left")
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(color=GROUP_COLOR["upstream"], label="정유 원료·유가"),
                       Patch(color=GROUP_COLOR["mid"], label="석유화학 중간재"),
                       Patch(color=GROUP_COLOR["petro_material"], label="석유화학 계열 건자재"),
                       Patch(color=GROUP_COLOR["other_material"], label="비석유화학 건자재")],
              loc="lower right", frameon=False, fontsize=9.5)
    fig.text(0.01, -0.01, "자료: 한국은행 ECOS 생산자물가지수(품목별)·수입물가지수(원유, 원화기준), 2026.9 잠정. 지원자 계산.",
             fontsize=8.5, color=GREY)
    fig.savefig(FIG / "fig1_dispersion_2026.png"); plt.close(fig)


def _repel(ys, min_gap):
    """라벨 y 위치가 min_gap 이상 떨어지도록 위아래로 민다(순서 유지)."""
    order = sorted(range(len(ys)), key=lambda i: ys[i])
    pos = [ys[i] for i in order]
    for _ in range(50):
        moved = False
        for j in range(1, len(pos)):
            if pos[j] - pos[j - 1] < min_gap:
                mid = (pos[j] + pos[j - 1]) / 2
                pos[j - 1], pos[j] = mid - min_gap / 2, mid + min_gap / 2
                moved = True
        if not moved:
            break
    out = [0.0] * len(ys)
    for k, i in enumerate(order):
        out[i] = pos[k]
    return out


def fig_sticky(rebased: pd.DataFrame) -> None:
    r = rebased.loc["2026-01":LAST_MONTH]
    x = [d.strftime("%y.%m").replace(".0", ".") for d in r.index]
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.6), sharey=True)
    up = [("crude_imp_krw", "원유(원화)"), ("naphtha", "나프타"), ("pvc_resin", "PVC수지"), ("pe_resin", "PE수지")]
    dn = [("pur_foam", "우레탄 단열재"), ("ascon", "아스콘"), ("plastic_pipe", "플라스틱파이프"), ("paint_oil", "유성페인트"), ("eps_foam", "EPS 단열재")]
    for ax, series, title in ((axes[0], up, "원료·중간재: 6~7월 크게 되돌렸다가 9월 다시 상승"), (axes[1], dn, "건자재: 4~5월 고점에서 거의 움직이지 않음")):
        ends = [float(r[k].iloc[-1]) for k, _ in series]
        ly = _repel(ends, 6.5)
        for i, (k, lab) in enumerate(series):
            c = ACCENT if (ax is axes[1] and k == "pur_foam") else (INK if i == 0 else GREY)
            lw = 2.4 if c in (ACCENT, INK) else 1.6
            ax.plot(x, r[k], color=c, lw=lw)
            ax.text(len(x) - 0.85, ly[i], f"{lab} {ends[i]:.0f}", va="center", fontsize=9, color=c)
        ax.axhline(100, color=LIGHT, lw=1)
        ax.set_title(title, loc="left", fontsize=11.5)
        ax.set_xlim(-0.3, len(x) + 1.9)
        ax.grid(axis="y", color=LIGHT, lw=0.6); ax.set_axisbelow(True)
    axes[0].set_ylabel("2026년 2월 = 100")
    fig.suptitle("원료는 출렁였지만 건자재는 고점에 머물렀다", x=0.01, ha="left", fontsize=14, fontweight="bold")
    fig.text(0.01, -0.03, "자료: 한국은행 ECOS 생산자물가지수(품목별)·수입물가지수, 2026.9 잠정. 지원자 계산.", fontsize=8.5, color=GREY)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(FIG / "fig2_sticky_prices.png"); plt.close(fig)


def fig_asymmetry(pt: pd.DataFrame) -> None:
    picks = ["원유 → 나프타", "나프타 → PE수지", "PVC수지 → 플라스틱파이프", "PVC수지 → 플라스틱 바닥타일",
             "MDI → 우레탄 단열재", "나프타 → 합성수지접착제", "나프타 → 유성페인트", "아스팔트 → 아스콘"]
    t = pt.set_index("pair").loc[picks].reset_index()[::-1]
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    for i, r in enumerate(t.itertuples()):
        ax.plot([r.down_cum, r.up_cum], [i, i], color=LIGHT, lw=3, zorder=1)
        ax.scatter(r.down_cum, i, color=GREY, s=60, zorder=2)
        sig = r.p_up_eq_down < 0.05
        ax.scatter(r.up_cum, i, color=ACCENT if sig else "#8ab4f8", s=70, zorder=3)
        ax.text(max(r.up_cum, r.down_cum) + 0.05, i, f"상승 {r.up_cum:.2f} / 하락 {r.down_cum:.2f}" + ("  *" if sig else ""),
                va="center", fontsize=9, color=INK)
    ax.set_yticks(range(len(t))); ax.set_yticklabels(t["pair"])
    ax.axvline(0, color=LIGHT, lw=1)
    ax.set_xlim(-0.2, 2.1)
    ax.set_xlabel("원료 1% 변동이 6개월간 제품 가격에 전이되는 비율(누적 탄력성)")
    ax.set_title("상승은 넘기고 하락은 덜 넘긴다: 2015~2026년 134개월 추정", loc="left")
    ax.text(0.99, 0.02, "* 상승·하락 전이율 차이 유의(p<0.05)\n파란 점 = 상승 시, 회색 점 = 하락 시", transform=ax.transAxes,
            ha="right", va="bottom", fontsize=8.5, color=GREY)
    ax.grid(axis="x", color=LIGHT, lw=0.6); ax.set_axisbelow(True)
    fig.text(0.01, -0.02, "자료: 한국은행 ECOS. 비대칭 분포시차 회귀(시차 0~6개월), Newey-West 표준오차. 지원자 계산.",
             fontsize=8.5, color=GREY)
    fig.savefig(FIG / "fig3_asymmetric_passthrough.png"); plt.close(fig)


def fig_claims(prof: pd.DataFrame) -> None:
    p = prof.set_index("series")
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.4))
    # 도료
    ax = axes[0]
    claims = [("KCC 공문(철회)", 10, 40), ("노루 공문", 20, 30), ("삼화 공문", 20, 20), ("삼화·노루 하향 후", 10, 10)]
    idx = [("유성페인트", p.loc["paint_oil", "peak_rise_pct"]), ("수성페인트", p.loc["paint_water", "peak_rise_pct"]),
           ("우레탄도료", p.loc["paint_urethane", "peak_rise_pct"]), ("에폭시도료", p.loc["paint_epoxy", "peak_rise_pct"])]
    labels = [c[0] for c in claims] + [f"지표: {n}" for n, _ in idx]
    for i, (n, lo, hi) in enumerate(claims):
        if lo == hi:
            ax.scatter(lo, i, color=GREY, s=60, marker="s", zorder=3)
        else:
            ax.plot([lo, hi], [i, i], color=GREY, lw=6, solid_capstyle="round")
        ax.text(hi + 1.2, i, f"{lo}~{hi}%" if lo != hi else f"{lo}%", va="center", fontsize=9)
    for j, (n, v) in enumerate(idx):
        yy = len(claims) + j
        ax.scatter(v, yy, color=ACCENT, s=60, zorder=3); ax.text(v + 1.2, yy, f"{v:+.1f}%", va="center", fontsize=9, color=ACCENT)
    ax.set_yticks(range(len(labels))); ax.set_yticklabels(labels); ax.invert_yaxis()
    ax.set_xlim(0, 50); ax.grid(axis="x", color=LIGHT, lw=0.6); ax.set_axisbelow(True)
    ax.set_title("도료: 공문 10~40% → 2주 만에 10% 안팎, 지표 9~14%", loc="left", fontsize=11.5)
    # 단열재
    ax = axes[1]
    claims2 = [("협력사 안내(현대건설 현장)", 10, 40), ("보도: 내장·단열재 전년比", 30, 50)]
    idx2 = [("지표: 우레탄 단열재", p.loc["pur_foam", "peak_rise_pct"]), ("지표: EPS 단열재", p.loc["eps_foam", "peak_rise_pct"]),
            ("지표: 암면(무기 단열재)", p.loc["mineral_wool", "peak_rise_pct"])]
    labels2 = [c[0] for c in claims2] + [n for n, _ in idx2]
    for i, (n, lo, hi) in enumerate(claims2):
        ax.plot([lo, hi], [i, i], color=GREY, lw=6, solid_capstyle="round"); ax.text(hi + 1.5, i, f"{lo}~{hi}%", va="center", fontsize=9)
    for j, (n, v) in enumerate(idx2):
        yy = len(claims2) + j
        ax.scatter(v, yy, color=ACCENT, s=60, zorder=3); ax.text(v + 1.5, yy, f"{v:+.1f}%", va="center", fontsize=9, color=ACCENT)
    ax.set_yticks(range(len(labels2))); ax.set_yticklabels(labels2); ax.invert_yaxis()
    ax.set_xlim(0, 80); ax.grid(axis="x", color=LIGHT, lw=0.6); ax.set_axisbelow(True)
    ax.set_title("단열재: 같은 '30~50%'도 원료별로 0~66%", loc="left", fontsize=11.5)
    fig.suptitle("요청·통보 상승률(회색 막대)과 공표 지표(파란 점)", x=0.01, ha="left", fontsize=14, fontweight="bold")
    fig.text(0.01, -0.04, "자료: 뉴스1(2026.4.6), 헤럴드경제(2026.4.14), 뉴시스(2026.4.1), 한국은행 ECOS(2026년 2월 대비 고점). 지원자 정리.",
             fontsize=8.5, color=GREY)
    fig.tight_layout(rect=(0, 0, 1, 0.92))
    fig.savefig(FIG / "fig4_claims_vs_index.png"); plt.close(fig)


# ---------------------------------------------------------------- 실행
def main() -> dict:
    df = load()
    rebased, dlog, quality = preprocess(df)
    prof = shock_profile(df)
    pt = passthrough(dlog)
    ex = explained_vs_actual(df, pt)
    cl = claims_vs_index(prof)
    bs = base_month_sensitivity(df)
    sw = second_wave(df)
    fig_dispersion(prof); fig_sticky(rebased); fig_asymmetry(pt); fig_claims(prof)

    p = prof.set_index("series")
    summary = {
        "data": {"n_series": int(df.shape[1]), "months": f"{df.index.min():%Y-%m}~{df.index.max():%Y-%m}",
                 "n_months": int(df.shape[0]), "n_values": int(df.notna().sum().sum())},
        "shock": {k: {"peak_rise_pct": float(p.loc[k, "peak_rise_pct"]), "peak_month": p.loc[k, "peak_month"],
                      "retrace_pct": (None if pd.isna(p.loc[k, "retrace_after_peak_pct"]) else float(p.loc[k, "retrace_after_peak_pct"])),
                      "sep_vs_feb_pct": float(p.loc[k, "sep_vs_feb_pct"])}
                  for k in p.index},
        "asymmetry_robust_pairs": pt.loc[pt["asymmetry_robust"], "pair"].tolist(),
        "explained_vs_actual": ex.to_dict(orient="records"),
        "base_month_sensitivity": bs.to_dict(orient="records"),
        "second_wave": sw.to_dict(orient="records"),
    }
    (ROOT / "outputs" / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    s = main()
    print(json.dumps({k: s[k] for k in ("data", "asymmetry_robust_pairs")}, ensure_ascii=False, indent=2))

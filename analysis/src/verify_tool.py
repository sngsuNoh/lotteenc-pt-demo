"""자재비 증액 요청 적정성 검증 엔진 (프로토타입).

파트너사 요청 한 건을 받아 '자격 → 사실 → 범위 → 산정 → 결정' 5단계로
검증하고, 판정·인정액·근거·일정·브리지 차트를 만든다.

판정 규칙(정책 변수는 PolicyParams에서 조정)
  - 지표 상승률 ≤ 0            → 기각, 하락 반영 검토
  - 요청 ≤ 지표 + 허용오차      → 신속 반영(요청액 인정)
  - 요청 ≤ 지표 × 소명배수      → 소명 요청(지표만큼 우선 인정, 증빙 시 추가)
  - 그 외                      → 정밀 검증(지표만큼 우선 인정, 원가 구조·복수 견적·편승 점검)

실행 예: python src/verify_tool.py --requests data/requests_sample.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

import analysis  # 그림 스타일과 데이터 로더 재사용
from config import NAME

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "verification"
OUT.mkdir(parents=True, exist_ok=True)

# 원료 기반 2차 점검에 쓰는 대표 경로(제품 → 원료). analysis.passthrough 결과와 짝을 맞춘다.
PRIMARY_INPUT = {
    "plastic_pipe": "pvc_resin", "plastic_tile": "pvc_resin", "plastic_window": "pvc_resin",
    "pur_foam": "ppg_polyol", "eps_foam": "styrene_monomer", "paint_oil": "naphtha",
    "paint_epoxy": "naphtha", "paint_water": "naphtha", "paint_urethane": "naphtha",
    "adhesive": "naphtha", "ascon": "asphalt",
}


@dataclass
class PolicyParams:
    tolerance_pp: float = 0.03      # 운반비·소량 구매·규격 차이 등을 흡수하는 허용오차
    explain_multiple: float = 1.5   # 지표의 몇 배까지를 '소명 요청'으로 볼지
    consult_days: int = 10          # 하도급법 제16조의2: 협의 개시 기한
    decide_days: int = 30           # 미합의 시 분쟁조정 신청 가능 시점(결론 목표)


@dataclass
class Request:
    request_id: str
    partner: str
    channel: str                    # 외주 파트너사(사급자재) / 자재 파트너사(직접 구매)
    subcontract: bool               # 하도급법 적용 거래(하도급·제조위탁) 여부
    item: str                       # 지표 key(config.SERIES)
    material_cost: float            # 조정 대상 자재의 계약 재료비(원)
    base_month: str                 # 계약 또는 직전 조정 기준월 YYYY-MM
    request_month: str              # 비교월(요청 시점) YYYY-MM
    requested_rate: float           # 요청 상승률(0.40 = 40%)
    progress_done: float = 0.0      # 기준월 이후 이미 기성 처리(납품)된 비율
    prepurchased: float = 0.0       # 잔여분 중 기준월 이전 매입 재고 비율
    advance_funded: float = 0.0     # 잔여분 중 선급금으로 확보한 비율
    linked: bool = False            # 연동 약정 여부
    link_ratio: float = 1.0         # 반영비율
    link_threshold: float = 0.0     # 조정요건(지표 변동률 기준)
    partner_delay_months: int = 0   # 파트너사 귀책 지연 개월(원래 공정 시점으로 비교월 이동)
    evidence_rate: float | None = None  # 실매입 증빙 상승률(제출 시)
    received: str = ""              # 접수일 YYYY-MM-DD
    note: str = ""


@dataclass
class Result:
    request_id: str
    decision: str
    index_rate: float
    explained_band: tuple | None
    eligible_cost: float
    recognized_now: float
    recognized_max: float
    requested_amount: float
    steps: dict = field(default_factory=dict)
    schedule: dict = field(default_factory=dict)
    bridge: list = field(default_factory=list)


def _shift_month(ym: str, months: int) -> str:
    y, m = map(int, ym.split("-"))
    t = y * 12 + (m - 1) - months
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


class Verifier:
    def __init__(self, policy: PolicyParams | None = None):
        self.policy = policy or PolicyParams()
        self.df = analysis.load()
        pt_path = ROOT / "outputs" / "tables" / "passthrough_asymmetry.csv"
        if not pt_path.exists():
            analysis.main()
        self.pt = pd.read_csv(pt_path)

    def idx(self, key: str, ym: str) -> float:
        return float(self.df.loc[ym, key].iloc[0])

    def explained_band(self, item: str, base: str, comp: str):
        x = PRIMARY_INPUT.get(item)
        if not x:
            return None
        row = self.pt[(self.pt["input"] == x) & (self.pt["output"] == item)]
        if row.empty:
            return None
        r = row.iloc[0]
        win = self.df.loc[base:comp, x]
        lx = math.log(win.max() / self.idx(x, base)) if win.max() > self.idx(x, base) else math.log(self.idx(x, comp) / self.idx(x, base))
        b = r["up_cum"] if lx > 0 else r["down_cum"]
        lo, hi = (r["up_lo90"], r["up_hi90"]) if lx > 0 else (r["down_lo90"], r["down_hi90"])
        e_lo, e_mid, e_hi = (math.exp(v * lx) - 1 for v in (lo, b, hi))
        e_lo, e_hi = min(e_lo, e_hi), max(e_lo, e_hi)
        return (NAME[x], round(e_lo, 4), round(e_mid, 4), round(e_hi, 4))

    def verify(self, q: Request) -> Result:
        P = self.policy
        steps = {}
        # 1) 자격
        comp = _shift_month(q.request_month, q.partner_delay_months)
        track = ("하도급법 제16조의2 조정협의(10일 내 협의 개시, 30일 내 미합의 시 분쟁조정 가능)" if q.subcontract
                 else "구매계약 조건에 따른 단가 협의(상생협약의 비상시기 신속 조정 기준 준용)")
        elig = [f"요청 경로: {q.channel}", f"적용 절차: {track}"]
        if q.linked:
            elig.append(f"연동 약정 우선: 반영비율 {q.link_ratio:.0%}, 조정요건 {q.link_threshold:.0%}")
        if q.partner_delay_months:
            elig.append(f"파트너사 귀책 지연 {q.partner_delay_months}개월: 비교월을 원래 공정 시점 {comp}로 조정")
        steps["1_자격"] = elig

        # 2) 사실
        i0, i1 = self.idx(q.item, q.base_month), self.idx(q.item, comp)
        idx_rate = i1 / i0 - 1
        band = self.explained_band(q.item, q.base_month, comp)
        fact = [f"공표 지표({NAME[q.item]}) {q.base_month} {i0:.2f} → {comp} {i1:.2f}: {idx_rate:+.1%}",
                f"요청 상승률 {q.requested_rate:+.1%} (지표 대비 {q.requested_rate - idx_rate:+.1%}p)"]
        if band:
            fact.append(f"원료({band[0]}) 기반 설명 범위: {band[1]:+.1%} ~ {band[3]:+.1%} (중앙 {band[2]:+.1%})")
        if q.evidence_rate is not None:
            fact.append(f"실매입 증빙 상승률 {q.evidence_rate:+.1%}")

        if idx_rate <= 0:
            decision = "기각 · 하락 반영 검토"
        elif q.requested_rate <= idx_rate + P.tolerance_pp:
            decision = "신속 반영"
        elif q.requested_rate <= max(idx_rate * P.explain_multiple, idx_rate + P.tolerance_pp):
            decision = "소명 요청"
        else:
            decision = "정밀 검증"
        if q.linked:
            decision = "연동 산식 적용" if abs(idx_rate) >= q.link_threshold else "연동 조정요건 미충족(조정협의로 전환)"
        steps["2_사실"] = fact

        # 3) 범위
        remaining = 1 - q.progress_done
        excl = q.prepurchased + q.advance_funded
        share = remaining * (1 - excl)
        eligible = q.material_cost * share
        steps["3_범위"] = [f"기준월 이후 기성 처리분 {q.progress_done:.0%} 제외 → 잔여 {remaining:.0%}",
                          f"잔여분 중 선매입 재고 {q.prepurchased:.0%}, 선급금 확보분 {q.advance_funded:.0%} 제외",
                          f"조정 대상 재료비 {eligible:,.0f}원 (계약 재료비의 {share:.0%})"]

        # 4) 산정
        if decision.startswith("연동 산식"):
            rate_now = idx_rate * q.link_ratio
        elif decision == "신속 반영":
            rate_now = q.requested_rate
        elif decision.startswith("기각") or decision.startswith("연동 조정요건"):
            rate_now = 0.0
        else:
            rate_now = idx_rate
        rate_max = rate_now
        if decision in ("소명 요청", "정밀 검증"):
            cap = q.requested_rate
            rate_max = min(cap, max(idx_rate + P.tolerance_pp, q.evidence_rate or 0)) if q.evidence_rate else min(cap, idx_rate + P.tolerance_pp)
        recognized_now = eligible * rate_now
        recognized_max = eligible * max(rate_max, rate_now)
        requested_amount = q.material_cost * q.requested_rate
        steps["4_산정"] = [f"인정 증액 = 조정 대상 재료비 × 적용 상승률 = {eligible:,.0f} × {rate_now:.1%} = {recognized_now:,.0f}원",
                          f"소명 시 최대 {recognized_max:,.0f}원" if recognized_max > recognized_now else "추가 인정 없음",
                          "가격 하락 시 같은 산식으로 감액(대칭 조항)"]

        # 5) 결정·일정
        rcv = date.fromisoformat(q.received) if q.received else None
        schedule = {}
        if rcv:
            schedule = {"접수": rcv.isoformat(), "협의 개시 기한": (rcv + timedelta(days=P.consult_days)).isoformat(),
                        "결론 목표일": (rcv + timedelta(days=P.decide_days)).isoformat()}
        action = {
            "신속 반영": "요청액 인정. 합의서에 기준월·지표·산식·다음 점검월·하락 시 감액 명시",
            "소명 요청": "지표 상승분 우선 인정, 초과분은 해당 품목 세금계산서·거래명세서 제출 시 추가 인정",
            "정밀 검증": "지표 상승분 우선 인정, 초과분은 원가 구조 소명·복수 견적·직접 구매 단가 대조 후 판단(편승 점검)",
            "기각 · 하락 반영 검토": "지표가 오르지 않아 증액 근거 없음. 성실 협의 후 서면 회신, 하락분 감액 협의 검토",
        }.get(decision, "약정 산식대로 조정, 다음 조정 주기 확인")
        steps["5_결정"] = [f"판정: {decision}", f"조치: {action}"]

        bridge = [
            ("요청액", requested_amount, "total"),
            ("기성 처리분 제외", -q.material_cost * q.progress_done * q.requested_rate, "delta"),
            ("선매입·선급금분 제외", -q.material_cost * remaining * excl * q.requested_rate, "delta"),
            ("지표 기준 조정", eligible * (rate_now - q.requested_rate), "delta"),
            ("인정액", recognized_now, "end"),
        ]
        return Result(q.request_id, decision, round(idx_rate, 4), band, round(eligible), round(recognized_now),
                      round(recognized_max), round(requested_amount), steps, schedule,
                      [(a, round(b), c) for a, b, c in bridge])

    # ---------------------------------------------------------------- 산출물
    def memo(self, q: Request, r: Result) -> str:
        lines = [f"# 자재비 증액 요청 검증 메모: {q.request_id}", "",
                 f"- 파트너사: {q.partner} / 자재: {NAME[q.item]} / 기준월 {q.base_month} → 비교월 {q.request_month}",
                 f"- 요청: {q.requested_rate:.0%} ({r.requested_amount:,.0f}원) → 판정 **{r.decision}**, 우선 인정 {r.recognized_now:,.0f}원"
                 + (f", 소명 시 최대 {r.recognized_max:,.0f}원" if r.recognized_max > r.recognized_now else ""), ""]
        for k, v in r.steps.items():
            lines.append(f"## {k.split('_', 1)[1]}")
            lines += [f"- {x}" for x in v]
            lines.append("")
        if r.schedule:
            lines.append("## 일정")
            lines += [f"- {k}: {v}" for k, v in r.schedule.items()]
        if q.note:
            lines += ["", f"> 참고: {q.note}"]
        return "\n".join(lines)

    def bridge_png(self, q: Request, r: Result, path: Path) -> None:
        fig, ax = plt.subplots(figsize=(8.6, 4.2))
        run = 0; xs = []
        for i, (label, val, kind) in enumerate(r.bridge):
            if kind == "total":
                ax.bar(i, val, color="#9aa0a6", width=0.6); run = val; top = val
            elif kind == "end":
                ax.bar(i, val, color="#5f6368", width=0.6); top = val
            else:
                bottom = run + min(val, 0)
                ax.bar(i, abs(val), bottom=bottom, color="#e8a39b" if val < 0 else "#81c995", width=0.6)
                run += val; top = max(run - val, run)
            ax.text(i, top + r.requested_amount * 0.02, f"{val/1e4:,.0f}만" if val else "0", ha="center", fontsize=9.5,
                    fontweight="bold" if kind == "end" else "normal")
            xs.append(label)
        ax.set_xticks(range(len(xs))); ax.set_xticklabels(xs)
        ax.set_yticks([]); ax.spines["left"].set_visible(False)
        ax.set_title(f"{NAME[q.item]} 요청 {q.requested_rate:.0%} → {r.decision}: {r.recognized_now/1e4:,.0f}만 원 우선 인정", loc="left")
        fig.text(0.01, -0.02, "빨강 = 차감, 초록 = 가산. 지표: 한국은행 생산자물가지수(품목별). 가상 사례.", fontsize=8.5, color="#80868b")
        fig.savefig(path); plt.close(fig)


def load_requests(path: Path) -> list[Request]:
    out = []
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            kw = {}
            for k, v in row.items():
                if v in ("", None):
                    continue
                if k in ("subcontract", "linked"):
                    kw[k] = v.strip().lower() in ("true", "1", "y", "yes")
                elif k in ("material_cost", "requested_rate", "progress_done", "prepurchased", "advance_funded",
                           "link_ratio", "link_threshold", "evidence_rate"):
                    kw[k] = float(v)
                elif k == "partner_delay_months":
                    kw[k] = int(v)
                else:
                    kw[k] = v
            out.append(Request(**kw))
    return out


def robustness(v: Verifier, reqs: list[Request]) -> pd.DataFrame:
    """정책 변수(허용오차·소명배수)를 바꿔도 판정이 유지되는지 점검."""
    rows = []
    for tol in (0.02, 0.03, 0.05):
        for mult in (1.3, 1.5, 2.0):
            vv = Verifier.__new__(Verifier); vv.policy = PolicyParams(tolerance_pp=tol, explain_multiple=mult)
            vv.df, vv.pt = v.df, v.pt
            for q in reqs:
                rows.append({"tolerance_pp": tol, "explain_multiple": mult, "request_id": q.request_id,
                             "decision": vv.verify(q).decision})
    t = pd.DataFrame(rows)
    piv = t.pivot_table(index="request_id", columns=["tolerance_pp", "explain_multiple"], values="decision", aggfunc="first")
    return piv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--requests", default=str(ROOT / "data" / "requests_sample.csv"))
    a = ap.parse_args()
    v = Verifier()
    reqs = load_requests(Path(a.requests))
    summary = []
    for q in reqs:
        r = v.verify(q)
        (OUT / f"{q.request_id}_memo.md").write_text(v.memo(q, r), encoding="utf-8")
        v.bridge_png(q, r, OUT / f"{q.request_id}_bridge.png")
        summary.append({"request_id": q.request_id, "partner": q.partner, "item": NAME[q.item], "channel": q.channel,
                        "base_month": q.base_month, "request_month": q.request_month,
                        "requested_pct": round(q.requested_rate * 100, 1), "index_pct": round(r.index_rate * 100, 1),
                        "explained_band": (f"{r.explained_band[1]:+.1%}~{r.explained_band[3]:+.1%}" if r.explained_band else ""),
                        "decision": r.decision, "requested_amount": r.requested_amount, "eligible_cost": r.eligible_cost,
                        "recognized_now": r.recognized_now, "recognized_max": r.recognized_max,
                        "bridge": json.dumps(r.bridge, ensure_ascii=False)})
    s = pd.DataFrame(summary)
    s.to_csv(OUT / "verification_summary.csv", index=False, encoding="utf-8-sig")
    rb = robustness(v, reqs)
    rb.to_csv(OUT / "decision_robustness.csv", encoding="utf-8-sig")
    print(s.drop(columns=["bridge"]).to_string(index=False))
    print("\n판정 강건성(허용오차 × 소명배수 9개 조합):")
    for rid, row in rb.iterrows():
        vals = set(row.values)
        print(f"  {rid}: {'모든 조합에서 동일' if len(vals) == 1 else '조합에 따라 달라짐 → ' + ', '.join(sorted(vals))}")


if __name__ == "__main__":
    main()

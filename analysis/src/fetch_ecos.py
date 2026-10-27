"""한국은행 ECOS Open API에서 분석용 월별 시계열을 내려받는다.

사용법
  # 개인 인증키(ecos.bok.or.kr에서 무료 발급)를 쓰면 한 번에 1,000행씩 받는다.
  set ECOS_API_KEY=발급받은키        (Windows)   /   export ECOS_API_KEY=발급받은키   (macOS·Linux)
  python src/fetch_ecos.py --start 201501 --end 202609

  # 인증키가 없으면 'sample' 키로 10행씩 나눠 받는다(속도만 느리고 결과는 같다).

결과: data/raw/ecos_monthly_all.csv (month + config.SERIES의 key 열)
참고: 이 저장소의 원자료는 2026-10-27에 같은 API(sample 키, 10행 단위 조회)로 받았다.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import time
import urllib.request
from pathlib import Path

from config import SERIES

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ecos.bok.or.kr/api/StatisticSearch"


def _months(start: str, end: str) -> list[str]:
    y, m = int(start[:4]), int(start[4:])
    out = []
    while f"{y:04d}{m:02d}" <= end:
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def fetch_series(stat: str, item1: str, item2: str, start: str, end: str, key: str) -> dict[str, str]:
    page = 1000 if key != "sample" else 10
    n = len(_months(start, end))
    values: dict[str, str] = {}
    for a in range(1, n + 1, page):
        b = min(a + page - 1, n)
        url = f"{BASE}/{key}/json/kr/{a}/{b}/{stat}/M/{start}/{end}/{urllib.request.quote(item1)}"
        if item2:
            url += f"/{item2}"
        with urllib.request.urlopen(url, timeout=30) as r:
            j = json.loads(r.read().decode("utf-8"))
        rows = j.get("StatisticSearch", {}).get("row", [])
        for row in rows:
            values[row["TIME"]] = row["DATA_VALUE"]
        time.sleep(0.05)
    return values


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="201501")
    ap.add_argument("--end", default="202609")
    ap.add_argument("--out", default=str(ROOT / "data" / "raw" / "ecos_monthly_all.csv"))
    a = ap.parse_args()
    key = os.environ.get("ECOS_API_KEY", "sample")
    data = {}
    for k, name, stat, i1, i2, *_ in SERIES:
        data[k] = fetch_series(stat, i1, i2, a.start, a.end, key)
        print(f"{k:18s} {name:24s} {len(data[k]):4d}개월")
    months = _months(a.start, a.end)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["month"] + list(data))
        for t in months:
            w.writerow([t] + [data[k].get(t, "") for k in data])
    print("저장:", a.out)


if __name__ == "__main__":
    main()

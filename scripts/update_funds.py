"""SEC v2 -> static BBLAM factsheet cache. Never invent investment returns.

Run in GitHub Actions with SEC_API_KEY; no app server or browser credentials.
"""
import html
import json
import math
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/dashboard/data/funds.json"
PERIODS = ("3M", "6M", "1Y", "3Y", "5Y", "YTD")
BASE = "https://api.sec.or.th"


def text(value):
    return html.unescape(re.sub(r"<[^>]*>", " ", str(value or ""))).strip()


def number(value):
    try:
        n = float(str(value).replace(",", "").replace("%", "").strip())
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def period(value):
    s = re.sub(r"[\s_-]", "", str(value).lower())
    return {"3months": "3M", "3month": "3M", "3m": "3M", "3เดือน": "3M",
            "6months": "6M", "6month": "6M", "6m": "6M", "6เดือน": "6M",
            "1year": "1Y", "1years": "1Y", "1y": "1Y", "1ปี": "1Y",
            "3years": "3Y", "3year": "3Y", "3y": "3Y", "3ปี": "3Y",
            "5years": "5Y", "5year": "5Y", "5y": "5Y", "5ปี": "5Y",
            "ytd": "YTD", "yeartodate": "YTD", "ตั้งแต่ต้นปี": "YTD"}.get(s)


def normalize_performance(rows, class_name="main"):
    rows = [r for r in rows if (r.get("fund_class_name") or "main") == class_name]
    as_of = max((r.get("start_date") or "" for r in rows), default="")
    rows = [r for r in rows if (r.get("start_date") or "") == as_of]
    values = {p: {"fund": [], "benchmark": []} for p in PERIODS}
    for row in rows:
        p = period(row.get("reference_period"))
        desc = text(row.get("performance_type_desc")).lower()
        # Volatility and peer-group statistics are not investment returns.
        if not p or any(w in desc for w in ("ผันผวน", "volatility", "deviation", "กลุ่ม", "peer", "standard")):
            continue
        kind = "benchmark" if any(w in desc for w in ("benchmark", "ตัวชี้วัด", "เกณฑ์มาตรฐาน", "ดัชนีชี้วัด")) else "fund"
        if not any(w in desc for w in ("ผลตอบแทน", "ผลการดำเนินงาน", "return", "performance")):
            continue
        n = number(row.get("performance_value"))
        if n is not None:
            values[p][kind].append(n)
    result = {}
    for p, data in values.items():
        # Never average distinct benchmark series or choose an arbitrary one.
        f = list(set(data["fund"]))
        b = list(set(data["benchmark"]))
        f = f[0] if len(f) == 1 else None
        b = b[0] if len(b) == 1 else None
        result[p] = {"fund": f, "benchmark": b,
                     "alpha": round(f - b, 6) if f is not None and b is not None else None}
    return result, as_of or None


def category(profile):
    s = " ".join(text(profile.get(k)) for k in ("proj_abbr_name", "proj_name_th", "fund_class_name", "fund_class_tax_incentive_type")).upper()
    if any(w in s for w in ("SSF", "RMF", "THAIESG", "THAI ESG", "เพื่อการเลี้ยงชีพ", "เพื่อการออม", "ไทยเพื่อความยั่งยืน")):
        return "tax"
    policy = text(profile.get("policy_desc"))
    if "ตราสารหนี้" in policy or "ตลาดเงิน" in policy:
        return "bond"
    if "ตราสารทุน" in policy:
        return "thai" if str(profile.get("invest_country_flag")) == "3" else "foreign"
    return "other"


class SEC:
    def __init__(self, key):
        self.key = key

    def items(self, path, **params):
        output, seen = [], set()
        params = {**params, "page_size": 100}
        while True:
            url = BASE + path + "?" + urlencode(params)
            for attempt in range(3):
                time.sleep(0.22)
                request = Request(url, headers={"Ocp-Apim-Subscription-Key": self.key, "Accept": "application/json"})
                try:
                    with urlopen(request, timeout=30) as response:
                        payload = json.load(response)
                    break
                except HTTPError as error:
                    if error.code not in (421, 429, 500, 502, 503, 504) or attempt == 2:
                        raise RuntimeError(f"SEC HTTP {error.code}") from None
                    retry = error.headers.get("Retry-After", "")
                    time.sleep(min(float(retry), 60) if retry.isdigit() else 2 ** (attempt + 1))
            if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
                raise ValueError("Unexpected SEC response; existing cache retained")
            output.extend(payload["items"])
            cursor = payload.get("next_cursor")
            if not cursor:
                return output
            if cursor in seen:
                raise ValueError("Repeated SEC cursor")
            seen.add(cursor)
            params["next_cursor"] = cursor


def refresh(client, cache):
    amcs = client.items("/v2/fund/general-info/amcs")
    matches = [a for a in amcs if "บัวหลวง" in text(a.get("comp_name_th")) or "BBLAM" in text(a.get("comp_name_en")).upper() or "BANGKOK BANK ASSET" in text(a.get("comp_name_en")).upper()]
    if len(matches) != 1:
        raise ValueError("Cannot uniquely identify BBLAM")
    amc_id = matches[0]["unique_id"]
    profiles = client.items("/v2/fund/general-info/profiles", company_info=amc_id)
    profiles = [p for p in profiles if p.get("unique_id") == amc_id and p.get("fund_status") in ("IPO", "Registered")]
    if not profiles:
        raise ValueError("SEC returned no active BBLAM funds")
    old = {(f.get("projectId"), f.get("className", "main")): f for f in cache.get("funds", [])}
    result, project_data, failures = [], {}, 0
    for profile in profiles:
        pid = profile.get("proj_id")
        if not pid:
            continue
        cn = profile.get("fund_class_name") or "main"
        symbol = profile.get("proj_abbr_name") or pid
        if cn != "main":
            symbol = cn
        try:
            if pid not in project_data:
                project_data[pid] = {
                    "returns": client.items("/v2/fund/factsheet/performance", proj_id=pid, latest="true"),
                    "risk": client.items("/v2/fund/factsheet/risk-spectrum", proj_id=pid, latest="true"),
                    "benchmarks": client.items("/v2/fund/factsheet/benchmarks", proj_id=pid, latest="true"),
                }
            data = project_data[pid]
            perf, as_of = normalize_performance(data["returns"], cn)
            if not any(v["fund"] is not None for v in perf.values()):
                raise ValueError("No recognized fund returns")
            risk_rows = sorted(data["risk"], key=lambda r: r.get("start_date") or "", reverse=True)
            risk_row = risk_rows[0] if risk_rows else {}
            risk_code = str(risk_row.get("risk_spectrum") or "")
            risk = int(risk_code[2:]) if re.fullmatch(r"RS[1-8]", risk_code) else None
            benchmarks = [text(b.get("benchmark")) for b in data["benchmarks"] if b.get("start_date") == as_of]
            result.append({"symbol": symbol, "name": text(profile.get("proj_name_th")),
                           "projectId": pid, "className": cn, "category": category(profile),
                           "policy": text(profile.get("investment_policy_desc") or profile.get("policy_desc")),
                           "risk": risk, "riskDescription": text(risk_row.get("risk_spectrum_desc")),
                           "benchmarkName": " · ".join(dict.fromkeys(benchmarks)),
                           "asOf": as_of, "status": "live", "performance": perf})
        except Exception as error:
            failures += 1
            print(f"{symbol}: update unavailable ({type(error).__name__}); keeping cache")
            previous = old.get((pid, cn)) or next((f for f in cache.get("funds", []) if f["symbol"] == symbol), None)
            if previous:
                result.append({**previous, "status": "cache" if previous.get("asOf") else "seed"})
            else:
                result.append({"symbol": symbol, "name": text(profile.get("proj_name_th")), "projectId": pid,
                               "className": cn, "category": category(profile), "policy": text(profile.get("policy_desc")),
                               "risk": None, "asOf": None, "status": "unavailable", "benchmarkName": "",
                               "performance": {p: {"fund": None, "benchmark": None, "alpha": None} for p in PERIODS}})
    if not any(f["status"] == "live" for f in result):
        raise ValueError("No successful fund updates; existing cache retained")
    return {"schemaVersion": 1, "source": "SEC Open Data v2", "generated": datetime.now(timezone.utc).isoformat(),
            "status": "partial" if failures else "live", "funds": result}


def main():
    key = os.environ.get("SEC_API_KEY", "").strip()
    if not key:
        print("SEC_API_KEY not set: using existing fund catalog/cache without changing dates or returns")
        return
    cache = json.loads(OUTPUT.read_text(encoding="utf-8"))
    try:
        result = refresh(SEC(key), cache)
    except Exception as error:
        # Do not print credential-bearing URLs, headers or response bodies.
        print(f"Fund update unavailable ({type(error).__name__}); existing cache retained")
        return
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Updated {len(result['funds'])} BBLAM fund classes ({result['status']})")


if __name__ == "__main__":
    main()
"""Fetch daily prices and rebuild public/dashboard/data/*.json for the dashboard.

Run: pip install -r scripts/requirements.txt && python scripts/update_data.py
Prices come from TradingView (each asset's `source`), falling back to Yahoo Finance.
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf
from tradingview import history as tv_history

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/dashboard/data"
CFG = json.loads((Path(__file__).parent / "assets_config.json").read_text(encoding="utf-8"))
NOW = datetime.now(timezone.utc)
ISO_NOW = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
WINDOW, ROC = 252, 20


def fetch(tickers, tv=None, session_h=7.5):
    """TradingView first (the dashboard's original source), Yahoo Finance as fallback."""
    if tv:
        try:
            df = tv_history(tv)
        except Exception as e:  # noqa: BLE001
            print(f"  TV {tv}: {e}", file=sys.stderr); df = None
        if df is not None and len(df) > 260:
            intraday = NOW < df.index[-1].to_pydatetime() + pd.Timedelta(hours=session_h)
            # +6h maps FX/futures sessions that open the evening before (UTC) onto their trading day
            df.index = pd.to_datetime((df.index + pd.Timedelta(hours=6)).date)
            df = df[~df.index.duplicated(keep="last")]
            return df[["Open", "High", "Low", "Close"]], bool(intraday), tv
        print(f"  TV {tv}: no data, trying Yahoo", file=sys.stderr)
    for t in tickers:
        try:
            df = yf.Ticker(t).history(period="5y", interval="1d", auto_adjust=False)
        except Exception as e:  # noqa: BLE001
            print(f"  {t}: {e}", file=sys.stderr); continue
        df = df.dropna(subset=["Close"])
        if len(df) > 260:
            tz = df.index.tz
            local_now = NOW.astimezone(tz) if tz else NOW
            df.index = pd.to_datetime(df.index.date)
            df = df[~df.index.duplicated(keep="last")]
            intraday = df.index[-1].date() == local_now.date() and local_now.hour < 17
            return df[["Open", "High", "Low", "Close"]], intraday, t
        print(f"  {t}: not enough data", file=sys.stderr)
    return None, False, None


def ema(s, n): return s.ewm(span=n, adjust=False).mean()

def rsi(s, n=14):
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))

def atr(df, n=14):
    pc = df.Close.shift()
    tr = pd.concat([df.High - df.Low, (df.High - pc).abs(), (df.Low - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()

def r(v, dp=4):
    return None if v is None or pd.isna(v) else round(float(v), dp)

def ret_since(c, start_date):
    base = c[c.index <= start_date]
    return r(c.iloc[-1] / base.iloc[-1] - 1) if len(base) else None


def rrg_series(c, bench):
    w = pd.concat([c, bench], axis=1, join="inner").resample("W-FRI").last().dropna()
    rs = 100 * w.iloc[:, 0] / w.iloc[:, 1]
    ratio = 100 + (rs / rs.rolling(10).mean() - 1) * 100
    ratio = ratio.ewm(span=3, adjust=False).mean()
    mom = 100 + (ratio / ratio.rolling(10).mean() - 1) * 100
    mom = mom.ewm(span=3, adjust=False).mean()
    out = pd.concat([ratio, mom], axis=1).dropna().tail(8)
    # last weekly point is labelled with the actual last common date
    last = min(c.index[-1], bench.index[-1])
    pts = [{"d": d.strftime("%Y-%m-%d"), "x": r(x, 3), "y": r(y, 3)} for d, (x, y) in out.iterrows()]
    if pts: pts[-1]["d"] = min(pts[-1]["d"], last.strftime("%Y-%m-%d"))
    return pts


def quadrant(p):
    if not p: return None
    x, y = p[-1]["x"], p[-1]["y"]
    return "Leading" if x >= 100 and y >= 100 else "Weakening" if x >= 100 else "Lagging" if y < 100 else "Improving"


def strategy(a, kind, trend, quad, dist, above50):
    if a in ("US10Y", "US02Y", "VIX"): return None
    if (kind == "equity" and quad == "Lagging") or (kind != "equity" and trend == "DOWNTREND"): return "AVOID"
    if dist > -0.02: return "BREAKOUT"
    if dist >= -0.10: return "BUY DIP" if above50 else "WATCH"
    return "CORRECTION"


def main():
    (OUT / "assets").mkdir(parents=True, exist_ok=True)
    b = CFG["benchmark"]
    print("ACWI"); bdf, _, _ = fetch(b["yahoo"], b["source"])
    if bdf is None: sys.exit("benchmark fetch failed")
    bench = bdf.Close
    extras = {}
    for k, t in CFG["extra"].items():
        print(k); d, _, _ = fetch(t["yahoo"], t["tv"]); extras[k] = d.Close if d is not None else None

    tail = lambda df: df.tail(1000)
    acwi_bars = tail(bdf)
    (OUT / "assets/ACWI.json").write_text(json.dumps({**{k: b[k] for k in ("id", "name", "source")}, "bars": {
        "t": [d.strftime("%Y-%m-%d") for d in acwi_bars.index], "o": [r(v) for v in acwi_bars.Open],
        "h": [r(v) for v in acwi_bars.High], "l": [r(v) for v in acwi_bars.Low], "c": [r(v) for v in acwi_bars.Close]}},
        separators=(",", ":")), encoding="utf-8")

    assets, perf, closes, rrg, ema50s = [], {}, {}, {}, {}
    old = {}
    try: old = {a["id"]: a for a in json.loads((OUT / "summary.json").read_text())["assets"]}
    except Exception: pass

    for cfg in CFG["assets"]:
        aid = cfg["id"]; print(aid)
        df, intraday, used = fetch(cfg["yahoo"], cfg["source"], 7.5 if cfg["kind"] == "equity" else 23)
        if df is None:
            if aid in old: assets.append(old[aid]); print(f"  kept old data for {aid}", file=sys.stderr)
            continue
        c = df.Close; closes[aid] = c
        e50, e200, rs, at = ema(c, 50), ema(c, 200), rsi(c), atr(df)
        ema50s[aid] = e50
        last, prev = c.iloc[-1], c.iloc[-2]
        high52 = df.High.tail(252).max() if cfg["unit"] != "yield" else c.tail(252).max()
        dist = last / high52 - 1
        trend = "UPTREND" if last > e50.iloc[-1] > e200.iloc[-1] else "DOWNTREND" if last < e50.iloc[-1] < e200.iloc[-1] else "SIDEWAYS"
        quad = None
        if cfg["kind"] == "equity":
            rrg[aid] = rrg_series(c, bench); quad = quadrant(rrg[aid])
        strat = strategy(aid, cfg["kind"], trend, quad, dist, last > e50.iloc[-1])
        ld = c.index[-1]
        rec = {k: cfg[k] for k in ("id", "name", "group", "kind", "color", "unit", "source")}
        rec.update({"lastDate": ld.strftime("%Y-%m-%d"), "intraday": bool(intraday), "asOf": ISO_NOW,
                    "last": r(last), "prev": r(prev), "chg1d": r(last / prev - 1), "ema50": r(e50.iloc[-1]),
                    "ema200": r(e200.iloc[-1]), "rsi": r(rs.iloc[-1], 2), "high52": r(high52), "distHigh": r(dist),
                    "trend": trend, "quadrant": quad, "strategy": strat, "spark": [r(v) for v in c.tail(63)]})
        assets.append(rec)
        if strat is not None:
            month_start = (ld.replace(day=1) - pd.Timedelta(days=1))
            perf[aid] = {"MTD": ret_since(c, month_start), **{f"{m}M": ret_since(c, ld - pd.DateOffset(months=m)) for m in (1, 3, 6, 12)}}
        bars = tail(df.assign(ema50=e50, ema200=e200, rsi=rs, atr=at))
        (OUT / f"assets/{aid}.json").write_text(json.dumps({
            **{k: cfg[k] for k in ("id", "name", "group", "kind", "source")}, "trend": trend, "strategy": strat,
            "quadrant": quad, "intraday": bool(intraday), "asOf": ISO_NOW, "bars": {
                "t": [d.strftime("%Y-%m-%d") for d in bars.index], "o": [r(v) for v in bars.Open],
                "h": [r(v) for v in bars.High], "l": [r(v) for v in bars.Low], "c": [r(v) for v in bars.Close],
                "ema50": [r(v) for v in bars.ema50], "ema200": [r(v) for v in bars.ema200],
                "rsi": [r(v, 2) for v in bars.rsi], "atr": [r(v) for v in bars.atr]}},
            separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    # Market rotation: last 6 calendar months (latest = MTD)
    rot_ids = list(perf)
    me = {}
    for aid in rot_ids:
        m = closes[aid].resample("ME").last(); m.index = m.index.to_period("M"); me[aid] = m
    months = pd.period_range(end=NOW.strftime("%Y-%m"), periods=6, freq="M")
    rotation = []
    for i, p in enumerate(months):
        cells = []
        for aid in rot_ids:
            s = me[aid]
            if p in s.index and (p - 1) in s.index:
                cells.append({"id": aid, "ret": r(s[p] / s[p - 1] - 1)})
        cells.sort(key=lambda x: -x["ret"])
        rotation.append({"label": p.strftime("%b %y"), "mtd": i == 5, "cells": cells})

    # Risk-on / risk-off gauge on the ACWI (US) calendar
    cal = bench.index
    al = lambda s: s.reindex(cal).ffill() if s is not None else None
    eq_ids = [a["id"] for a in CFG["assets"] if a["kind"] == "equity" and a["id"] in closes]
    above = pd.concat([(al(closes[i]) > al(ema50s[i])).astype(float) for i in eq_ids], axis=1).mean(axis=1) * 100
    gold = al(closes.get("XAUUSD"))
    raw = {
        "breadth": above,
        "eq_gold": (al(bench) / gold).pct_change(ROC) * 100 if gold is not None else None,
        "credit": (al(extras["HYG"]) / al(extras["IEF"])).pct_change(ROC) * 100 if extras["HYG"] is not None and extras["IEF"] is not None else None,
        "cu_gold": (al(extras["COPPER"]) / gold).pct_change(ROC) * 100 if extras["COPPER"] is not None and gold is not None else None,
        "vix": al(closes.get("VIX")),
        "dollar": al(closes.get("DXY")).pct_change(ROC) * 100 if "DXY" in closes else None,
    }
    pct_rank = lambda s: s.rolling(WINDOW).apply(lambda w: (w[:-1] <= w[-1]).mean() * 100 if len(w) else np.nan, raw=True)
    comps, pcts = [], []
    for c in CFG["riskComponents"]:
        s = raw.get(c["key"])
        if s is None: continue
        p = pct_rank(s.dropna()).reindex(cal)
        if c["sign"] < 0: p = 100 - p
        pcts.append(p.rename(c["key"]))
        comps.append({**c, "raw": r(s.dropna().iloc[-1], 2), "pct": r(p.dropna().iloc[-1], 1)})
    score = pd.concat(pcts, axis=1).dropna().mean(axis=1)
    lab = lambda v: "Risk-On" if v >= 70 else "เอียง Risk-On" if v >= 55 else "Neutral" if v > 45 else "เอียง Risk-Off" if v > 30 else "Risk-Off"
    old_label = json.loads((OUT / "summary.json").read_text()).get("risk", {}).get("label") if (OUT / "summary.json").exists() else None
    risk = {"date": score.index[-1].strftime("%Y-%m-%d"), "score": r(score.iloc[-1], 1), "label": lab(score.iloc[-1]),
            "chg5d": r(score.iloc[-1] - score.iloc[-6], 1), "window": WINDOW, "roc": ROC, "components": comps,
            "history": [{"d": d.strftime("%Y-%m-%d"), "s": r(v, 1)} for d, v in score.tail(252).items()]}
    if "US10Y" in closes and "US02Y" in closes:
        cv = (pd.concat([closes["US10Y"], closes["US02Y"]], axis=1, sort=True).ffill().dropna())
        bp = (cv.iloc[:, 0] - cv.iloc[:, 1]) * 100
        risk["curve"] = {"date": bp.index[-1].strftime("%Y-%m-%d"), "bp": r(bp.iloc[-1], 1), "chg20d": r(bp.iloc[-1] - bp.iloc[-21], 1)}

    data_date = max(a["lastDate"] for a in assets)
    summary = {"generated": ISO_NOW, "dataDate": data_date,
               "benchmark": {"id": b["id"], "name": b["name"], "lastDate": bench.index[-1].strftime("%Y-%m-%d")},
               "assets": assets, "performance": perf, "rotation": rotation, "rrg": rrg, "risk": risk}
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"done: {len(assets)} assets, data date {data_date}, risk {risk['score']} ({risk['label']})")


if __name__ == "__main__":
    main()

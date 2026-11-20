"""Minimal TradingView daily-bar client (public, no login) used for symbols Yahoo does not carry."""
import json, random, re, string
import pandas as pd
from websocket import create_connection


def _msg(func, args):
    body = json.dumps({"m": func, "p": args}, separators=(",", ":"))
    return f"~m~{len(body)}~m~{body}"


def history(symbol, bars=1300):
    ws = create_connection("wss://data.tradingview.com/socket.io/websocket",
                           header={"Origin": "https://www.tradingview.com"}, timeout=20)
    cs = "cs_" + "".join(random.choices(string.ascii_lowercase, k=12))
    for f, a in [("set_auth_token", ["unauthorized_user_token"]), ("chart_create_session", [cs, ""]),
                 ("resolve_symbol", [cs, "sym1", '={"symbol":"%s","adjustment":"splits"}' % symbol]),
                 ("create_series", [cs, "s1", "s1", "sym1", "1D", bars])]:
        ws.send(_msg(f, a))
    raw = ""
    while True:
        chunk = ws.recv(); raw += chunk
        if chunk.startswith("~m~") and "~h~" in chunk:
            ws.send(chunk)  # heartbeat
        if "series_completed" in chunk or "symbol_error" in chunk or "critical_error" in chunk:
            break
    ws.close()
    rows = []
    for part in re.split(r"~m~\d+~m~", raw):
        if not part.startswith("{"):
            continue
        try:
            msg = json.loads(part)
        except ValueError:
            continue
        if msg.get("m") in ("timescale_update", "du"):
            for bar in msg["p"][1].get("s1", {}).get("s", []):
                rows.append(bar["v"][:5])
    if not rows:
        return None
    df = pd.DataFrame(rows, columns=["ts", "Open", "High", "Low", "Close"]).drop_duplicates("ts", keep="last")
    df.index = pd.to_datetime(df.ts, unit="s", utc=True)
    return df.drop(columns="ts").sort_index()

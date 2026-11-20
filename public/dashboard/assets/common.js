// Shared helpers for both pages.
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${y}`;
}

function fmtNum(v, dp) {
  if (v == null) return "–";
  if (dp == null) dp = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 10 ? 2 : 3;
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(v, dp = 1, sign = true) {
  if (v == null) return "–";
  const s = (v * 100).toFixed(dp);
  return (sign && v > 0 ? "+" : "") + s + "%";
}

function cls(v) { return v == null ? "muted" : v > 0 ? "pos" : v < 0 ? "neg" : ""; }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TREND_ICON = { UPTREND: "▲", DOWNTREND: "▼", SIDEWAYS: "►" };
const STRAT_ICON = { "BREAKOUT": "🚀", "BUY DIP": "🟢", "WATCH": "⚠️", "CORRECTION": "📉", "AVOID": "❌" };

function trendChip(t) { return `<span class="chip t-${t}">${TREND_ICON[t] || ""} ${t}</span>`; }
function stratChip(s) {
  if (!s) return `<span class="muted">–</span>`;  // e.g. VIX has no Strategy
  return `<span class="chip s-${s.replace(" ", "-")}">${STRAT_ICON[s] || ""} ${s}</span>`;
}

// Asset icons: a country flag for anything tied to one market, a drawn icon otherwise.
// Flags are self-hosted SVGs (flag-icons, MIT) because emoji flags don't render on Windows.
const ASSET_ICON = {
  SPX: "us", IXIC: "us", NDX: "us", RUT: "us", US10Y: "us", US02Y: "us",
  SXXP: "eu", NI225: "jp", TOPIX: "jp", CSI300: "cn", SSEC: "cn",
  HSI: "hk", HSTECH: "hk", HSCEI: "hk", SENSEX: "in", KOSPI: "kr", SET: "th",
  USDTHB: ["us", "th"], XAUUSD: "@gold", BRENT: "@oil", DXY: "@dollar", VIX: "@vix",
};
const DRAWN_ICON = {
  gold: `<rect width="20" height="15" rx="2" fill="#5a4a1c"/><path d="M3 12l2-4h4l2 4z M9 12l2-4h4l2 4z M6 7.5l2-4h4l2 4z" fill="#f2c94c" stroke="#a87f12" stroke-width=".6"/>`,
  oil: `<rect width="20" height="15" rx="2" fill="#2b2b2b"/><path d="M10 2.2c2.3 3.1 3.6 5 3.6 6.6a3.6 3.6 0 0 1-7.2 0c0-1.6 1.3-3.5 3.6-6.6z" fill="#e0e0e0"/><path d="M8.4 9.3a1.6 1.6 0 0 0 1.6 1.6" stroke="#2b2b2b" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
  dollar: `<rect width="20" height="15" rx="2" fill="#1b5e20"/><text x="10" y="11.6" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial, sans-serif">$</text>`,
  vix: `<rect width="20" height="15" rx="2" fill="#7f1d1d"/><path d="M2 10l3-2 2 3 3-7 2 6 2-3 2 2 2-1" stroke="#ffb4b4" stroke-width="1.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
};
function assetIcon(a) {
  const k = ASSET_ICON[a.id || a];
  if (!k) return a.color ? `<span class="dot" style="background:${a.color}"></span>` : "";
  const flag = c => `<img class="flag" src="assets/vendor/flags/${c}.svg" alt="" width="20" height="15" loading="lazy">`;
  if (Array.isArray(k)) return `<span class="aicon pair">${k.map(flag).join("")}</span>`;
  if (k[0] === "@") return `<span class="aicon"><svg viewBox="0 0 20 15" width="20" height="15" aria-hidden="true">${DRAWN_ICON[k.slice(1)]}</svg></span>`;
  return `<span class="aicon">${flag(k)}</span>`;
}

// Level / daily-change text shared by ticker, table and cross-asset list.
// Yields (unit "yield") show a % level and a change in basis points.
function isYield(a) { return a.unit ? a.unit === "yield" : a.id === "US10Y"; }
function dirOf(a) { return a.chg1d == null ? "flat" : a.chg1d > 0 ? "up" : a.chg1d < 0 ? "down" : "flat"; }
function levelText(a) { return a.last == null ? "–" : isYield(a) ? a.last.toFixed(3) + "%" : fmtNum(a.last, 2); }
function chgText(a) {
  if (a.chg1d == null) return "–";
  const d = dirOf(a), arrow = d === "up" ? "▲" : d === "down" ? "▼" : "■";
  if (isYield(a)) {
    const prev = a.prev != null ? a.prev : a.last / (1 + a.chg1d);
    const bp = (a.last - prev) * 100;
    return `${arrow} ${bp >= 0 ? "+" : ""}${bp.toFixed(1)} bp`;
  }
  return `${arrow} ${fmtPct(a.chg1d, 2)}`;
}
// Tooltip text: is the latest bar a final close, or a snapshot taken while the market was open?
function asOfTime(a) {
  return a && a.asOf ? new Date(a.asOf).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";
}
function asOfTip(a) {
  if (!a || !a.lastDate) return "";
  if (a.intraday) {
    const t = asOfTime(a);
    return `ข้อมูลระหว่างวัน ${thDate(a.lastDate)}${t ? ` ณ ${t} น. (เวลาไทย)` : ""} · ตลาดยังไม่ปิด ราคายังเปลี่ยนได้`;
  }
  return `ราคาปิดตลาด ${thDate(a.lastDate)}`;
}
function quadChip(q) { return q ? `<span class="chip q-${q}">${q}</span>` : `<span class="muted">–</span>`; }

async function getJSON(url) {
  // Market data changes several times a day; a unique query string skips the
  // GitHub Pages CDN cache (max-age=600) so a fresh deploy shows up immediately.
  if (url.startsWith("data/")) url += (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// Canvas charts measure text when they are created, so the installed corporate font ("CI Sans",
// see style.css) must be loaded first. Machines without it resolve at once and fall back to Sarabun.
const fontsReady = (document.fonts && document.fonts.load)
  ? Promise.all(["400", "600", "700"].map(w => document.fonts.load(`${w} 12px "CI Sans"`, "Aก")))
      .then(() => document.fonts.ready).catch(() => {})
  : Promise.resolve();

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Shared hover tooltip
const Tip = {
  el: null,
  show(html, ev) {
    if (!this.el) { this.el = document.createElement("div"); this.el.id = "tip"; document.body.appendChild(this.el); }
    this.el.innerHTML = html;
    this.el.style.display = "block";
    this.move(ev);
  },
  move(ev) {
    if (!this.el || !ev) return;
    const pad = 14, w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    this.el.style.left = x + "px"; this.el.style.top = y + "px";
  },
  hide() { if (this.el) this.el.style.display = "none"; },
};

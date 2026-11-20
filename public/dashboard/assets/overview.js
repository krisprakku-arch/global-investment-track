// Overview widgets: market clocks, Market Pulse tiles, Top Movers,
// the Performance / Rotation / RRG tabs and the sticky section nav.

// ------------------------------------------------------------ Market clocks
// Regular cash-session hours in each exchange's local time. Public holidays are
// not modelled, so a market can show "เปิด" on a holiday.
const MARKETS = [
  { city: "Tokyo", tz: "Asia/Tokyo", s: [["09:00", "11:30"], ["12:30", "15:30"]] },
  { city: "Seoul", tz: "Asia/Seoul", s: [["09:00", "15:30"]] },
  { city: "Shanghai", tz: "Asia/Shanghai", s: [["09:30", "11:30"], ["13:00", "15:00"]] },
  { city: "Hong Kong", tz: "Asia/Hong_Kong", s: [["09:30", "12:00"], ["13:00", "16:00"]] },
  { city: "Bangkok", tz: "Asia/Bangkok", s: [["10:00", "12:30"], ["14:30", "16:30"]] },
  { city: "Mumbai", tz: "Asia/Kolkata", s: [["09:15", "15:30"]] },
  { city: "Frankfurt", tz: "Europe/Berlin", s: [["09:00", "17:30"]] },
  { city: "New York", tz: "America/New_York", s: [["09:30", "16:00"]] },
];

function marketStatus(m, now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: m.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(p => [p.type, p.value]));
  const hm = `${parts.hour}:${parts.minute}`;
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  let st = "closed";
  if (!weekend) {
    if (m.s.some(([a, b]) => hm >= a && hm < b)) st = "open";
    else if (hm >= m.s[0][0] && hm < m.s[m.s.length - 1][1]) st = "lunch";
  }
  return { hm, st };
}

function renderClocks() {
  const host = document.getElementById("clocks");
  if (!host) return;
  const label = { open: "เปิด", lunch: "พักเที่ยง", closed: "ปิด" };
  const draw = () => {
    const now = new Date();
    host.innerHTML = `<div class="clocks-inner">` + MARKETS.map(m => {
      const { hm, st } = marketStatus(m, now);
      const hours = m.s.map(x => x.join("–")).join(", ");
      return `<div class="clk ${st}" title="${m.city} · เวลาซื้อขาย ${hours} (เวลาท้องถิ่น) · ไม่รวมวันหยุดนักขัตฤกษ์">` +
        `<span class="city">${m.city}</span><span class="time">${hm}</span><span class="st"><i></i>${label[st]}</span></div>`;
    }).join("") + `</div>`;
  };
  draw();
  setInterval(draw, 30000);
}
renderClocks();

// ------------------------------------------------------------ Market Pulse
function stackBar(parts) {
  const total = parts.reduce((s, p) => s + p.n, 0) || 1;
  return `<div class="stack">${parts.filter(p => p.n).map(p =>
    `<span style="width:${(p.n / total) * 100}%;background:${p.c}"></span>`).join("")}</div>` +
    `<div class="stack-key">${parts.map(p => `<span><i style="background:${p.c}"></i>${p.label} <b>${p.n}</b></span>`).join("")}</div>`;
}

function renderPulse(S) {
  const eq = S.assets.filter(a => a.kind === "equity");
  const up = eq.filter(a => a.chg1d > 0).length, down = eq.filter(a => a.chg1d < 0).length;
  const flat = eq.length - up - down;
  const chg = eq.map(a => a.chg1d).filter(v => v != null);
  const avg = chg.length ? chg.reduce((s, v) => s + v, 0) / chg.length : null;
  const count = (arr, key, val) => arr.filter(a => a[key] === val).length;
  const pick = (arr, key, val) => arr.filter(a => a[key] === val);

  // ---- hover summaries (one per tile)
  const pct = a => `${esc(a.name)} <span class="${cls(a.chg1d)}">${fmtPct(a.chg1d, 2)}</span>`;
  const group = (title, c, list, fmt = a => esc(a.name)) =>
    `<div class="tt-g"><div class="tt-h"><i style="background:${c}"></i>${title} (${list.length})</div>` +
    `<div class="tt-l">${list.length ? list.map(a => `<span class="tt-i">${fmt(a)}</span>`).join(" · ") : "–"}</div></div>`;
  const byChg = [...eq].filter(a => a.chg1d != null).sort((a, b) => b.chg1d - a.chg1d);
  const intra = eq.filter(a => a.intraday).length;
  const intraNote = intra ? `<div class="tt-n">${intra} จาก ${eq.length} ดัชนียังเป็นข้อมูลระหว่างวัน (ตลาดยังไม่ปิด)</div>` : "";
  const median = byChg.length ? byChg[Math.floor((byChg.length - 1) / 2)].chg1d : null;
  const trendTip = t => pick(S.assets, "trend", t);

  const tiles = [
    {
      k: "ตลาดหุ้นวันนี้", v: `<span class="pos">${up} ▲</span> <span class="sep">/</span> <span class="neg">${down} ▼</span>`,
      d: stackBar([{ label: "ขึ้น", n: up, c: "var(--up-fill)" }, { label: "ไม่เปลี่ยน", n: flat, c: "var(--neutral)" }, { label: "ลง", n: down, c: "var(--down-fill)" }]),
      tip: `<b>ดัชนีหุ้น ${eq.length} ตัว เทียบราคาปิดวันก่อนหน้า</b>` +
        group("ขึ้น", "var(--up-fill)", byChg.filter(a => a.chg1d > 0), pct) +
        (flat ? group("ไม่เปลี่ยน", "var(--neutral)", eq.filter(a => !(a.chg1d > 0) && !(a.chg1d < 0))) : "") +
        group("ลง", "var(--down-fill)", byChg.filter(a => a.chg1d < 0), pct) + intraNote,
    },
    {
      k: `เฉลี่ย ${eq.length} ดัชนี (1 วัน)`, v: `<span class="${cls(avg)}">${fmtPct(avg, 2)}</span>`,
      d: `<div class="muted">ถ่วงน้ำหนักเท่ากันทุกดัชนี · สกุลเงินท้องถิ่น</div>`,
      tip: `<b>ค่าเฉลี่ยการเปลี่ยนแปลง 1 วัน</b>` + (byChg.length ?
        `<div class="tt-g">ดีที่สุด: ${pct(byChg[0])}<br>แย่ที่สุด: ${pct(byChg[byChg.length - 1])}<br>` +
        `มัธยฐาน: <span class="${cls(median)}">${fmtPct(median, 2)}</span></div>` : "") +
        `<div class="tt-n">ทุกดัชนีมีน้ำหนักเท่ากัน คิดในสกุลเงินท้องถิ่น (ไม่แปลงค่าเงิน)</div>` + intraNote,
    },
    {
      k: `แนวโน้ม (${S.assets.length} สินทรัพย์)`, v: `${count(S.assets, "trend", "UPTREND")} <small>Uptrend</small>`,
      d: stackBar([
        { label: "Up", n: count(S.assets, "trend", "UPTREND"), c: "var(--up-fill)" },
        { label: "Side", n: count(S.assets, "trend", "SIDEWAYS"), c: "var(--neutral)" },
        { label: "Down", n: count(S.assets, "trend", "DOWNTREND"), c: "var(--down-fill)" }]),
      tip: `<b>แนวโน้มจากเส้น EMA (ทุกสินทรัพย์)</b>` +
        group("Uptrend · ราคา > EMA50 > EMA200", "var(--up-fill)", trendTip("UPTREND")) +
        group("Sideways · กรณีอื่น", "var(--neutral)", trendTip("SIDEWAYS")) +
        group("Downtrend · ราคา < EMA50 < EMA200", "var(--down-fill)", trendTip("DOWNTREND")),
    },
    {
      k: `RRG (${eq.length} ดัชนี)`, v: `${count(eq, "quadrant", "Leading")} <small>Leading</small>`,
      d: stackBar([
        { label: "Lead", n: count(eq, "quadrant", "Leading"), c: "var(--up-fill)" },
        { label: "Weak", n: count(eq, "quadrant", "Weakening"), c: "var(--warn)" },
        { label: "Lag", n: count(eq, "quadrant", "Lagging"), c: "var(--down-fill)" },
        { label: "Impr", n: count(eq, "quadrant", "Improving"), c: "var(--accent)" }]),
      tip: `<b>RRG: ดัชนีหุ้นเทียบตลาดโลก (ACWI)</b>` +
        group("Leading · แข็งกว่าตลาด และยังแข็งขึ้น", "var(--up-fill)", pick(eq, "quadrant", "Leading")) +
        group("Weakening · แข็งกว่าตลาด แต่เริ่มแผ่ว", "var(--warn)", pick(eq, "quadrant", "Weakening")) +
        group("Lagging · อ่อนกว่าตลาด และยังอ่อนลง", "var(--down-fill)", pick(eq, "quadrant", "Lagging")) +
        group("Improving · อ่อนกว่าตลาด แต่เริ่มฟื้น", "var(--accent)", pick(eq, "quadrant", "Improving")),
    },
  ];
  const host = document.getElementById("pulse");
  host.innerHTML = tiles.map((t, i) =>
    `<div class="tile" data-i="${i}"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="d">${t.d}</div></div>`).join("");
  host.addEventListener("mousemove", ev => {
    const el = ev.target.closest(".tile");
    if (!el) return Tip.hide();
    Tip.show(tiles[el.dataset.i].tip, ev);
    Tip.el.classList.add("wide");
    Tip.move(ev);   // re-place now that the wider box is measured
  });
  host.addEventListener("mouseleave", () => { Tip.hide(); if (Tip.el) Tip.el.classList.remove("wide"); });
}

// ------------------------------------------------------------ Top movers
// Full daily ranking of the equity indices; a divider marks where gains turn into losses.
// Rows share the card's height evenly so the card lines up with the map beside it.
function renderMovers(S) {
  const eq = S.assets.filter(a => a.kind === "equity" && a.chg1d != null).sort((a, b) => b.chg1d - a.chg1d);
  const max = Math.max(0.001, ...eq.map(a => Math.abs(a.chg1d)));
  let html = "", divided = false;
  eq.forEach((a, i) => {
    if (!divided && a.chg1d < 0 && i > 0) { html += `<div class="mv-zero"><span>0%</span></div>`; divided = true; }
    if (a.chg1d < 0) divided = true;
    const w = Math.abs(a.chg1d) / max * 100;
    html += `<a class="mv" href="chart.html?s=${a.id}" title="${esc(a.name)} · ${esc(asOfTip(a))}">
      <span class="rk">${i + 1}</span>
      <span class="nm">${assetIcon(a)}${esc(a.name)}</span>
      <span class="bar"><i class="${a.chg1d >= 0 ? "pos" : "neg"}" style="width:${w.toFixed(1)}%"></i></span>
      <span class="pc ${cls(a.chg1d)}">${fmtPct(a.chg1d, 2)}</span></a>`;
  });
  document.getElementById("movers").innerHTML = html;
}

// ------------------------------------------------------------ Tabs
const TABS = ["performance", "rotation", "rrg"];
function activateTab(name) {
  if (!TABS.includes(name)) return;
  for (const t of TABS) {
    const on = t === name;
    document.getElementById("tab-" + t).setAttribute("aria-selected", on);
    document.getElementById("tab-" + t).tabIndex = on ? 0 : -1;
    document.getElementById("pane-" + t).hidden = !on;
  }
  try { localStorage.setItem("gmtd-tab", name); } catch (e) { /* storage unavailable */ }
  syncNav();
}
document.getElementById("tabs").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-tab]");
  if (b) activateTab(b.dataset.tab);
});
document.getElementById("tabs").addEventListener("keydown", ev => {
  if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
  const cur = TABS.findIndex(t => !document.getElementById("pane-" + t).hidden);
  const next = TABS[(cur + (ev.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
  activateTab(next);
  document.getElementById("tab-" + next).focus();
});
(function initTab() {
  let t = location.hash.slice(1);
  if (!TABS.includes(t)) { try { t = localStorage.getItem("gmtd-tab"); } catch (e) { t = null; } }
  activateTab(TABS.includes(t) ? t : "performance");
})();

// Nav links / hashes for a tab open that tab, then scroll to the tab card.
function goToTabFromHash() {
  const t = location.hash.slice(1);
  if (!TABS.includes(t)) return;
  activateTab(t);
  document.getElementById("analysis").scrollIntoView({ block: "start" });
}
addEventListener("hashchange", goToTabFromHash);
document.getElementById("secnav").addEventListener("click", ev => {
  const a = ev.target.closest("a[data-tab]");
  if (a && location.hash === "#" + a.dataset.tab) { ev.preventDefault(); goToTabFromHash(); }
});

// ------------------------------------------------------------ Sticky nav highlight
var currentSection = "overview";  // var: read by syncNav() during the earlier initTab() call
function syncNav() {
  const tab = TABS.find(t => !document.getElementById("pane-" + t).hidden);
  document.querySelectorAll("#secnav a").forEach(a => {
    const id = a.getAttribute("href").slice(1);
    const on = a.dataset.tab ? currentSection === "analysis" && a.dataset.tab === tab : currentSection === id;
    a.classList.toggle("on", on);
  });
}
(function observeSections() {
  const secs = ["overview", "summary", "analysis", "glossary"].map(id => document.getElementById(id));
  const pick = () => {
    const line = document.getElementById("secnav").getBoundingClientRect().bottom + 40;
    let cur = secs[0].id;
    for (const s of secs) if (s.getBoundingClientRect().top <= line) cur = s.id;
    if (cur !== currentSection) { currentSection = cur; syncNav(); }
  };
  addEventListener("scroll", pick, { passive: true });
  addEventListener("resize", pick);
  pick();
})();

// ------------------------------------------------------------ Risk-On / Risk-Off gauge
const RISK_BANDS = [
  { lo: 0, hi: 30, c: "var(--down-fill)", label: "Risk-Off" },
  { lo: 30, hi: 45, c: "color-mix(in srgb, var(--down-fill) 45%, var(--neutral))", label: "เอียง Risk-Off" },
  { lo: 45, hi: 55, c: "var(--neutral)", label: "Neutral" },
  { lo: 55, hi: 70, c: "color-mix(in srgb, var(--up-fill) 45%, var(--neutral))", label: "เอียง Risk-On" },
  { lo: 70, hi: 100, c: "var(--up-fill)", label: "Risk-On" },
];
const riskBand = s => RISK_BANDS.find(b => s < b.hi) || RISK_BANDS[RISK_BANDS.length - 1];

function riskRaw(c) {
  if (c.raw == null) return "–";
  if (c.key === "breadth") return c.raw.toFixed(1) + "%";
  if (c.key === "vix") return c.raw.toFixed(1);
  return (c.raw > 0 ? "+" : "") + c.raw.toFixed(2) + "%";
}

function renderRisk(S) {
  const R = S.risk;
  const card = document.getElementById("risk");
  if (!R) { card.hidden = true; return; }   // older summary.json without the gauge
  card.hidden = false;
  document.getElementById("risk-sub").textContent =
    `6 สัญญาณข้ามสินทรัพย์ · 50 = ระดับปกติของรอบ 1 ปี · ข้อมูลถึง ${thDate(R.date)}`;

  // --- dial: half circle 0 (left) → 100 (right)
  const cx = 130, cy = 120, ro = 100, ri = 72;
  const pt = (v, rad) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  };
  const arc = (lo, hi) => {
    const [x1, y1] = pt(lo, ro), [x2, y2] = pt(hi, ro), [x3, y3] = pt(hi, ri), [x4, y4] = pt(lo, ri);
    return `M${x1},${y1} A${ro},${ro} 0 0 1 ${x2},${y2} L${x3},${y3} A${ri},${ri} 0 0 0 ${x4},${y4} Z`;
  };
  const band = riskBand(R.score);
  const [nx, ny] = pt(R.score, ro + 6);
  const chg = R.chg5d == null ? "" :
    `<div class="rd-chg ${cls(R.chg5d)}">${R.chg5d > 0 ? "▲" : R.chg5d < 0 ? "▼" : "■"} ${Math.abs(R.chg5d).toFixed(1)} จุด จากสัปดาห์ก่อน</div>`;
  document.getElementById("risk-dial").innerHTML =
    `<svg viewBox="0 0 260 140" role="img" aria-label="คะแนน ${R.score} จาก 100: ${R.label}">` +
    RISK_BANDS.map(b => `<path d="${arc(b.lo + 0.6, b.hi - 0.6)}" fill="${b.c}" opacity="${b === band ? 1 : 0.28}"/>`).join("") +
    `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="6" fill="var(--text)"/>` +
    `<text x="${cx - ro}" y="${cy + 16}" class="rd-tick">0</text><text x="${cx + ro}" y="${cy + 16}" class="rd-tick" text-anchor="end">100</text>` +
    `</svg><div class="rd-score">${R.score.toFixed(0)}<small>/100</small></div>` +
    `<div class="rd-label" style="color:${band.c}">${esc(R.label)}</div>${chg}`;

  // --- components: one compact row each; bar centred on 50, filled toward the side it points to
  document.getElementById("risk-comps").innerHTML = R.components.map(c => {
    const p = c.pct;
    const side = p == null ? "" : p >= 50 ? "on" : "off";
    const left = p == null ? 50 : Math.min(p, 50), width = p == null ? 0 : Math.abs(p - 50);
    const tip = `${c.desc} · ค่าล่าสุด ${riskRaw(c)} · percentile ${p == null ? "–" : p.toFixed(0)} → ${side === "on" ? "Risk-On" : side === "off" ? "Risk-Off" : "–"}`;
    return `<div class="rc" title="${esc(tip)}">
      <span class="rc-name">${esc(c.name)}</span>
      <span class="rc-bar"><i class="mid"></i><b class="${side}" style="left:${left}%;width:${width}%"></b></span>
      <span class="rc-raw">${riskRaw(c)}</span></div>`;
  }).join("") + `<div class="rc rc-axis"><span></span><span class="ax"><span>◀ Risk-Off</span><span>Risk-On ▶</span></span><span></span></div>`;

  // --- history line with regime bands
  const H = R.history, W = 600, Ht = 92, m = { l: 24, r: 6, t: 4, b: 16 };
  const sx = i => m.l + i / Math.max(1, H.length - 1) * (W - m.l - m.r);
  const sy = v => m.t + (100 - v) / 100 * (Ht - m.t - m.b);
  let g = RISK_BANDS.map(b => `<rect x="${m.l}" y="${sy(b.hi)}" width="${W - m.l - m.r}" height="${sy(b.lo) - sy(b.hi)}" fill="${b.c}" opacity=".10"/>`).join("");
  [30, 50, 70].forEach(v => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--grid)"/>` +
      `<text x="${m.l - 4}" y="${sy(v) + 3.5}" class="rh-tick" text-anchor="end">${v}</text>`;
  });
  const months = [];
  H.forEach((h, i) => { if (i && h.d.slice(5, 7) !== H[i - 1].d.slice(5, 7) && +h.d.slice(5, 7) % 3 === 1) months.push(i); });
  months.forEach(i => { g += `<text x="${sx(i)}" y="${Ht - 4}" class="rh-tick" text-anchor="middle">${new Date(H[i].d).toLocaleDateString("th-TH-u-ca-gregory", { month: "short", year: "2-digit" })}</text>`; });
  g += `<polyline points="${H.map((h, i) => `${sx(i).toFixed(1)},${sy(h.s).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  g += `<circle cx="${sx(H.length - 1)}" cy="${sy(R.score)}" r="4" fill="${band.c}" stroke="var(--surface)" stroke-width="2"/>`;
  g += `<line class="rh-cross" x1="0" x2="0" y1="${m.t}" y2="${Ht - m.b}" stroke="var(--text-3)" stroke-dasharray="3 3" visibility="hidden"/>`;
  const host = document.getElementById("risk-hist");
  host.innerHTML = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="คะแนน Risk gauge ย้อนหลัง 1 ปี">${g}</svg>`;
  const svg = host.querySelector("svg"), cross = host.querySelector(".rh-cross");
  svg.addEventListener("mousemove", ev => {
    const b = svg.getBoundingClientRect();
    const x = (ev.clientX - b.left) / b.width * W;
    const i = Math.max(0, Math.min(H.length - 1, Math.round((x - m.l) / (W - m.l - m.r) * (H.length - 1))));
    cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
    Tip.show(`<b>${thDate(H[i].d)}</b>คะแนน ${H[i].s.toFixed(1)} · ${riskBand(H[i].s).label}`, ev);
  });
  svg.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); Tip.hide(); });

  const cv = R.curve;
  document.getElementById("risk-curve").innerHTML = cv ? `<span>Yield curve 2s10s <b>${cv.bp > 0 ? "+" : ""}${cv.bp.toFixed(0)} bp</b></span>` +
    `<span>${cv.chg20d > 0 ? "▲ ชันขึ้น" : cv.chg20d < 0 ? "▼ แบนลง" : "■ ทรงตัว"} ${Math.abs(cv.chg20d).toFixed(0)} bp ใน 20 วัน</span>` +
    `<span class="muted">${cv.bp < 0 ? "Inverted" : "ปกติ (ไม่ inverted)"} · ไม่นับในคะแนน</span>` : "";
}

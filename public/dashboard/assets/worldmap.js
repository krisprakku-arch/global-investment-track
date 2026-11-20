// Daily Change Map: equity indices as bubbles on a world map.
// Bubble area ∝ |daily change|; green = up, red = down. Overlapping bubbles are
// pushed apart with a small force simulation and tied to their market by a leader line.
const MAP_PLACES = {
  // id: [short label, lon, lat, ISO numeric country code]
  SPX: ["S&P 500", -98, 39, "840"], IXIC: ["Nasdaq", -84, 41, "840"],
  NDX: ["Nasdaq 100", -112, 42, "840"], RUT: ["Russell 2000", -96, 31, "840"],
  SXXP: ["STOXX 600", 9, 50, null], NI225: ["Nikkei 225", 140, 37, "392"],
  TOPIX: ["TOPIX", 136, 34, "392"], CSI300: ["CSI 300", 112, 34, "156"],
  SSEC: ["SSE", 121, 31, "156"], HSI: ["HSI", 114.2, 22.3, "344"],
  HSTECH: ["HS Tech", 114.2, 22.3, "344"], HSCEI: ["HSCEI", 114.2, 22.3, "344"],
  SENSEX: ["Sensex", 77, 21, "356"], KOSPI: ["KOSPI", 127.8, 36.5, "410"],
  SET: ["SET", 100.5, 14, "764"],
};
const EUROPE = ["040", "056", "203", "208", "246", "250", "276", "300", "348", "372", "380", "528", "578", "616", "620", "724", "752", "756", "826"];

async function renderWorldMap(S) {
  const host = document.getElementById("worldmap");
  renderCrossAsset(S);
  if (!window.d3 || !window.topojson) { host.innerHTML = `<p class="muted">โหลดแผนที่ไม่สำเร็จ</p>`; return; }
  let world;
  try { world = await getJSON("assets/vendor/countries-110m.json"); }
  catch (e) { host.innerHTML = `<p class="muted">โหลดแผนที่ไม่สำเร็จ: ${esc(e.message)}</p>`; return; }

  const W = 1000, H = 500;
  const countries = topojson.feature(world, world.objects.countries).features.filter(f => f.id !== "010");
  const proj = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]],
    { type: "MultiPoint", coordinates: [[-126, -16], [150, -16], [-126, 60], [150, 60]] });
  const path = d3.geoPath(proj);

  const eq = S.assets.filter(a => MAP_PLACES[a.id] && a.last != null);
  const homes = new Set(eq.map(a => MAP_PLACES[a.id][3]).filter(Boolean));
  if (eq.some(a => a.id === "SXXP")) EUROPE.forEach(c => homes.add(c));

  const maxAbs = Math.max(0.01, ...eq.map(a => Math.abs(a.chg1d || 0)));
  const rScale = d3.scaleSqrt().domain([0, maxAbs]).range([5, 36]);
  const nodes = eq.map(a => {
    const [label, lon, lat] = MAP_PLACES[a.id];
    const [ax, ay] = proj([lon, lat]);
    const r = rScale(Math.abs(a.chg1d || 0));
    // Labels sit under the bubble, so the collision radius covers bubble + label.
    return { a, label, ax, ay, x: ax, y: ay, r, cr: Math.max(r + 22, 38) };
  });
  d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => d.ax).strength(0.25))
    .force("y", d3.forceY(d => d.ay).strength(0.25))
    .force("collide", d3.forceCollide(d => d.cr).iterations(4))
    .stop().tick(300);
  nodes.forEach(n => {
    n.x = Math.max(n.cr, Math.min(W - n.cr, n.x));
    n.y = Math.max(n.r + 4, Math.min(H - n.r - 32, n.y));
  });

  const f1 = v => v.toFixed(1);
  const g = [];
  g.push(countries.map(f => `<path class="land${homes.has(f.id) ? " home" : ""}" d="${path(f)}"/>`).join(""));
  nodes.forEach(n => {
    const dist = Math.hypot(n.x - n.ax, n.y - n.ay);
    if (dist > n.r + 2) {
      // Stop the leader at the bubble's edge so it doesn't show through the fill.
      const t = (dist - n.r) / dist, ex = n.ax + (n.x - n.ax) * t, ey = n.ay + (n.y - n.ay) * t;
      g.push(`<line class="leader" x1="${f1(n.ax)}" y1="${f1(n.ay)}" x2="${f1(ex)}" y2="${f1(ey)}"/><circle class="anchor" cx="${f1(n.ax)}" cy="${f1(n.ay)}" r="2"/>`);
    }
  });
  // Largest first so small bubbles stay on top and clickable.
  [...nodes].sort((p, q) => q.r - p.r).forEach(n => {
    g.push(`<a href="chart.html?s=${n.a.id}"><g class="bub ${dirOf(n.a)}" data-id="${n.a.id}">` +
      `<circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="${f1(n.r)}"/>` +
      `<text x="${f1(n.x)}" y="${f1(n.y + n.r + 14)}">${esc(n.label)}</text>` +
      `<text class="v" x="${f1(n.x)}" y="${f1(n.y + n.r + 28)}">${fmtPct(n.a.chg1d, 2)}</text></g></a>`);
  });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="แผนที่โลกแสดงการเปลี่ยนแปลงรายวันของดัชนีหุ้น">${g.join("")}</svg>`;
  // On narrow screens the map scrolls sideways; start on Asia, where most markets are.
  const sc = host.closest(".scroll-x");
  if (sc && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = sc.scrollWidth * 0.72 - sc.clientWidth / 2;

  const byId = Object.fromEntries(eq.map(a => [a.id, a]));
  host.addEventListener("mousemove", ev => {
    const b = ev.target.closest(".bub");
    if (!b) return Tip.hide();
    const a = byId[b.dataset.id];
    Tip.show(`<b>${esc(a.name)}</b>${fmtNum(a.last, 2)} · <span class="${cls(a.chg1d)}">${fmtPct(a.chg1d, 2)}</span><br><span class="muted">${esc(asOfTip(a))} · เทียบวันก่อนหน้า</span>`, ev);
  });
  host.addEventListener("mouseleave", () => Tip.hide());

  // Size + color key
  const k = host.clientWidth / W || 1;  // legend circles match on-screen bubble size
  const keySvg = [0.005, 0.01, 0.02].filter(v => v <= maxAbs * 1.05).map(v => {
    const r = rScale(v) * k;
    return `<svg width="${f1(2 * r + 4)}" height="${f1(2 * r + 4)}"><circle cx="${f1(r + 2)}" cy="${f1(r + 2)}" r="${f1(r)}" fill="none" stroke="var(--text-3)"/></svg> ${fmtPct(v, 1, false)}`;
  }).join(" &nbsp;");
  document.getElementById("map-legend").innerHTML =
    `<span><i class="sw" style="background:var(--up-fill)"></i>ขึ้น</span><span><i class="sw" style="background:var(--down-fill)"></i>ลง</span>` +
    `<span>ขนาด: ${keySvg}</span><span class="muted">ตลาดสหรัฐฯ อาจเป็นข้อมูลของวันทำการก่อนหน้าเพราะต่างเวลา</span>`;
}

// Non-equity assets have no single home market, so they sit under the map as tiles.
function renderCrossAsset(S) {
  const others = S.assets.filter(a => a.kind !== "equity" && a.last != null);
  const head = `<div class="xh"><span>สินทรัพย์</span><span class="sp">3 เดือน</span><span>ระดับล่าสุด</span><span>เทียบวันก่อน</span></div>`;
  document.getElementById("xasset").innerHTML = head + others.map(a => {
    return `<a href="chart.html?s=${a.id}" title="${esc(a.name)} · ${esc(asOfTip(a))}"><span class="n">${assetIcon(a)}${esc(a.name)}</span>${window.sparkSVG ? sparkSVG(a) : "<span></span>"}<span class="l">${levelText(a)}</span><span class="c ${dirOf(a)}">${chgText(a)}</span></a>`;
  }).join("");
}

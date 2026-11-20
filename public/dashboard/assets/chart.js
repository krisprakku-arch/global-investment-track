(async function () {
  const id = new URLSearchParams(location.search).get("s");
  if (!id) { location.href = "index.html"; return; }

  let A;
  try {
    A = await getJSON(`data/assets/${encodeURIComponent(id)}.json`);
  } catch (e) {
    document.getElementById("title").textContent = "ไม่พบข้อมูล: " + id;
    return;
  }
  if (!A.bars.ema50) { document.getElementById("title").textContent = "ไม่มีกราฟสำหรับ " + A.name; return; }

  const b = A.bars, LAST = b.t.length - 1;
  document.title = `Technical Chart: ${A.name}`;
  document.getElementById("title").innerHTML = `${assetIcon(A)}Technical Chart: ${esc(A.name)}`;
  document.getElementById("src").textContent = `${A.group} · ${A.source} · Daily · ${asOfTip({ ...A, lastDate: b.t[LAST] })}`;
  document.getElementById("foot").textContent =
    `ที่มา: TradingView (ผ่าน tvdatafeed) ณ วันที่ ${thDate(b.t[LAST])} · ข้อมูลเพื่อการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน`;

  const el = document.getElementById("tvchart");
  await fontsReady;
  const tc = TechChart.create(el, A);
  const chart = tc.chart;

  // what is drawn; toggled by the checkboxes above the chart
  const show = { ema50: true, ema200: true, rsi: true, sr: true };
  let curRange = "1Y";

  function apply(rangeKey, resetView = true) {
    curRange = rangeKey;
    const res = tc.apply(rangeKey, show, resetView);
    syncLegend();
    const d = TechChart.describe(A, tc.dp, res);
    document.getElementById("i-trend").innerHTML = d.trendHTML;
    document.getElementById("i-last").textContent = d.last;
    document.getElementById("i-sup").innerHTML = d.supHTML;
    document.getElementById("i-res").innerHTML = d.resHTML;
    document.getElementById("i-rsi").innerHTML = d.rsiHTML;
    document.getElementById("narr").textContent = d.narr;
    document.getElementById("i-note").textContent = d.note;
    schedulePrintImage();
  }

  // ---------------------------------------------------------------- range buttons
  const btns = document.getElementById("ranges");
  btns.addEventListener("click", ev => {
    const btn = ev.target.closest("button"); if (!btn) return;
    btns.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === btn));
    apply(btn.dataset.r);
  });
  // ---------------------------------------------------------------- toggles
  function syncLegend() {
    document.querySelectorAll(".legend-line [data-k]").forEach(s => {
      s.style.display = show[s.dataset.k] ? "" : "none";
    });
  }
  document.querySelectorAll("#toggles input[type=checkbox]").forEach(cb => {
    cb.checked = show[cb.dataset.k];
    cb.addEventListener("change", () => { show[cb.dataset.k] = cb.checked; apply(curRange, false); });
  });

  // ---------------------------------------------------------------- export PDF (browser print → Save as PDF)
  // The live canvas is swapped for a static screenshot so the printed chart keeps its on-screen layout.
  // The screenshot is kept up to date in the background, and the button waits until the image is
  // decoded before opening the print dialog (otherwise the first print can come out without the chart).
  const printImg = document.getElementById("print-chart");
  const baseTitle = document.title;
  let shotTimer = null;
  function refreshPrintImage() {
    clearTimeout(shotTimer); shotTimer = null;
    printImg.src = chart.takeScreenshot(true, false).toDataURL("image/png");
    return printImg.decode().catch(() => {});
  }
  function schedulePrintImage() {
    clearTimeout(shotTimer);
    shotTimer = setTimeout(refreshPrintImage, 400);
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(schedulePrintImage);
  new ResizeObserver(schedulePrintImage).observe(el);

  function printMeta() {
    document.getElementById("print-meta").textContent =
      `ช่วงข้อมูล: ${curRange} · ข้อมูล ณ ${thDate(b.t[LAST])} · พิมพ์เมื่อ ${new Date().toLocaleString("th-TH-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" })}`;
    document.title = `Technical Report - ${A.name} - ${b.t[LAST]} (${curRange})`; // default PDF file name
  }
  // Ctrl+P: the background screenshot is already in place; only a pending refresh is flushed
  window.addEventListener("beforeprint", () => { if (shotTimer) refreshPrintImage(); printMeta(); });
  window.addEventListener("afterprint", () => { document.title = baseTitle; });
  const exportBtn = document.getElementById("export");
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    try {
      await refreshPrintImage();
      printMeta();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      window.print();
    } finally { exportBtn.disabled = false; }
  });

  apply("1Y");
})();

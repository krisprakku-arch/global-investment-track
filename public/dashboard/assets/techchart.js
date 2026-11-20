// Shared candlestick + EMA + RSI + support/resistance chart.
// Used by chart.html (one interactive chart) and pack.html (every chart, rendered to images).
(function (root) {
  const RANGES = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "All": Infinity };
  const TREND_TH = { UPTREND: "ขาขึ้น", DOWNTREND: "ขาลง", SIDEWAYS: "ออกข้าง (Sideways)" };
  const RSI_TH = { Overbought: "อยู่ในโซน Overbought (สูงกว่า 70)", Oversold: "อยู่ในโซน Oversold (ต่ำกว่า 30)", Neutral: "อยู่โซนกลาง" };

  function decimals(b) { const c = b.c[b.c.length - 1]; return c >= 10 ? 2 : 3; }

  // Support/resistance labels drawn at the LEFT edge of the price pane, so they never cover
  // the latest candles. Drawn on the chart canvas, so takeScreenshot() includes them.
  class LeftLabels {
    constructor(font) { this.items = []; this.font = font; this.series = null; this.req = null; }
    attached({ series, requestUpdate }) { this.series = series; this.req = requestUpdate; }
    detached() { this.series = null; this.req = null; }
    set(items) { this.items = items; if (this.req) this.req(); }
    updateAllViews() {}
    paneViews() {
      const self = this;
      return [{
        zOrder: () => "top",
        renderer: () => ({
          draw(target) {
            if (!self.series || !self.items.length) return;
            target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
              ctx.font = `600 11px ${self.font}`;
              const H = 17, GAP = 2;
              const rows = self.items
                .map(it => ({ ...it, y: self.series.priceToCoordinate(it.price) }))
                .filter(it => it.y != null && it.y > -H && it.y < mediaSize.height + H)
                .sort((a, b) => a.y - b.y);
              // push overlapping labels apart (top-down), the line itself stays where it is
              let prev = -Infinity;
              for (const r of rows) { r.ly = Math.max(r.y, prev + H + GAP); prev = r.ly; }
              for (const r of rows) {
                const w = ctx.measureText(r.text).width + 12, x = 4, top = r.ly - H / 2;
                ctx.fillStyle = r.color;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x, top, w, H, 3); else ctx.rect(x, top, w, H);
                ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.textBaseline = "middle";
                ctx.fillText(r.text, x + 6, r.ly + 0.5);
              }
            });
          },
        }),
      }];
    }
  }

  /**
   * Build a chart in `el` for asset JSON `A`.
   * opts: { width, height } for a fixed-size (off-screen) chart; omitted = autoSize.
   * Returns { chart, b, dp, apply(rangeKey, show) -> { z, from, to, rangeKey }, remove() }.
   */
  function create(el, A, opts = {}) {
    const LW = root.LightweightCharts, C = cssVar, b = A.bars, N = b.t.length, LAST = N - 1;
    const dp = decimals(b);
    const font = getComputedStyle(document.body).fontFamily;
    const fixed = opts.width && opts.height;
    const chart = LW.createChart(el, {
      ...(fixed ? { width: opts.width, height: opts.height } : { autoSize: true }),
      layout: {
        background: { type: "solid", color: C("--surface") }, textColor: C("--text-2"),
        fontFamily: font, fontSize: opts.fontSize || 12,
        panes: { separatorColor: C("--border"), enableResize: !fixed },
        attributionLogo: true,
      },
      grid: { vertLines: { color: C("--grid") }, horzLines: { color: C("--grid") } },
      rightPriceScale: { borderColor: C("--border") },
      timeScale: { borderColor: C("--border"), rightOffset: 6 },
      crosshair: { mode: LW.CrosshairMode.Normal },
      localization: { priceFormatter: p => fmtNum(p, dp) },
      ...(fixed ? { handleScroll: false, handleScale: false } : {}),
    });

    const candles = chart.addSeries(LW.CandlestickSeries, {
      upColor: C("--candle-up"), downColor: C("--candle-down"), borderVisible: false,
      wickUpColor: C("--candle-up"), wickDownColor: C("--candle-down"),
      priceFormat: { type: "price", precision: dp, minMove: 1 / 10 ** dp },
    });
    candles.setData(b.t.map((t, i) => ({ time: t, open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i] })));
    const labels = new LeftLabels(font);
    candles.attachPrimitive(labels);

    const lineOpts = { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const ema50S = chart.addSeries(LW.LineSeries, { ...lineOpts, color: C("--ema50") });
    ema50S.setData(b.t.map((t, i) => ({ time: t, value: b.ema50[i] })).slice(49));
    const ema200S = chart.addSeries(LW.LineSeries, { ...lineOpts, color: C("--ema200") });
    ema200S.setData(b.t.map((t, i) => ({ time: t, value: b.ema200[i] })).slice(199));

    // RSI lives in pane 1; removing its series removes the pane, so the price chart takes the full height
    let rsiSeries = null;
    function addRSI() {
      rsiSeries = chart.addSeries(LW.LineSeries, {
        lineWidth: 1.5, color: C("--rsi"), priceLineVisible: false,
        priceFormat: { type: "price", precision: 1, minMove: 0.1 },
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      }, 1);
      rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.06 } });
      rsiSeries.setData(b.t.map((t, i) => ({ time: t, value: b.rsi[i] })).slice(14));
      [70, 30].forEach(v => rsiSeries.createPriceLine({ price: v, color: C("--text-3"), lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: "" }));
      rsiSeries.createPriceLine({ price: 50, color: C("--grid"), lineWidth: 1, lineStyle: LW.LineStyle.Dotted, axisLabelVisible: false, title: "" });
    }
    addRSI();

    const setPaneHeights = () => {
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(Math.round((fixed ? opts.height : el.clientHeight) * 0.24));
    };
    setPaneHeights();
    if (!fixed) new ResizeObserver(setPaneHeights).observe(el);

    let priceLines = [];
    // resetView=false keeps the user's zoom/scroll when only a checkbox changed
    function apply(rangeKey, show, resetView = true) {
      const len = Math.min(RANGES[rangeKey], N);
      const from = N - len, to = LAST;
      priceLines.forEach(l => candles.removePriceLine(l));
      priceLines = [];

      ema50S.applyOptions({ visible: show.ema50 });
      ema200S.applyOptions({ visible: show.ema200 });
      if (show.rsi && !rsiSeries) addRSI();
      if (!show.rsi && rsiSeries) { chart.removeSeries(rsiSeries); rsiSeries = null; }

      const z = TA.srZones(b, from, to);
      const zones = show.sr ? [...z.support, ...z.resistance] : [];
      const maxT = Math.max(2, ...zones.map(x => x.touches));
      for (const zone of zones) {
        const w = zone.touches >= maxT && maxT > 2 ? 3 : zone.touches >= 3 ? 2 : 1;
        // the price tag stays on the right axis; the name tag is drawn on the left (LeftLabels)
        priceLines.push(candles.createPriceLine({
          price: zone.price, color: C(zone.side === "S" ? "--support" : "--resist"),
          lineWidth: w, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: "",
        }));
      }
      labels.set(zones.map(zone => ({
        price: zone.price, color: C(zone.side === "S" ? "--support" : "--resist"),
        text: `${zone.name} ${fmtNum(zone.price, dp)}`,
      })));

      if (resetView) chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: to + 6 });
      setPaneHeights();
      return { z, from, to, rangeKey };
    }

    return { chart, b, dp, apply, remove: () => chart.remove() };
  }

  // Text for the info box and the narrative, from the result of apply().
  function describe(A, dp, { z, from, to, rangeKey }) {
    const b = A.bars;
    const last = b.c[to], e50 = b.ema50[to], e200 = b.ema200[to], r = b.rsi[to];
    const rs = TA.rsiState(r);
    const divs = TA.divergences(b, from, to);
    const recent = divs.filter(d => to - d.b <= 15).pop() || null;

    const vs = (p, e) => p >= e ? "อยู่เหนือ" : "อยู่ต่ำกว่า";
    let crossNote = "";
    if (to > 0) {
      const p0 = b.c[to - 1], m0 = b.ema50[to - 1];
      if (p0 >= m0 && last < e50) crossNote = "ล่าสุดหลุดต่ำกว่า";
      else if (p0 <= m0 && last > e50) crossNote = "ล่าสุดยืนกลับเหนือ";
    }
    const two = arr => arr.slice(0, 2).map(x => fmtNum(x.price, dp)).join("/") || "–";
    let txt = `${A.name} อยู่ในแนวโน้ม${TREND_TH[A.trend]} ราคาล่าสุด ${fmtNum(last, dp)} `;
    txt += crossNote ? `${crossNote}เส้น EMA50 ที่ ${fmtNum(e50, dp)}` : `${vs(last, e50)}เส้น EMA50 ที่ ${fmtNum(e50, dp)}`;
    txt += ` และ${vs(last, e200)} EMA200 ที่ ${fmtNum(e200, dp)} `;
    txt += `RSI ${r.toFixed(1)} ${RSI_TH[rs]}`;
    if (recent) txt += recent.type === "bullish"
      ? " และเกิด Bullish divergence (ราคาทำจุดต่ำใหม่แต่ RSI ไม่ทำตาม) ส่งสัญญาณแรงขายเริ่มอ่อนลง"
      : " และเกิด Bearish divergence (ราคาทำจุดสูงใหม่แต่ RSI ไม่ทำตาม) ส่งสัญญาณแรงซื้อเริ่มอ่อนลง";
    const res = z.resistance.length ? `ต้าน ${two(z.resistance)}` : "ไม่พบแนวต้านเหนือราคา";
    const sup = z.support.length ? `รับ ${two(z.support)}` : "ไม่พบแนวรับใต้ราคา";
    txt += ` กรอบสำคัญ (ช่วง ${rangeKey}) ${res} ${sup}`;

    const lvl = arr => arr.length
      ? arr.map(x => `<span class="lv">${x.name} ${fmtNum(x.price, dp)} <span class="tc">(แตะ ${x.touches} ครั้ง)</span></span>`).join("")
      : `<span class="muted">ไม่พบโซนในช่วง ${rangeKey}</span>`;
    const divTxt = recent ? (recent.type === "bullish" ? "Bullish divergence" : "Bearish divergence") : "";
    const rsiHTML = `${rs} (${r.toFixed(1)})` + (recent
      ? `<span class="lv" style="color:var(${recent.type === "bullish" ? "--div-bull" : "--div-bear"})">${divTxt}</span>` : "");

    return {
      trendHTML: trendChip(A.trend), last: fmtNum(last, dp),
      supHTML: lvl(z.support), resHTML: lvl(z.resistance), rsiHTML,
      narr: txt,
      note: `แนวรับ/แนวต้านคำนวณจาก swing high/low ช่วง ${rangeKey} (หน้าต่าง ±${z.window} แท่ง) รวมจุดที่ห่างกันไม่เกิน ${fmtNum(z.tol, dp)} (0.5×ATR) และแตะอย่างน้อย 2 ครั้ง`,
    };
  }

  root.TechChart = { create, describe, RANGES };
})(this);

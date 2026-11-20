// Pure analysis functions (no DOM). Used by chart.js; also loadable in Node for testing.
(function (root) {
  // swing window scales with the number of bars in the selected range
  function swingWindow(n) { return Math.max(2, Math.min(10, Math.round(n / 40))); }

  // indexes i (in [from, to]) where arr[i] is the strict extreme of arr[i-k .. i+k] (clipped to range)
  function swings(arr, from, to, k, isHigh) {
    const out = [];
    for (let i = from + k; i <= to - k; i++) {
      let ok = true;
      for (let j = i - k; j <= i + k && ok; j++) {
        if (j === i) continue;
        if (isHigh ? arr[j] > arr[i] || (arr[j] === arr[i] && j < i) : arr[j] < arr[i] || (arr[j] === arr[i] && j < i)) ok = false;
      }
      if (ok) out.push(i);
    }
    return out;
  }

  /**
   * Support / resistance zones for bars[from..to].
   * Swing highs and lows are clustered when within tol (= 0.5 * ATR at the last bar).
   * A zone needs >= minTouches pivots. At most maxPerSide zones on each side of the last close,
   * keeping the most-touched ones, then named S1.. / R1.. from nearest to farthest.
   */
  function srZones(b, from, to, opts = {}) {
    const minTouches = opts.minTouches ?? 2, maxPerSide = opts.maxPerSide ?? 4;
    const n = to - from + 1;
    const k = swingWindow(n);
    const tol = 0.5 * (b.atr[to] || 0) || b.c[to] * 0.005;
    const piv = [
      ...swings(b.h, from, to, k, true).map(i => ({ p: b.h[i], i })),
      ...swings(b.l, from, to, k, false).map(i => ({ p: b.l[i], i })),
    ].sort((x, y) => x.p - y.p);

    const clusters = [];
    for (const q of piv) {
      const c = clusters[clusters.length - 1];
      if (c && Math.abs(q.p - c.mean) <= tol) {
        c.pts.push(q);
        c.mean = c.pts.reduce((s, x) => s + x.p, 0) / c.pts.length;
      } else clusters.push({ mean: q.p, pts: [q] });
    }
    const last = b.c[to];
    const zones = clusters.filter(c => c.pts.length >= minTouches).map(c => ({
      price: c.mean,
      lo: Math.min(...c.pts.map(x => x.p)),
      hi: Math.max(...c.pts.map(x => x.p)),
      touches: c.pts.length,
      lastIdx: Math.max(...c.pts.map(x => x.i)),
    }));
    const pick = side => {
      let z = zones.filter(side === "S" ? x => x.price < last : x => x.price >= last);
      if (z.length > maxPerSide) z = z.sort((a, b2) => b2.touches - a.touches || b2.lastIdx - a.lastIdx).slice(0, maxPerSide);
      return z.sort((a, b2) => Math.abs(a.price - last) - Math.abs(b2.price - last))
        .map((x, i) => ({ ...x, side, name: side + (i + 1) }));
    };
    return { support: pick("S"), resistance: pick("R"), window: k, tol };
  }

  /**
   * RSI divergences inside bars[from..to].
   * Bullish: consecutive swing lows where price makes a lower low and RSI a higher low (RSI < 50 at the 2nd low).
   * Bearish: consecutive swing highs where price makes a higher high and RSI a lower high (RSI > 50 at the 2nd high).
   * Pivot pairs must be 5..60 bars apart. Returns at most `limit` most recent of each type.
   */
  function divergences(b, from, to, opts = {}) {
    const limit = opts.limit ?? 3;
    const k = Math.max(2, Math.min(5, Math.round((to - from + 1) / 50)));
    const out = [];
    const scan = (isHigh) => {
      const idx = swings(isHigh ? b.h : b.l, from, to, k, isHigh);
      const found = [];
      for (let j = 1; j < idx.length; j++) {
        const a = idx[j - 1], c = idx[j], gap = c - a;
        if (gap < 5 || gap > 60) continue;
        if (isHigh) {
          if (b.h[c] > b.h[a] && b.rsi[c] < b.rsi[a] && b.rsi[c] > 50)
            found.push({ type: "bearish", a, b: c, pa: b.h[a], pb: b.h[c], ra: b.rsi[a], rb: b.rsi[c] });
        } else if (b.l[c] < b.l[a] && b.rsi[c] > b.rsi[a] && b.rsi[c] < 50)
          found.push({ type: "bullish", a, b: c, pa: b.l[a], pb: b.l[c], ra: b.rsi[a], rb: b.rsi[c] });
      }
      out.push(...found.slice(-limit));
    };
    scan(false); scan(true);
    return out.sort((x, y) => x.b - y.b);
  }

  function rsiState(v) { return v >= 70 ? "Overbought" : v <= 30 ? "Oversold" : "Neutral"; }

  const api = { swingWindow, swings, srZones, divergences, rsiState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TA = api;
})(this);

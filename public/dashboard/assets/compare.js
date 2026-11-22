(function () {
  'use strict';
  const DEFAULTS = ['BCARE', 'B-GLOBAL'];
  const MAX_FUNDS = 4;
  const PERIODS = ['1M', '3M', '6M', '1Y', 'YTD'];
  const valid = n => typeof n === 'number' && Number.isFinite(n);
  function clean(rows) {
    const sorted = (Array.isArray(rows) ? rows : []).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && valid(r.nav) && r.nav > 0).sort((a, b) => a.date.localeCompare(b.date));
    return sorted.filter((r, i) => !i || sorted[i - 1].date !== r.date);
  }
  function cutoff(end, period) {
    const d = new Date(end + 'T00:00:00Z');
    if (period === 'YTD') return `${d.getUTCFullYear() - 1}-12-31`;
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - ({ '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period] || 12));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
  }
  function normalize(rows) {
    const sorted = clean(rows), first = sorted[0];
    return first ? sorted.map(r => ({ ...r, value: (r.nav - first.nav) / first.nav * 100 })) : [];
  }
  function volatility(rows) {
    const data = clean(rows);
    if (data.length < 3 || data.some((r, i) => i && (Date.parse(r.date) - Date.parse(data[i - 1].date)) / 86400000 > 7)) return null;
    const returns = data.slice(1).map((r, i) => r.nav / data[i].nav - 1);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    return Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)) * Math.sqrt(252) * 100;
  }
  function maxDrawdown(rows) {
    const data = clean(rows);
    if (data.length < 2) return null;
    let peak = data[0].nav, worst = 0;
    for (const r of data) { peak = Math.max(peak, r.nav); worst = Math.min(worst, (r.nav / peak - 1) * 100); }
    return worst;
  }
  function periodReturn(rows, end, period) {
    const data = clean(rows), target = cutoff(end, period);
    const base = data.filter(r => r.date <= target).at(-1), last = data.filter(r => r.date <= end).at(-1);
    if (!base || !last || base.date === last.date || Date.parse(target) - Date.parse(base.date) > 7 * 86400000 || Date.parse(end) - Date.parse(last.date) > 7 * 86400000) return null;
    return (last.nav / base.nav - 1) * 100;
  }
  function addFund(selected, symbol) {
    return selected.includes(symbol) || selected.length >= MAX_FUNDS ? selected : [...selected, symbol];
  }
  function compareWindow(histories, period) {
    const usable = histories.map(clean).filter(r => r.length > 1);
    if (!usable.length) return { start: null, end: null, series: histories.map(() => []) };
    const end = usable.map(r => r.at(-1).date).sort()[0];
    const target = cutoff(end, period);
    const common = usable[0].filter(r => r.date <= end && r.date >= target && usable.every(a => a.some(p => p.date === r.date)));
    const start = common[0]?.date;
    if (!start || common.length < 2) return { start: null, end, series: histories.map(() => []) };
    return { start, end, series: histories.map(rows => {
      const data = clean(rows);
      return data.some(r => r.date === start) ? normalize(data.filter(r => r.date >= start && r.date <= end)) : [];
    }) };
  }
  globalThis.BBLAMCompare = { DEFAULTS, MAX_FUNDS, PERIODS, clean, cutoff, normalize, volatility, maxDrawdown, periodReturn, addFund, compareWindow };
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (v, digits = 2) => valid(v) ? v.toFixed(digits) : '—';
  const pct = v => valid(v) ? `${v > 0 ? '+' : ''}${fmt(v)}%` : '—';
  const sign = v => valid(v) ? v > 0 ? 'positive' : v < 0 ? 'negative' : '' : '';
  let selected = [...DEFAULTS], period = '1Y', funds = [], history = {}, sources = {}, chart = null, chartSeries = [], activeWindow = null;
  const fund = symbol => funds.find(f => f.symbol === symbol) || { symbol, name: '' };
  function renderSelection() {
    $('compare-selection').innerHTML = selected.map((symbol, i) => {
      const f = fund(symbol), last = clean(history[symbol]).at(-1);
      return `<article class="compare-fund series-${i}"><strong>${esc(symbol)}</strong><button class="compare-remove" data-remove="${esc(symbol)}" aria-label="ลบ ${esc(symbol)}" title="ลบกองทุน">×</button><p>${esc(f.name)}</p><small>${last ? `NAV ${fmt(last.nav, 4)} · ${last.date}` : 'ยังไม่มีประวัติ NAV ที่ยืนยัน'}</small></article>`;
    }).join('') + (selected.length < MAX_FUNDS ? `<button class="compare-add" id="compare-add" title="เพิ่มกองทุน"><span aria-hidden="true">＋</span>เพิ่มกองทุน</button>` : '');
    document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { selected = selected.filter(s => s !== b.dataset.remove); render(); }));
    $('compare-add')?.addEventListener('click', () => { $('compare-search').focus(); search(); });
    $('compare-search').disabled = selected.length >= MAX_FUNDS;
    $('compare-limit').textContent = `${selected.length} / ${MAX_FUNDS} กองทุน / ชนิดหน่วยลงทุน`;
    $('compare-legend').innerHTML = selected.map((s, i) => `<span class="series-${i}"><i></i>${esc(s)} ${pct(activeWindow?.series[i]?.at(-1)?.value)}</span>`).join('');
  }
  function search() {
    const q = $('compare-search').value.trim().toLowerCase();
    const results = funds.filter(f => !selected.includes(f.symbol) && [f.symbol, f.name].some(s => String(s || '').toLowerCase().includes(q)));
    $('compare-results').hidden = selected.length >= MAX_FUNDS;
    $('compare-results').innerHTML = results.map(f => `<button type="button" data-add="${esc(f.symbol)}">＋ ${esc(f.symbol)}<small>${esc(f.name)} · ${history[f.symbol]?.length ? 'มีประวัติ NAV' : 'รอประวัติ NAV'}</small></button>`).join('') || '<p>ไม่พบกองทุนที่ตรงกับคำค้น</p>';
    document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { selected = addFund(selected, b.dataset.add); $('compare-search').value = ''; $('compare-results').hidden = true; render(); }));
  }
  function tooltip(time) {
    const date = typeof time === 'string' ? time : time && typeof time === 'object' ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : null;
    if (!date) return '';
    return `<b>${esc(date)}</b>${selected.map((s, i) => { const r = activeWindow.series[i].find(r => r.date === date); return `<p class="series-${i}"><strong>${esc(s)}</strong><br>NAV ${r ? fmt(r.nav, 4) : '—'} บาท · ${r ? pct(r.value) : '—'}</p>`; }).join('')}`;
  }
  function renderChart() {
    chart?.remove(); chart = null; chartSeries = [];
    $('compare-tooltip').hidden = true;
    const series = activeWindow.series, hasData = series.some(s => s.length > 1);
    $('compare-empty').hidden = hasData;
    $('compare-chart').hidden = !hasData;
    const missing = selected.filter((s, i) => !series[i].length);
    const sourceNames = [...new Set(selected.map(s => sources[s]?.source).filter(Boolean))];
    $('compare-status').textContent = `ที่มา: ${sourceNames.join(' / ') || 'SEC Open Data'}${missing.length ? ` · ยังไม่มี NAV ที่เปรียบเทียบได้: ${missing.join(', ')}` : ''}`;
    $('compare-asof').textContent = activeWindow.end ? `NAV เทียบถึง ${activeWindow.end}` : 'ยังไม่มี NAV';
    $('compare-chart-note').textContent = hasData ? `วันที่เริ่มร่วม ${activeWindow.start} = 0% · ถึง ${activeWindow.end} · ${period} · ไม่เติมราคาในวันที่กองทุนไม่มี NAV` : 'ยังไม่มีประวัติ NAV ที่ตรงกันสำหรับช่วงเวลานี้';
    if (!hasData) return;
    const LW = globalThis.LightweightCharts, style = getComputedStyle(document.body), color = key => style.getPropertyValue(key).trim();
    chart = LW.createChart($('compare-chart'), {
      autoSize: true, layout: { attributionLogo: false, background: { type: 'solid', color: color('--bg') }, textColor: color('--text-3'), fontFamily: style.fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: color('--grid') } },
      timeScale: { borderColor: color('--border'), rightOffset: 3, minBarSpacing: 1 }, rightPriceScale: { borderColor: color('--border') },
      localization: { priceFormatter: p => `${p.toFixed(2)}%` }, crosshair: { mode: LW.CrosshairMode.Normal },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    const tvLogo = document.getElementById('tv-attr-logo');
    if (tvLogo) tvLogo.remove();
    series.forEach((rows, i) => {
      if (rows.length < 2) return;
      const line = chart.addSeries(LW.LineSeries, { color: color(['--compare-blue', '--compare-green', '--compare-orange', '--compare-purple'][i]), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'percent' } });
      line.setData(rows.map(r => ({ time: r.date, value: r.value })));
      if (!chartSeries.length) line.createPriceLine({ price: 0, color: color('--text-3'), lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: '0%' });
      chartSeries.push(line);
    });
    chart.timeScale().fitContent();
    function showTooltip(param) {
      const el = $('compare-tooltip');
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) { el.hidden = true; return; }
      el.innerHTML = tooltip(param.time); el.hidden = false;
      const width = $('compare-chart').clientWidth;
      el.style.left = Math.max(0, Math.min(width - el.offsetWidth, param.point.x + 12)) + 'px';
      el.style.top = Math.max(0, Math.min($('compare-chart').clientHeight - el.offsetHeight, param.point.y + 12)) + 'px';
    }
    chart.subscribeCrosshairMove(showTooltip);
    chart.subscribeClick(showTooltip);
    $('compare-chart').ontouchend = event => {
      const touch = event.changedTouches[0];
      if (!touch || !chart) return;
      const box = $('compare-chart').getBoundingClientRect();
      const point = { x: touch.clientX - box.left, y: touch.clientY - box.top };
      const time = chart.timeScale().coordinateToTime(point.x);
      if (time) showTooltip({ time, point });
    };
  }
  function renderTable() {
    const end = activeWindow.end;
    const metric = (label, getter, isPct = false) => `<tr><th scope="row">${label}</th>${selected.map((s, i) => { const v = getter(fund(s), clean(history[s]), i); return `<td class="${isPct ? sign(v) : ''}">${isPct ? pct(v) : v}</td>`; }).join('')}</tr>`;
    $('compare-table').innerHTML = `<thead><tr><th scope="col">ข้อมูลเปรียบเทียบ</th>${selected.map((s, i) => `<th scope="col" class="series-${i}"><i></i>${esc(s)}</th>`).join('')}</tr></thead><tbody>`
      + metric('NAV ล่าสุด (บาท)', (f, rows) => { const r = rows.at(-1); return r ? `${fmt(r.nav, 4)}<small>${r.date}</small>` : '—'; })
      + PERIODS.map(p => metric(`ผลตอบแทน NAV ${p}`, (f, rows) => end ? periodReturn(rows, end, p) : null, true)).join('')
      + metric(`SD ต่อปี · ${period}`, (f, rows, i) => volatility(activeWindow.series[i]), true)
      + metric(`Max Drawdown · ${period}`, (f, rows, i) => maxDrawdown(activeWindow.series[i]), true)
      + metric('ระดับความเสี่ยง', f => Number.isInteger(f.risk) && f.risk >= 1 && f.risk <= 8 ? `${f.risk} / 8` : '—')
      + metric('ค่าธรรมเนียมจัดการ<br><small>เก็บจริง / ปี</small>', f => valid(f.managementFee) && f.managementFeeAsOf === f.asOf ? `${fmt(f.managementFee)}%<small>Factsheet ${esc(f.managementFeeAsOf)}</small>` : '—')
      + metric('Benchmark', f => esc(f.benchmarkName || '—') + (f.benchmarkName && f.asOf ? `<small>Factsheet ${esc(f.asOf)}</small>` : ''))
      + '</tbody>';
    $('compare-metrics').hidden = !selected.length;
  }
  function render() {
    activeWindow = compareWindow(selected.map(s => history[s] || []), period);
    renderSelection(); renderChart(); renderTable();
  }
  async function load() {
    try {
      const stamp = Date.now();
      const get = async name => { const r = await fetch(`data/${name}.json?t=${stamp}`, { cache: 'no-store' }); if (!r.ok) throw new Error('load'); return r.json(); };
      const [catalog, nav, provenance] = await Promise.all([get('funds'), get('nav_history'), get('nav_sources').catch(() => ({}))]);
      if (!Array.isArray(catalog.funds) || !nav || typeof nav !== 'object') throw new Error('invalid');
      funds = catalog.funds; history = nav; sources = provenance;
      $('compare-search').addEventListener('input', search);
      $('compare-search').addEventListener('focus', search);
      $('compare-search').addEventListener('keydown', e => { if (e.key === 'Escape') $('compare-results').hidden = true; });
      document.addEventListener('click', e => { if (!e.target.closest('.compare-search-wrap')) $('compare-results').hidden = true; });
      document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.period; document.querySelectorAll('[data-period]').forEach(el => el.setAttribute('aria-pressed', String(el === b))); render(); }));
      render();
    } catch {
      $('compare-status').textContent = 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่';
      $('compare-empty').textContent = 'ไม่สามารถอ่านประวัติ NAV';
      $('compare-empty').hidden = false; $('compare-chart').hidden = true;
      $('compare-search').disabled = true;
    }
  }
  load();
})();
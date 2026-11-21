(function () {
  'use strict';
  const periods = ['3M', '6M', '1Y', '3Y', '5Y', 'YTD'];
  const labels = { '3M': '3 เดือน', '6M': '6 เดือน', '1Y': '1 ปี', '3Y': '3 ปี / ปี', '5Y': '5 ปี / ปี', YTD: 'YTD' };
  const categories = { foreign: 'หุ้นต่างประเทศ', thai: 'หุ้นไทย', bond: 'ตราสารหนี้', tax: 'SSF / RMF / ThaiESG', other: 'อื่น ๆ' };
  function filterFunds(funds, query, category) {
    const q = query.trim().toLocaleLowerCase();
    return funds.filter(f => (category === 'all' || f.category === category) && [f.symbol, f.name].some(v => String(v || '').toLocaleLowerCase().includes(q)));
  }
  function alpha(fund, benchmark) {
    return typeof fund === 'number' && Number.isFinite(fund) && typeof benchmark === 'number' && Number.isFinite(benchmark) ? Math.round((fund - benchmark) * 1e6) / 1e6 : null;
  }
  function sortFunds(funds, period) {
    return [...funds].sort((a, b) => {
      const av = a.performance?.[period]?.fund, bv = b.performance?.[period]?.fund;
      const aValid = typeof av === 'number' && Number.isFinite(av), bValid = typeof bv === 'number' && Number.isFinite(bv);
      return aValid && bValid ? bv - av : aValid ? -1 : bValid ? 1 : a.symbol.localeCompare(b.symbol);
    });
  }
  globalThis.BBLAMFunds = { filterFunds, alpha, sortFunds };
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const valid = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = (n, suffix = '%') => valid(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}${suffix}` : '—';
  const sign = n => valid(n) && n > 0 ? 'positive' : valid(n) && n < 0 ? 'negative' : '';
  let data, query = '', category = 'all', selectedPeriod = '1Y', view = 'table';
  function metric(f, p) {
    const v = f.performance?.[p] || {};
    const a = alpha(v.fund, v.benchmark);
    return `<div class="fund-value ${sign(v.fund)}">${fmt(v.fund)}</div><div class="fund-bench">BM ${fmt(v.benchmark)}</div><div class="fund-alpha ${sign(a)}">α ${fmt(a, ' จุด %')}</div>`;
  }
  function identity(f) {
    const risk = Number.isInteger(f.risk) && f.risk >= 1 && f.risk <= 8 ? `ความเสี่ยง ${f.risk} / 8` : 'รอยืนยันความเสี่ยง';
    return `<div class="fund-symbol">${escape(f.symbol)}</div><div class="fund-name">${escape(f.name)}</div><div class="fund-badges"><span class="fund-badge fund-risk" title="${escape(f.riskDescription || '')}">${risk}</span><span class="fund-badge">${escape(categories[f.category] || categories.other)}</span></div><div class="fund-bench">${f.asOf ? `Factsheet ${escape(f.asOf)}` : 'ยังไม่มี Factsheet'}${f.status === 'cache' ? ' · ข้อมูลเก็บไว้ล่าสุด' : f.status === 'seed' ? ' · รายชื่อเริ่มต้น' : ''}</div>`;
  }
  function render() {
    const funds = sortFunds(filterFunds(data.funds, query, category), selectedPeriod);
    $('fund-count').textContent = `${funds.length} / ${data.funds.length} กองทุน / ชนิดหน่วยลงทุน`;
    $('fund-empty').hidden = funds.length > 0;
    $('fund-table-wrap').hidden = view !== 'table' || !funds.length;
    $('fund-cards').hidden = view !== 'cards' || !funds.length;
    $('fund-table').innerHTML = `<thead><tr><th scope="col">กองทุน / นโยบาย</th>${periods.map(p => `<th scope="col" class="num">${labels[p]}${p === selectedPeriod ? ' ↓' : ''}</th>`).join('')}</tr></thead><tbody>${funds.map(f => `<tr><td>${identity(f)}<details class="fund-policy"><summary>นโยบาย / Benchmark</summary><p class="fund-name">${escape(f.policy || 'รอข้อมูลนโยบายจาก SEC')}</p><p class="fund-name">Benchmark: ${escape(f.benchmarkName || 'ยังไม่มีข้อมูล')}</p></details></td>${periods.map(p => `<td class="num">${metric(f, p)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('fund-cards').innerHTML = funds.map(f => `<article class="fund-card">${identity(f)}<div class="fund-periods">${periods.map(p => `<div class="fund-metric"><div class="fund-label">${labels[p]}</div>${metric(f, p)}</div>`).join('')}</div><div class="fund-benchmark">Benchmark: ${escape(f.benchmarkName || 'ยังไม่มีข้อมูล')}</div><details class="fund-policy"><summary>นโยบายการลงทุน</summary><p>${escape(f.policy || 'รอข้อมูลจาก SEC')}</p></details></article>`).join('');
  }
  async function load() {
    try {
      const response = await fetch('data/funds.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('load failed');
      data = await response.json();
      if (!Array.isArray(data.funds)) throw new Error('invalid cache');
      const dates = data.funds.map(f => f.asOf).filter(Boolean).sort();
      $('fund-asof').textContent = dates.length ? `Factsheet ล่าสุด ${dates[dates.length - 1]}` : 'รายชื่อกองทุนเริ่มต้น · รอข้อมูล SEC';
      $('fund-status').textContent = data.status === 'seed'
        ? 'ยังไม่ได้เชื่อม SEC API — แสดงรายชื่อกองทุนเริ่มต้นเท่านั้น ผลตอบแทนและความเสี่ยงที่ยังไม่ยืนยันแสดงเป็น —'
        : data.status === 'partial'
          ? 'บางกองทุนอัปเดตไม่สำเร็จ ใช้ข้อมูลเก็บไว้ล่าสุดตามวันที่ของแต่ละกองทุน ไม่ใช่ราคาหรือผลตอบแทนแบบเรียลไทม์'
          : `ที่มา: ${data.source} · ข้อมูลรายเดือนตาม Factsheet ของแต่ละกองทุน · ดึงล่าสุด ${data.generated?.slice(0, 10) || '—'}`;
      $('fund-search').addEventListener('input', e => { query = e.target.value; render(); });
      document.querySelectorAll('input[name=category]').forEach(input => input.addEventListener('change', () => { category = input.value; render(); }));
      document.querySelectorAll('input[name=view]').forEach(input => input.addEventListener('change', () => { view = input.value; render(); }));
      $('fund-period').addEventListener('change', e => { selectedPeriod = e.target.value; render(); });
      render();
    } catch {
      $('fund-status').textContent = 'โหลดข้อมูลกองทุนไม่สำเร็จ กรุณาลองเปิดหน้าใหม่อีกครั้ง';
      $('fund-asof').textContent = 'ข้อมูลไม่พร้อมใช้งาน';
      $('fund-count').textContent = 'ไม่สามารถโหลดข้อมูล';
    }
  }
  load();
})();
import { test, expect } from 'bun:test';
import './compare.js';
const { DEFAULTS, MAX_FUNDS, PERIODS, normalize, volatility, maxDrawdown, addFund, cutoff, periodReturn, compareWindow } = globalThis.BBLAMCompare;
const rows = [
  { date: '2026-01-01', nav: 100 },
  { date: '2026-01-02', nav: 110 },
  { date: '2026-01-05', nav: 88 },
];
test('defaults compare BCARE and B-GLOBAL', () => expect(DEFAULTS).toEqual(['BCARE', 'B-GLOBAL']));
test('limits selection to four distinct funds', () => {
  expect(MAX_FUNDS).toBe(4);
  expect(addFund(['A', 'B', 'C', 'D'], 'E')).toEqual(['A', 'B', 'C', 'D']);
  expect(addFund(['A'], 'A')).toEqual(['A']);
  expect(addFund(['A'], 'B')).toEqual(['A', 'B']);
});
test('has all five requested timeframes', () => expect(PERIODS).toEqual(['1M', '3M', '6M', '1Y', 'YTD']));
test('normalized NAV starts at zero and applies requested growth formula', () => {
  expect(normalize(rows).map(r => r.value)).toEqual([0, 10, -12]);
  expect(normalize([{ date: '2026-01-01', nav: 0 }])).toEqual([]);
});
test('annualized SD uses sample daily returns and sqrt 252', () => {
  expect(volatility(rows)).toBeCloseTo(Math.sqrt(.045) * Math.sqrt(252) * 100, 8);
  expect(volatility(rows.slice(0, 2))).toBeNull();
});
test('Max Drawdown is deepest peak to trough not first NAV loss', () => expect(maxDrawdown(rows)).toBeCloseTo(-20, 8));
test('calendar month clamps date and YTD starts at previous year end', () => {
  expect(cutoff('2026-03-31', '1M')).toBe('2026-02-28');
  expect(cutoff('2026-11-18', 'YTD')).toBe('2025-12-31');
});
test('period return requires sufficient history and uses prior business NAV', () => {
  expect(periodReturn([{date: '2025-12-31', nav: 100}, {date: '2026-01-30', nav: 120}], '2026-01-31', '1M')).toBeCloseTo(20, 8);
  expect(periodReturn(rows, '2026-01-05', '1Y')).toBeNull();
});
test('chart normalizes every fund on a common actual date without filling NAV', () => {
  const result = compareWindow([rows, [{ date: '2026-01-02', nav: 200 }, {date: '2026-01-05', nav: 220}], []], '1M');
  expect(result.start).toBe('2026-01-02');
  expect(result.series[0][0].value).toBe(0);
  expect(result.series[1].map(r => r.value)).toEqual([0, 10]);
  expect(result.series[2]).toEqual([]);
});
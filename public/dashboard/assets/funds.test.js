import { test, expect } from 'bun:test';
import './funds.js';

const { filterFunds, alpha, sortFunds } = globalThis.BBLAMFunds;
const funds = [
  { symbol: 'B-INNOTECH', name: 'เทคโนโลยี', category: 'foreign', performance: { '1Y': { fund: 10 } } },
  { symbol: 'B-GLOBAL', name: 'หุ้นโลก', category: 'foreign', performance: { '1Y': { fund: null } } },
  { symbol: 'BTP', name: 'หุ้นไทย', category: 'thai', performance: { '1Y': { fund: -5 } } },
  { symbol: 'BFIXED', category: 'bond', performance: { '1Y': { fund: 0 } } },
  { symbol: 'B-GLOBALRMF', category: 'tax' },
];
test('searches B-INNOTECH case-insensitively', () => {
  expect(filterFunds(funds, ' b-innotech ', 'all').map(f => f.symbol)).toEqual(['B-INNOTECH']);
});
test('foreign category includes global and tech but excludes Thai and tax', () => {
  expect(filterFunds(funds, '', 'foreign').map(f => f.symbol)).toEqual(['B-INNOTECH', 'B-GLOBAL']);
});
test('Thai equity filter returns BTP', () => {
  expect(filterFunds(funds, '', 'thai').map(f => f.symbol)).toEqual(['BTP']);
});
test('bond filter returns only bond funds', () => {
  expect(filterFunds(funds, '', 'bond').map(f => f.symbol)).toEqual(['BFIXED']);
});
test('tax filter returns only tax funds', () => {
  expect(filterFunds(funds, '', 'tax').map(f => f.symbol)).toEqual(['B-GLOBALRMF']);
});
test('search and category combine', () => {
  expect(filterFunds(funds, 'BTP', 'foreign')).toEqual([]);
});
test('alpha is signed difference in percentage points', () => {
  expect(alpha(12.5, 10)).toBe(2.5);
  expect(alpha(-3, 2)).toBe(-5);
});
test('missing returns never become zero alpha', () => {
  expect(alpha(null, 10)).toBeNull();
  expect(alpha(10, undefined)).toBeNull();
});
test('sort puts null after negative and preserves genuine zero', () => {
  expect(sortFunds(funds, '1Y').slice(0, 3).map(f => f.symbol)).toEqual(['B-INNOTECH', 'BFIXED', 'BTP']);
});
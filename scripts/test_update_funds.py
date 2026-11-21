import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch
import update_funds as u


def row(kind, value, p="3 months", cn="main", date="2026-10-31"):
    return dict(performance_type_desc=kind, performance_value=value, reference_period=p,
                fund_class_name=cn, start_date=date)


class FundRules(unittest.TestCase):
    def test_requested_periods(self):
        self.assertEqual([u.period(p) for p in ['3 months', '6 months', '1 year', '3 years', '5 years', 'YTD']],
                         ['3M', '6M', '1Y', '3Y', '5Y', 'YTD'])

    def test_alpha_is_fund_minus_benchmark(self):
        result, date = u.normalize_performance([row('ผลตอบแทนกองทุนรวม', '12.5'), row('ผลตอบแทนเกณฑ์มาตรฐาน', '10.0')])
        self.assertEqual(result['3M'], dict(fund=12.5, benchmark=10.0, alpha=2.5))
        self.assertEqual(date, '2026-10-31')

    def test_excludes_volatility_and_peer_returns(self):
        result, _ = u.normalize_performance([row('ความผันผวนของกองทุนรวม', '30'), row('ผลตอบแทนกลุ่มกองทุน', '15')])
        self.assertEqual(result['3M'], dict(fund=None, benchmark=None, alpha=None))

    def test_no_class_or_date_mixing(self):
        result, _ = u.normalize_performance([row('Fund return', '12'), row('Benchmark return', '9', cn='OTHER'),
                                             row('Benchmark return', '8', date='2026-09-30')])
        self.assertEqual(result['3M'], dict(fund=12.0, benchmark=None, alpha=None))

    def test_ambiguous_benchmarks_not_averaged(self):
        result, _ = u.normalize_performance([row('Fund return', '12'), row('Benchmark return', '8'), row('Benchmark return', '9')])
        self.assertIsNone(result['3M']['benchmark'])
        self.assertIsNone(result['3M']['alpha'])

    def test_tax_category_precedes_equity(self):
        self.assertEqual(u.category(dict(proj_abbr_name='B-GLOBALRMF', policy_desc='ตราสารทุน', invest_country_flag='1')), 'tax')

    def test_domestic_equity_category(self):
        self.assertEqual(u.category(dict(proj_abbr_name='BTP', policy_desc='ตราสารทุน', invest_country_flag='3')), 'thai')

    def test_foreign_equity_category(self):
        self.assertEqual(u.category(dict(proj_abbr_name='B-GLOBAL', policy_desc='ตราสารทุน', invest_country_flag='1')), 'foreign')

    def test_bond_category(self):
        self.assertEqual(u.category(dict(policy_desc='ตราสารหนี้')), 'bond')

    def test_missing_values_are_not_zero(self):
        self.assertIsNone(u.number('-'))
        self.assertIsNone(u.number('NaN'))
        self.assertEqual(u.number('0.00'), 0)

    def test_no_key_keeps_exact_cache(self):
        before = u.OUTPUT.read_bytes()
        with patch.dict('os.environ', {'SEC_API_KEY': ''}):
            u.main()
        self.assertEqual(u.OUTPUT.read_bytes(), before)

    def test_api_failure_keeps_exact_cache(self):
        before = u.OUTPUT.read_bytes()
        with patch.dict('os.environ', {'SEC_API_KEY': 'test-only-not-a-real-key'}), patch.object(u, 'refresh', side_effect=ValueError('unavailable')):
            u.main()
        self.assertEqual(u.OUTPUT.read_bytes(), before)

    def test_partial_failure_preserves_previous_return_and_date(self):
        cache = {'funds': [{'symbol': 'B-GLOBAL', 'projectId': 'M1', 'className': 'main', 'asOf': '2026-09-30',
                            'performance': {'3M': {'fund': 7.5}}, 'status': 'live'}]}
        class FakeSEC:
            def items(self, path, **params):
                if path.endswith('amcs'):
                    return [{'unique_id': 'C1', 'comp_name_th': 'บัวหลวง'}]
                if path.endswith('profiles'):
                    return [dict(unique_id='C1', proj_id=p, proj_abbr_name=s, fund_status='Registered')
                            for p, s in [('M1', 'B-GLOBAL'), ('M2', 'BTP')]]
                if params['proj_id'] == 'M1':
                    raise ValueError('unavailable')
                if path.endswith('performance'):
                    return [row('Fund return', '4')]
                return []
        result = u.refresh(FakeSEC(), copy.deepcopy(cache))
        previous = result['funds'][0]
        self.assertEqual(previous['performance']['3M']['fund'], 7.5)
        self.assertEqual(previous['asOf'], '2026-09-30')
        self.assertEqual(previous['status'], 'cache')
        self.assertEqual(result['status'], 'partial')

    def test_seed_contains_requested_funds_without_fabricated_returns(self):
        seed = json.loads(u.OUTPUT.read_text())
        symbols = {f['symbol'] for f in seed['funds']}
        self.assertTrue({'B-INNOTECH','B-GLOBAL','BTP','B-CHINE','B-BHARAT','B-FUTURE','B-EDTECH'} <= symbols)
        if seed['status'] == 'seed':
            self.assertTrue(all(v['fund'] is None and v['benchmark'] is None for f in seed['funds'] for v in f['performance'].values()))


if __name__ == '__main__':
    unittest.main()
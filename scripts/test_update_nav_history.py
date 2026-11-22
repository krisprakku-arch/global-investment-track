import json
import unittest
from datetime import date
from unittest.mock import patch
import update_nav_history as u


class NavRules(unittest.TestCase):
    def test_blank_dash_none_share_classes_map_to_main(self):
        for value in (None, '', ' ', '\t', '-', ' - ', 'main', ' main '):
            with self.subTest(value=value):
                self.assertEqual(u.normalize_class_name(value), 'main')

    def test_nav_normalizes_both_catalog_and_sec_classes(self):
        for value in (None, '', '  ', '-', ' - '):
            rows = [dict(proj_id='M1', fund_class_name=value, nav_date='2026-01-01', last_val=12.34)]
            for catalog_class in (None, '', '-', ' main '):
                with self.subTest(sec=value, catalog=catalog_class):
                    self.assertEqual(u.normalize(rows, 'M1', catalog_class, '2025-01-01', '2026-01-02'),
                                     [{'date': '2026-01-01', 'nav': 12.34}])

    def test_named_classes_remain_distinct_after_trimming(self):
        rows = [dict(proj_id='M1', fund_class_name=' A ', nav_date='2026-01-01', last_val=15),
                dict(proj_id='M1', fund_class_name='B', nav_date='2026-01-01', last_val=25)]
        self.assertEqual(u.normalize(rows, 'M1', ' A ', '2025-01-01', '2026-01-02'),
                         [{'date': '2026-01-01', 'nav': 15}])
        self.assertEqual(u.normalize(rows, 'M1', 'main', '2025-01-01', '2026-01-02'), [])

    def test_fee_normalizes_blank_main_class(self):
        for value in (None, '', '-', ' - '):
            fee = dict(fund_class_name=value, start_date='2026-10-31', fee_type_desc='Management Fee', actual_value=1.5)
            with self.subTest(value=value):
                self.assertEqual(u.management_fee([fee], {'className': '-', 'asOf': '2026-10-31'}), 1.5)

    def test_refresh_updates_all_191_catalog_entries_with_empty_classes(self):
        class Client:
            def items(self, path, **params):
                if path == u.ENDPOINT:
                    return [dict(proj_id=params['proj_id'], fund_class_name=' - ', nav_date='2026-01-16', last_val=12)]
                return []
        catalog = {'funds': [dict(symbol=f'F{i}', projectId=f'M{i}', className=None) for i in range(191)]}
        data, sources, count = u.refresh(Client(), catalog, {}, {}, date(2026, 1, 16))
        self.assertEqual(count, 191)
        for i in range(191):
            self.assertEqual(data[f'F{i}'], [{'date': '2026-01-16', 'nav': 12}])
            self.assertEqual(sources[f'F{i}']['className'], 'main')

    def test_exact_project_and_class_use_nav_per_unit(self):
        rows = [dict(proj_id='M1', fund_class_name='-', nav_date='2026-01-01', last_val=12.34, net_asset=1000000),
                dict(proj_id='M1', fund_class_name='OTHER', nav_date='2026-01-01', last_val=90),
                dict(proj_id='M2', fund_class_name='main', nav_date='2026-01-01', last_val=80)]
        self.assertEqual(u.normalize(rows, 'M1', 'main', '2025-01-01', '2026-01-02'), [{'date': '2026-01-01', 'nav': 12.34}])

    def test_ambiguous_invalid_and_future_nav_excluded(self):
        rows = [dict(proj_id='M1', nav_date=d, last_val=n) for d, n in
                [('2026-01-01', 10), ('2026-01-01', 11), ('2026-01-02', 0), ('2026-99-99', 12), ('2027-01-01', 14)]]
        self.assertEqual(u.normalize(rows, 'M1', 'main', '2025-01-01', '2026-01-03'), [])

    def test_merge_keeps_cache_and_corrects_overlap(self):
        old = [{'date': '2026-01-01', 'nav': 10}, {'date': '2026-01-02', 'nav': 11}]
        self.assertEqual(u.merge(old, [{'date': '2026-01-02', 'nav': 12}], '2025-01-01', '2026-01-03'),
                         [{'date': '2026-01-01', 'nav': 10}, {'date': '2026-01-02', 'nav': 12}])

    def test_fee_matches_factsheet_class_and_actual_not_maximum(self):
        fund = {'className': 'main', 'asOf': '2026-10-31'}
        fee = {'fund_class_name': 'main', 'start_date': '2026-10-31', 'fee_type_desc': 'Management Fee', 'rate': 3, 'actual_value': 1.5}
        self.assertEqual(u.management_fee([fee], fund), 1.5)
        self.assertIsNone(u.management_fee([{**fee, 'fund_class_name': 'OTHER'}], fund))
        self.assertIsNone(u.management_fee([{**fee, 'start_date': '2026-09-30'}], fund))

    def test_missing_key_preserves_exact_verified_history(self):
        before = u.OUTPUT.read_bytes()
        with patch.dict('os.environ', {'SEC_API_KEY': ''}):
            u.main()
        self.assertEqual(u.OUTPUT.read_bytes(), before)

    def test_failed_fund_keeps_history_successful_class_updates(self):
        class Client:
            def items(self, path, **params):
                if params['proj_id'] == 'M1':
                    raise ValueError('offline')
                if path == u.ENDPOINT:
                    self_test.assertEqual(params['start_nav_date'], '2025-01-01')
                    return [dict(proj_id='M2', fund_class_name='main', nav_date='2026-01-16', last_val=12)]
                return []
        self_test = self
        cache = {'A': [{'date': '2025-12-31', 'nav': 10}]}
        catalog = {'funds': [{'symbol': 'A', 'projectId': 'M1'}, {'symbol': 'B', 'projectId': 'M2'}]}
        data, sources, count = u.refresh(Client(), catalog, cache, {}, date(2026, 1, 16))
        self.assertEqual(data['A'], cache['A'])
        self.assertEqual(data['B'], [{'date': '2026-01-16', 'nav': 12.0}])
        self.assertEqual(count, 1)
        self.assertEqual(sources['B']['source'], 'SEC Open Data v2')

    def test_starter_has_real_bblam_dates_and_observed_nav(self):
        data = json.loads(u.OUTPUT.read_text())
        self.assertTrue({'BCARE', 'B-GLOBAL', 'B-INNOTECH', 'B-BHARATA', 'BKD', 'B-SMEQ'} <= set(data))
        self.assertIn({'date': '2026-11-18', 'nav': 45.2827}, data['BCARE'])
        self.assertGreaterEqual(len(data['BCARE']), 240)


if __name__ == '__main__':
    unittest.main()
"""Fetch SEC NAV by project and share class; publish verified compact caches only.

Starter NAV comes from BBLAM's public historical NAV table (see nav_sources.json).
SEC updates use last_val (NAV/unit), never net_asset, buy or sell prices.
"""
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from update_funds import SEC, number, text

ROOT = Path(__file__).resolve().parents[1] / 'public/dashboard/data'
OUTPUT = ROOT / 'nav_history.json'
SOURCES = ROOT / 'nav_sources.json'
CATALOG = ROOT / 'funds.json'
ENDPOINT = '/v2/fund/daily-info/nav'


def normalize(rows, project_id, class_name, start, end):
    values = {}
    ambiguous = set()
    for row in rows:
        cn = row.get('fund_class_name') or 'main'
        if cn == '-':
            cn = 'main'
        if row.get('proj_id') != project_id or cn != class_name:
            continue
        d = str(row.get('nav_date') or '')[:10]
        try:
            date.fromisoformat(d)
        except ValueError:
            continue
        nav = number(row.get('last_val'))
        if not start <= d <= end or nav is None or nav <= 0:
            continue
        if d in values and values[d] != nav:
            ambiguous.add(d)
        values[d] = nav
    return [{'date': d, 'nav': n} for d, n in sorted(values.items()) if d not in ambiguous]


def merge(previous, fresh, start, end):
    # Correct overlapping dates while retaining older observations during partial failures.
    values = {r['date']: r['nav'] for r in previous if start <= r['date'] <= end}
    values.update({r['date']: r['nav'] for r in fresh})
    return [{'date': d, 'nav': n} for d, n in sorted(values.items())]


def management_fee(rows, fund):
    matches = [r for r in rows if (r.get('fund_class_name') or 'main') == fund.get('className', 'main')
               and r.get('start_date') == fund.get('asOf')
               and ('management fee' in text(r.get('fee_type_desc')).lower()
                    or 'ค่าธรรมเนียมการจัดการ' in text(r.get('fee_type_desc')))]
    values = {number(r.get('actual_value')) for r in matches}
    values.discard(None)
    return next(iter(values)) if len(values) == 1 else None


def refresh(client, catalog, cache, sources, today):
    start = (today - timedelta(days=380)).isoformat()
    end = today.isoformat()
    result, provenance = dict(cache), dict(sources)
    projects, fees = {}, {}
    successes = 0
    # Fetch each project once, then split exact share classes; cursor pagination is shared.
    for fund in catalog['funds']:
        pid, symbol = fund.get('projectId'), fund['symbol']
        if not pid:
            continue
        if pid not in projects:
            try:
                projects[pid] = client.items(ENDPOINT, proj_id=pid, start_nav_date=start, end_nav_date=end)
            except Exception as error:
                projects[pid] = None
                print(f'{symbol}: NAV unavailable ({type(error).__name__}); cache retained')
        rows = projects[pid]
        if rows is not None:
            fresh = normalize(rows, pid, fund.get('className') or 'main', start, end)
            if fresh:
                result[symbol] = merge(cache.get(symbol, []), fresh, start, end)
                provenance[symbol] = {'source': 'SEC Open Data v2', 'url': 'https://api.sec.or.th' + ENDPOINT,
                                      'retrieved': today.isoformat(), 'currency': 'THB', 'projectId': pid,
                                      'className': fund.get('className') or 'main'}
                successes += 1
        if pid not in fees:
            try:
                fees[pid] = client.items('/v2/fund/factsheet/fees', proj_id=pid, latest='true')
            except Exception:
                fees[pid] = None
        if fees[pid] is not None:
            fund['managementFee'] = management_fee(fees[pid], fund)
            fund['managementFeeAsOf'] = fund.get('asOf') if fund['managementFee'] is not None else None
    return result, provenance, successes


def write_json(path, value, compact=False):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                                    **({'separators': (',', ':')} if compact else {'indent': 2})) + '\n', encoding='utf-8')
    temporary.replace(path)


def main():
    key = os.environ.get('SEC_API_KEY', '').strip()
    if not key:
        print('SEC_API_KEY not set: verified starter NAV/cache retained unchanged')
        return
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    cache = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else {}
    sources = json.loads(SOURCES.read_text(encoding='utf-8')) if SOURCES.exists() else {}
    try:
        result, provenance, count = refresh(SEC(key), catalog, cache, sources, datetime.now(timezone.utc).date())
    except Exception as error:
        print(f'NAV update unavailable ({type(error).__name__}); existing cache retained')
        return
    if count:
        write_json(OUTPUT, result, compact=True)
        write_json(SOURCES, provenance)
        write_json(CATALOG, catalog)
    print(f'Updated NAV for {count} fund classes; unavailable histories retained')


if __name__ == '__main__':
    main()
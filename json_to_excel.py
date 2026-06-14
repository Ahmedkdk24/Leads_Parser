import json
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / 'Output JSON'
OUTPUT_FILE = INPUT_DIR / 'leads_export.xlsx'


def load_records(path: Path) -> list[dict]:
    with path.open('r', encoding='utf-8') as fh:
        data = json.load(fh)

    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def main() -> None:
    if not INPUT_DIR.exists():
        raise FileNotFoundError(f'Input directory not found: {INPUT_DIR}')

    all_records = []
    for path in sorted(INPUT_DIR.glob('*.json')):
        all_records.extend(load_records(path))

    if not all_records:
        raise ValueError(f'No JSON records found in: {INPUT_DIR}')

    ordered_keys = list(dict.fromkeys(key for record in all_records for key in record.keys()))
    dataframe = pd.DataFrame(
        [{key: record.get(key) for key in ordered_keys} for record in all_records],
        columns=ordered_keys,
    )

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_excel(OUTPUT_FILE, index=False)

    print(f'Exported {len(all_records)} record(s) to {OUTPUT_FILE}')
    print('Columns:', ', '.join(ordered_keys))


if __name__ == '__main__':
    main()

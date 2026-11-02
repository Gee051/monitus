from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

DATASET_DIR = Path("3W/dataset")
LABEL_COLUMNS = ("class", "state")


def source_of(path):
    name = path.name.upper()
    if name.startswith("WELL"):
        return "real"
    if name.startswith("SIMULATED"):
        return "simulated"
    if name.startswith("DRAWN"):
        return "drawn"
    return "other"


files = sorted(DATASET_DIR.rglob("*.parquet"))
print(f"Scanning {len(files)} files. This can take a few minutes...")

sources = defaultdict(Counter)
empty_columns = Counter()
all_columns = set()
class_values = Counter()
state_values = Counter()
total_rows = 0

for i, path in enumerate(files, start=1):
    df = pd.read_parquet(path)
    sources[path.parent.name][source_of(path)] += 1
    total_rows += len(df)

    for column in df.columns:
        if column in LABEL_COLUMNS:
            continue
        all_columns.add(column)
        if df[column].isna().all():
            empty_columns[column] += 1

    class_values.update(df["class"].dropna().unique().tolist())
    state_values.update(df["state"].dropna().unique().tolist())

    if i % 200 == 0:
        print(f"  {i} files done")

print(f"\nTotal rows (seconds of data): {total_rows:,}")

print("\nFiles per folder by source:")
for folder in sorted(sources, key=int):
    c = sources[folder]
    print(
        f"  {folder}: real={c['real']} simulated={c['simulated']} "
        f"drawn={c['drawn']} other={c['other']}"
    )

print("\nSensors: % of files where the column is completely empty")
for column in sorted(all_columns, key=lambda col: empty_columns[col]):
    print(f"  {column:<15} {empty_columns[column] / len(files):6.1%}")

print("\nClass values (value: number of files containing it):")
for value, n in sorted(class_values.items()):
    print(f"  {value}: {n}")

print("\nState values (value: number of files containing it):")
for value, n in sorted(state_values.items()):
    print(f"  {value}: {n}")
from collections import Counter
from pathlib import Path

import pandas as pd

DATASET_DIR = Path("3W/dataset")

files = sorted(DATASET_DIR.rglob("*.parquet"))
print(f"Total parquet files: {len(files)}")

if not files:
    print("No parquet files found. Check that the 3W folder cloned correctly.")
    raise SystemExit

counts = Counter(f.parent.name for f in files)
print("\nFiles per folder:")
for folder, n in sorted(counts.items()):
    print(f"  {folder}: {n}")

sample_path = files[0]
sample = pd.read_parquet(sample_path)
print(f"\nSample file: {sample_path}")
print(f"Rows: {len(sample)}")
print("\nColumns and types:")
print(sample.dtypes)
print("\nFirst 5 rows:")
print(sample.head())
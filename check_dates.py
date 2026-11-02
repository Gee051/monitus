from collections import Counter
from datetime import datetime
from pathlib import Path

DATASET_DIR = Path("3W/dataset")

dates = []
for path in DATASET_DIR.rglob("WELL*.parquet"):
    stamp = path.stem.split("_")[-1]
    dates.append(datetime.strptime(stamp, "%Y%m%d%H%M%S"))

dates.sort()
print(f"Real-well files: {len(dates)}")
print(f"Earliest: {dates[0]:%Y-%m-%d}")
print(f"Latest:   {dates[-1]:%Y-%m-%d}")

print("\nFiles per year:")
for year, n in sorted(Counter(d.year for d in dates).items()):
    print(f"  {year}: {n}")
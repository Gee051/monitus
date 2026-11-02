from pathlib import Path

import pandas as pd

WINDOWS_PATH = Path("data/windows.parquet")

windows = pd.read_parquet(WINDOWS_PATH)
print(f"Rows: {len(windows):,}")

print("\nRows by source:")
print(windows["source"].value_counts().to_string())

print("\nRows by phase:")
print(windows["phase"].value_counts().to_string())

print("\nRows by event:")
print(windows["event"].value_counts().sort_index().to_string())

real = windows[windows["source"] == "real"]
print(f"\nDistinct real wells: {real['group'].nunique()}")
print("\nDistinct real wells per folder:")
print(real.groupby("folder")["group"].nunique().to_string())
from pathlib import Path

import numpy as np
import pandas as pd

DATASET_DIR = Path("3W/dataset")
OUTPUT_PATH = Path("data/windows.parquet")
SENSORS = ["P-PDG", "P-TPT", "T-TPT", "P-MON-CKP", "T-JUS-CKP"]


def source_and_group(path):
    name = path.stem
    if name.upper().startswith("WELL"):
        return "real", name.split("_")[0]
    if name.upper().startswith("SIMULATED"):
        return "simulated", name
    return "drawn", name


def build_features(path):
    df = pd.read_parquet(path).sort_index()

    minute = df[SENSORS].astype("float64").resample("1min").median()
    labels = df["class"].resample("1min").last()

    features = pd.DataFrame(index=minute.index)
    for sensor in SENSORS:
        x = minute[sensor]
        hour_ago = x.shift(60)
        features[f"{sensor}__mean10"] = x.rolling(10, min_periods=5).mean()
        features[f"{sensor}__std10"] = x.rolling(10, min_periods=5).std()
        features[f"{sensor}__chg10"] = x - x.shift(10)
        features[f"{sensor}__chg60"] = x - hour_ago
        features[f"{sensor}__rel60"] = ((x - hour_ago) / (hour_ago.abs() + 1e-6)).clip(-10, 10)

    feature_columns = list(features.columns)
    features[feature_columns] = features[feature_columns].astype("float32")

    features["label"] = labels
    features["minutes_from_start"] = (
        (features.index - minute.index[0]) / pd.Timedelta(minutes=1)
    ).astype(int)
    features = features[features["label"].notna()].copy()
    if features.empty:
        return None

    label = features["label"].astype(int)
    features["label"] = label
    features["event"] = np.where(label >= 100, label - 100, label)
    features["phase"] = np.select(
        [label == 0, label >= 100], ["normal", "developing"], default="full"
    )

    source, group = source_and_group(path)
    features["source"] = source
    features["group"] = group
    features["file"] = path.name
    features["folder"] = int(path.parent.name)

    return features.reset_index()


files = sorted(DATASET_DIR.rglob("*.parquet"))
print(f"Building windows from {len(files)} files. This takes several minutes...")

parts = []
for i, path in enumerate(files, start=1):
    part = build_features(path)
    if part is not None:
        parts.append(part)
    if i % 200 == 0:
        print(f"  {i} files done")

windows = pd.concat(parts, ignore_index=True)
OUTPUT_PATH.parent.mkdir(exist_ok=True)
windows.to_parquet(OUTPUT_PATH, index=False)

print(f"\nSaved {len(windows):,} rows to {OUTPUT_PATH}")

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
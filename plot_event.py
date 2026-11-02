import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd

DATASET_DIR = Path("3W/dataset")
SENSORS = ["P-PDG", "P-TPT", "T-TPT", "P-MON-CKP", "T-JUS-CKP"]
OUTPUT_DIR = Path("plots")

folder = sys.argv[1] if len(sys.argv) > 1 else "8"
event = int(folder)

real_files = sorted((DATASET_DIR / folder).glob("WELL*.parquet"))
if not real_files:
    print(f"No real-well files found in folder {folder}.")
    raise SystemExit

path = real_files[0]
df = pd.read_parquet(path)

labels = df["class"]
developing = (labels == 100 + event).fillna(False).to_numpy(dtype=bool)
full_swing = (labels == event).fillna(False).to_numpy(dtype=bool)

fig, axes = plt.subplots(len(SENSORS), 1, figsize=(12, 10), sharex=True)

for i, (ax, sensor) in enumerate(zip(axes, SENSORS)):
    if df[sensor].isna().all():
        ax.text(0.5, 0.5, "missing in this file", ha="center", va="center",
                transform=ax.transAxes)
    else:
        ax.plot(df.index, df[sensor], linewidth=0.8)

    ax.fill_between(df.index, 0, 1, where=developing, color="orange", alpha=0.3,
                    transform=ax.get_xaxis_transform(),
                    label="fault developing" if i == 0 else None)
    ax.fill_between(df.index, 0, 1, where=full_swing, color="red", alpha=0.2,
                    transform=ax.get_xaxis_transform(),
                    label="fault in full swing" if i == 0 else None)
    ax.set_ylabel(sensor, fontsize=8)

axes[0].legend(loc="upper right", fontsize=8)
fig.suptitle(f"Folder {folder}: {path.name}")
fig.tight_layout()

OUTPUT_DIR.mkdir(exist_ok=True)
output_path = OUTPUT_DIR / f"event_{folder}_{path.stem}.png"
fig.savefig(output_path, dpi=120)

print(f"File: {path.name}")
print(f"Duration: {len(df) / 3600:.1f} hours")
print(f"Seconds normal:     {int((labels == 0).sum())}")
print(f"Seconds developing: {int(developing.sum())}")
print(f"Seconds full swing: {int(full_swing.sum())}")
print(f"Seconds unlabelled: {int(labels.isna().sum())}")

if developing.any() and full_swing.any():
    start_developing = df.index[developing][0]
    start_full = df.index[full_swing][0]
    minutes = (start_full - start_developing).total_seconds() / 60
    print(f"Developing phase lasted {minutes:.1f} minutes before full swing")

print(f"Chart saved to {output_path}")
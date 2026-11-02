import json
from pathlib import Path

import numpy as np
import pandas as pd

DATASET_DIR = Path("3W/dataset")
PREDICTIONS_PATH = Path("data/cv_predictions.parquet")
WINDOWS_PATH = Path("data/windows.parquet")
DASHBOARD_PUBLIC = Path("monitus-dashboard/public")
OUTPUT_DIR = DASHBOARD_PUBLIC / "data"
THRESHOLD = 0.98
PERSISTENCE = 10
MAX_POINTS = 4000
DEGREES = "\u00b0C"
SENSORS = [
    ("P-PDG", "bar", "Pressure at the bottom of the well"),
    ("P-TPT", "bar", "Pressure at the subsea Christmas tree"),
    ("T-TPT", DEGREES, "Temperature at the Christmas tree"),
    ("P-MON-CKP", "bar", "Pressure before the platform choke"),
    ("T-JUS-CKP", DEGREES, "Temperature after the platform choke"),
]
SENSOR_NAMES = [name for name, _, _ in SENSORS]
REL_COLUMNS = [f"{name}__rel60" for name in SENSOR_NAMES]
FAULT_NAMES = {
    0: "Normal operation",
    1: "Abrupt increase of water (BSW)",
    2: "Safety valve closing by itself (DHSV)",
    3: "Severe slugging",
    4: "Flow instability",
    5: "Rapid productivity loss",
    6: "Quick restriction in the production choke",
    7: "Scaling in the production choke",
    8: "Hydrate in the production line",
    9: "Hydrate in the service line",
}
PHASE_CODES = {"normal": 0, "developing": 1, "full": 2}
DEMOS = [
    ("hydrate", 8, "caught", "Hydrate caught early"),
    ("valve", 2, "caught", "Safety valve closure caught early"),
    ("scaling", 7, "caught", "Scaling caught early"),
    ("normal", 0, "quiet", "Normal well with no false alarms"),
    ("missed", 9, "missed", "Honest miss: hydrate in the service line"),
]

if not DASHBOARD_PUBLIC.exists():
    print("monitus-dashboard/public not found. Create the Next.js app first.")
    raise SystemExit


def clean(value, digits):
    if value is None or pd.isna(value) or not np.isfinite(value):
        return None
    return round(float(value), digits)


def to_int(value):
    return None if value is None or pd.isna(value) else int(value)


p = pd.read_parquet(PREDICTIONS_PATH)
p["key"] = p["folder"].astype(str) + "/" + p["file"]
p = p.sort_values(["key", "minutes_from_start"]).reset_index(drop=True)

new_file = p["key"] != p["key"].shift()
flags = p["prob_trouble"] >= THRESHOLD
streak = flags.astype(int).groupby((~flags | new_file).cumsum()).cumsum()
p["alarm"] = streak >= PERSISTENCE
onset = p["alarm"] & (~p["alarm"].shift(fill_value=False) | new_file)
is_normal = p["phase"] == "normal"
is_developing = p["phase"] == "developing"
in_fault = ~is_normal

grouped = p.groupby("key")
files = pd.DataFrame({
    "folder": grouped["folder"].first(),
    "file": grouped["file"].first(),
    "minutes": grouped.size(),
    "has_developing": is_developing.groupby(p["key"]).any(),
    "caught": (p["alarm"] & in_fault).groupby(p["key"]).any(),
    "normal_alarms": (onset & is_normal).groupby(p["key"]).sum(),
})
early_alarm_rows = p[p["alarm"] & is_developing]
files["first_early_alarm"] = early_alarm_rows.groupby("key")["minutes_from_start"].min()
files["developing_start"] = p[is_developing].groupby("key")["minutes_from_start"].min()
files["full_start"] = p[p["phase"] == "full"].groupby("key")["minutes_from_start"].min()
files["warning"] = files["full_start"] - files["first_early_alarm"]
files["predicted_at_alarm"] = (
    early_alarm_rows.groupby("key").head(PERSISTENCE)
    .groupby("key")["predicted"].agg(lambda s: s.mode().iloc[0])
)

normal_days = is_normal.sum() / 1440
fault_files = files[files["folder"] != 0]
score_rows = []
for fault, group in fault_files.groupby("folder"):
    developing = group[group["has_developing"]]
    score_rows.append({
        "id": int(fault),
        "name": FAULT_NAMES[int(fault)],
        "recordings": int(len(group)),
        "caught": round(float(group["caught"].mean()), 3),
        "caughtEarly": round(float(developing["first_early_alarm"].notna().mean()), 3) if len(developing) else None,
        "medianWarningMinutes": clean(group["warning"].median(), 0),
    })


def pick(folder, outcome):
    pool = files[files["folder"] == folder].copy()
    if outcome == "caught":
        pool = pool[pool["first_early_alarm"].notna() & pool["full_start"].notna()]
        if pool.empty:
            return None
        pool["type_match"] = pool["predicted_at_alarm"] == folder
        pool["distance"] = (pool["warning"] - pool["warning"].median()).abs()
        return pool.sort_values(["type_match", "distance"], ascending=[False, True]).index[0]
    if outcome == "quiet":
        quiet = pool[pool["normal_alarms"] == 0]
        pool = quiet if not quiet.empty else pool.sort_values("normal_alarms").head(1)
        return pool.sort_values("minutes", ascending=False).index[0]
    pool = pool[~pool["caught"]]
    if pool.empty:
        return None
    return pool.sort_values(["has_developing", "minutes"], ascending=False).index[0]


windows = pd.read_parquet(WINDOWS_PATH, columns=["file", "folder", "minutes_from_start"] + REL_COLUMNS)


def explain(file, folder, minute):
    row = windows[
        (windows["file"] == file) & (windows["folder"] == folder) & (windows["minutes_from_start"] == minute)
    ]
    if row.empty:
        return []
    values = row.iloc[0]
    ranked = sorted(
        (
            (name, float(values[f"{name}__rel60"]))
            for name in SENSOR_NAMES
            if pd.notna(values[f"{name}__rel60"]) and np.isfinite(values[f"{name}__rel60"])
        ),
        key=lambda item: abs(item[1]),
        reverse=True,
    )
    return [
        f"{name} {'up' if change > 0 else 'down'} {abs(change) * 100:.0f}% in the last hour"
        for name, change in ranked[:3]
        if abs(change) >= 0.01
    ]


def build_demo(demo_id, key, outcome):
    info = files.loc[key]
    folder = int(info["folder"])
    rows = p[p["key"] == key]

    raw = pd.read_parquet(DATASET_DIR / str(folder) / info["file"]).sort_index()
    minute = raw.reindex(columns=SENSOR_NAMES).astype("float64").resample("1min").median()
    start = minute.index[0]
    minute.index = ((minute.index - start) / pd.Timedelta(minutes=1)).astype(int)

    step = max(1, int(np.ceil(len(rows) / MAX_POINTS)))
    sampled = rows.iloc[::step]
    t = sampled["minutes_from_start"].tolist()

    sensors = []
    for name, unit, label in SENSORS:
        series = minute[name].reindex(t)
        if unit == "bar":
            series = series / 1e5
        values = [clean(v, 2) for v in series]
        sensors.append({
            "name": name,
            "unit": unit,
            "label": label,
            "values": values,
            "missing": all(v is None for v in values),
        })

    alarm_minute = to_int(info["first_early_alarm"]) if outcome == "caught" else None
    predicted = to_int(info["predicted_at_alarm"]) if alarm_minute is not None else None

    return {
        "id": demo_id,
        "outcome": outcome,
        "fault": folder,
        "faultName": FAULT_NAMES[folder],
        "well": info["file"].split("_")[0],
        "file": info["file"],
        "startTime": start.isoformat(),
        "durationMinutes": int(rows["minutes_from_start"].max()),
        "threshold": THRESHOLD,
        "persistence": PERSISTENCE,
        "t": t,
        "phase": [PHASE_CODES[phase] for phase in sampled["phase"]],
        "risk": [clean(v, 3) for v in sampled["prob_trouble"]],
        "sensors": sensors,
        "alarmMinute": alarm_minute,
        "developingStartMinute": to_int(info["developing_start"]),
        "fullStartMinute": to_int(info["full_start"]),
        "warningMinutes": to_int(info["warning"]) if alarm_minute is not None else None,
        "predictedFault": predicted,
        "predictedFaultName": FAULT_NAMES.get(predicted) if predicted is not None else None,
        "why": explain(info["file"], folder, alarm_minute) if alarm_minute is not None else [],
    }


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
demo_list = []
for demo_id, folder, outcome, title in DEMOS:
    key = pick(folder, outcome)
    if key is None:
        print(f"Skipped {demo_id}: no suitable recording")
        continue
    demo = build_demo(demo_id, key, outcome)
    with open(OUTPUT_DIR / f"demo-{demo_id}.json", "w", encoding="utf-8") as handle:
        json.dump(demo, handle, separators=(",", ":"))
    demo_list.append({"id": demo_id, "title": title, "outcome": outcome})
    warning = demo["warningMinutes"]
    print(f"{demo_id}: {demo['file']} ({len(demo['t'])} points, warning {warning} min)")

summary = {
    "setting": {"threshold": THRESHOLD, "persistence": PERSISTENCE},
    "falseAlarmsPerDay": round(float((onset & is_normal).sum() / normal_days), 2),
    "realWells": int(p["group"].nunique()),
    "faults": score_rows,
    "demos": demo_list,
}
with open(OUTPUT_DIR / "summary.json", "w", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2)
print(f"\nWrote summary and {len(demo_list)} demos to {OUTPUT_DIR}")
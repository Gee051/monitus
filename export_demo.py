import json
from pathlib import Path

import numpy as np
import pandas as pd

DATASET_DIR = Path("3W/dataset")
PREDICTIONS_PATH = Path("data/cv_predictions.parquet")
DASHBOARD_PUBLIC = Path("monitus-dashboard/public")
OUTPUT_DIR = DASHBOARD_PUBLIC / "data"
THRESHOLD = 0.98
PERSISTENCE = 10
MAX_POINTS = 4000
MAX_CANDIDATES = 30
STUCK_SHARE = 0.9
DEGREES = "°C"
SENSORS = [
    ("P-PDG", "bar", "Pressure at the bottom of the well"),
    ("P-TPT", "bar", "Pressure at the subsea Christmas tree"),
    ("T-TPT", DEGREES, "Temperature at the Christmas tree"),
    ("P-MON-CKP", "bar", "Pressure before the platform choke"),
    ("T-JUS-CKP", DEGREES, "Temperature after the platform choke"),
]
SENSOR_NAMES = [name for name, _, _ in SENSORS]
UNITS = {name: unit for name, unit, _ in SENSORS}
PLAUSIBLE = {"bar": (0, 1000), DEGREES: (-50, 250)}
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


def load_minutes(folder, file):
    path = DATASET_DIR / str(folder) / file
    if not path.exists():
        return None
    raw = pd.read_parquet(path).sort_index()
    minute = raw.reindex(columns=SENSOR_NAMES).astype("float64").resample("1min").median()
    start = minute.index[0]
    minute.index = ((minute.index - start) / pd.Timedelta(minutes=1)).astype(int)
    for name in SENSOR_NAMES:
        if UNITS[name] == "bar":
            minute[name] = minute[name] / 1e5
    return start, minute


def sensor_note(series):
    """Return None for a working sensor, or a short note explaining why it can't be trusted."""
    values = series.dropna()
    if values.empty:
        return "No signal in this recording."
    low, high = PLAUSIBLE[UNITS[series.name]]
    median = values.median()
    if not np.isfinite(median) or median < low or median > high or values.abs().max() > 1e6:
        return "Impossible readings in this recording, so the sensor was faulty."
    if values.abs().max() < 0.01:
        return "Read zero for the whole recording, so the sensor was offline."
    if values.round(6).value_counts().iloc[0] / len(values) >= STUCK_SHARE:
        return "Stuck on one value for almost the whole recording."
    return None


def sensor_health(minute):
    return {name: sensor_note(minute[name]) for name in SENSOR_NAMES}


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


def working_sensor_count(key):
    info = files.loc[key]
    loaded = load_minutes(int(info["folder"]), info["file"])
    if loaded is None:
        return -1
    return sum(note is None for note in sensor_health(loaded[1]).values())


def pick(folder, outcome):
    pool = files[files["folder"] == folder].copy()
    if outcome == "caught":
        pool = pool[pool["first_early_alarm"].notna() & pool["full_start"].notna()]
        pool["type_match"] = pool["predicted_at_alarm"] == folder
        pool["distance"] = (pool["warning"] - pool["warning"].median()).abs()
        order = (["type_match", "distance"], [False, True])
    elif outcome == "quiet":
        pool = pool[pool["normal_alarms"] == 0]
        order = (["minutes"], [False])
    else:
        pool = pool[~pool["caught"]]
        order = (["has_developing", "minutes"], [False, False])
    if pool.empty:
        return None

    pool = pool.sort_values(by=order[0], ascending=order[1]).head(MAX_CANDIDATES)
    pool["working"] = [working_sensor_count(key) for key in pool.index]
    pool = pool[pool["working"] >= 0]
    if pool.empty:
        return None
    best = pool["working"].max()
    return pool[pool["working"] == best].index[0]


def explain(minute, health, at):
    hour_ago = minute.shift(60)
    change = ((minute - hour_ago) / (hour_ago.abs() + 1e-6)).clip(-10, 10)
    if at not in change.index:
        return []
    row = change.loc[at]
    ranked = sorted(
        (
            (name, float(row[name]))
            for name in SENSOR_NAMES
            if health[name] is None and pd.notna(row[name]) and np.isfinite(row[name])
        ),
        key=lambda item: abs(item[1]),
        reverse=True,
    )
    return [
        f"{name} {'up' if value > 0 else 'down'} {abs(value) * 100:.0f}% in the last hour"
        for name, value in ranked[:3]
        if abs(value) >= 0.01
    ]


def pick_hero_sensor(minute, health, fault_start):
    best_name, best_score = None, -1.0
    for name in SENSOR_NAMES:
        if health[name] is not None:
            continue
        series = minute[name].dropna()
        before = series[series.index < fault_start] if fault_start is not None else series.iloc[:0]
        after = series[series.index >= fault_start] if fault_start is not None else series
        if len(after) < 10:
            continue
        spread_after = np.percentile(after, 95) - np.percentile(after, 5)
        spread_before = np.percentile(before, 95) - np.percentile(before, 5) if len(before) >= 10 else 0.0
        score = spread_after / (spread_before + 0.01 * abs(series.median()) + 1e-3)
        if score > best_score:
            best_name, best_score = name, score
    return best_name


def build_demo(demo_id, key, outcome):
    info = files.loc[key]
    folder = int(info["folder"])
    rows = p[p["key"] == key]
    start, minute = load_minutes(folder, info["file"])
    health = sensor_health(minute)

    step = max(1, int(np.ceil(len(rows) / MAX_POINTS)))
    sampled = rows.iloc[::step]
    t = sampled["minutes_from_start"].tolist()

    sensors = []
    for name, unit, label in SENSORS:
        note = health[name]
        values = [None] * len(t) if note else [clean(v, 2) for v in minute[name].reindex(t)]
        sensors.append({
            "name": name,
            "unit": unit,
            "label": label,
            "values": values,
            "missing": note is not None,
            "note": note,
        })

    alarm_minute = to_int(info["first_early_alarm"]) if outcome == "caught" else None
    predicted = to_int(info["predicted_at_alarm"]) if alarm_minute is not None else None
    fault_start = to_int(info["developing_start"])
    if fault_start is None:
        fault_start = to_int(info["full_start"])

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
        "heroSensor": pick_hero_sensor(minute, health, fault_start),
        "alarmMinute": alarm_minute,
        "developingStartMinute": to_int(info["developing_start"]),
        "fullStartMinute": to_int(info["full_start"]),
        "warningMinutes": to_int(info["warning"]) if alarm_minute is not None else None,
        "predictedFault": predicted,
        "predictedFaultName": FAULT_NAMES.get(predicted) if predicted is not None else None,
        "why": explain(minute, health, alarm_minute) if alarm_minute is not None else [],
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
    faulty = [s["name"] for s in demo["sensors"] if s["missing"]]
    print(
        f"{demo_id}: {demo['file']} ({len(demo['t'])} points, warning {demo['warningMinutes']} min, "
        f"hero {demo['heroSensor']}, not shown: {', '.join(faulty) or 'none'})"
    )

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

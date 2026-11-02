from pathlib import Path

import pandas as pd

PREDICTIONS_PATH = Path("data/cv_predictions.parquet")
TRADEOFF_PATH = Path("data/alarm_tradeoff.csv")
THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95, 0.98]
PERSISTENCE_MINUTES = [1, 5, 10, 15, 30]
FALSE_ALARM_BUDGET_PER_DAY = 1.0

p = pd.read_parquet(PREDICTIONS_PATH)
p["key"] = p["folder"].astype(str) + "/" + p["file"]
p = p.sort_values(["key", "minutes_from_start"]).reset_index(drop=True)

new_file = p["key"] != p["key"].shift()
is_normal = p["phase"] == "normal"
is_developing = p["phase"] == "developing"
in_fault = ~is_normal
normal_days = is_normal.sum() / 1440

faults = p[p["folder"] != 0]
fault_keys = faults["key"].unique()
folder_of = faults.groupby("key")["folder"].first()
has_developing = faults.groupby("key")["phase"].apply(lambda s: (s == "developing").any())
full_start = faults[faults["phase"] == "full"].groupby("key")["minutes_from_start"].min()


def streak_lengths(flags):
    breaks = ~flags | new_file
    return flags.astype(int).groupby(breaks.cumsum()).cumsum()


def evaluate(alarm):
    onset = alarm & (~alarm.shift(fill_value=False) | new_file)
    false_alarms_per_day = (onset & is_normal).sum() / normal_days

    caught = (alarm & in_fault).groupby(p["key"]).any().reindex(fault_keys)
    early = (alarm & is_developing).groupby(p["key"]).any().reindex(fault_keys)
    first_early = p.loc[alarm & is_developing].groupby("key")["minutes_from_start"].min()
    warning = (full_start - first_early).dropna()

    per_file = pd.DataFrame({
        "folder": folder_of.reindex(fault_keys),
        "caught": caught,
        "early": early,
        "has_developing": has_developing.reindex(fault_keys),
        "warning": warning.reindex(fault_keys),
    })
    return false_alarms_per_day, per_file


rows = []
per_file_by_setting = {}
for threshold in THRESHOLDS:
    streak = streak_lengths(p["prob_trouble"] >= threshold)
    for minutes in PERSISTENCE_MINUTES:
        false_alarms, per_file = evaluate(streak >= minutes)
        developing_files = per_file[per_file["has_developing"]]
        rows.append({
            "threshold": threshold,
            "persistence_min": minutes,
            "false_alarms_per_day": false_alarms,
            "caught": per_file["caught"].mean(),
            "caught_while_developing": developing_files["early"].mean(),
            "median_warning_min": per_file["warning"].median(),
        })
        per_file_by_setting[(threshold, minutes)] = per_file

tradeoff = pd.DataFrame(rows)
TRADEOFF_PATH.parent.mkdir(exist_ok=True)
tradeoff.to_csv(TRADEOFF_PATH, index=False)

formats = {
    "false_alarms_per_day": lambda x: f"{x:.2f}",
    "caught": lambda x: f"{x:.0%}",
    "caught_while_developing": lambda x: f"{x:.0%}",
    "median_warning_min": lambda x: "n/a" if pd.isna(x) else f"{x:.0f}",
}
print("Trade-off across alarm settings (real wells, cross-validated):")
print(tradeoff.to_string(index=False, formatters=formats))
print(f"\nSaved to {TRADEOFF_PATH}")

within_budget = tradeoff[tradeoff["false_alarms_per_day"] <= FALSE_ALARM_BUDGET_PER_DAY]
if within_budget.empty:
    print(f"\nNo setting keeps false alarms at or below {FALSE_ALARM_BUDGET_PER_DAY} per day.")
else:
    best = within_budget.sort_values(
        ["caught_while_developing", "caught"], ascending=False
    ).iloc[0]
    print(
        f"\nBest setting within {FALSE_ALARM_BUDGET_PER_DAY} false alarm per day: "
        f"threshold {best['threshold']}, {int(best['persistence_min'])} minutes in a row"
    )
    per_file = per_file_by_setting[(best["threshold"], best["persistence_min"])]
    by_fault = per_file.groupby("folder").agg(
        recordings=("caught", "size"),
        caught=("caught", "mean"),
        caught_while_developing=("early", "mean"),
        median_warning_min=("warning", "median"),
    )
    print(by_fault.to_string(formatters=formats))
    print("\nFaults 3 and 4 have no developing phase, so their early-catch rate is always 0%.")
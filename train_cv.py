from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import GroupKFold

WINDOWS_PATH = Path("data/windows.parquet")
PREDICTIONS_PATH = Path("data/cv_predictions.parquet")
N_FOLDS = 5
TRAIN_EVERY = 5
KEEP_COLUMNS = ["file", "group", "folder", "event", "phase", "minutes_from_start"]

windows = pd.read_parquet(WINDOWS_PATH)
feature_columns = [c for c in windows.columns if "__" in c]

infinite_count = int(np.isinf(windows[feature_columns].to_numpy()).sum())
windows[feature_columns] = windows[feature_columns].replace([np.inf, -np.inf], np.nan)
print(f"Replaced {infinite_count:,} infinite feature values with blanks")

real = windows[windows["source"] == "real"]
synthetic = windows[windows["source"] != "real"]

results = []
folds = GroupKFold(n_splits=N_FOLDS)
for fold, (train_idx, test_idx) in enumerate(folds.split(real, groups=real["group"]), start=1):
    train = pd.concat([real.iloc[train_idx], synthetic]).iloc[::TRAIN_EVERY]
    test = real.iloc[test_idx]

    model = HistGradientBoostingClassifier(
        max_iter=200, class_weight="balanced", random_state=42
    )
    model.fit(train[feature_columns], train["event"])

    probabilities = model.predict_proba(test[feature_columns])
    normal_index = list(model.classes_).index(0)

    fold_result = test[KEEP_COLUMNS].copy()
    fold_result["predicted"] = model.predict(test[feature_columns])
    fold_result["prob_trouble"] = 1 - probabilities[:, normal_index]
    fold_result["fold"] = fold
    results.append(fold_result)

    print(
        f"Fold {fold}: trained on {len(train):,} rows, "
        f"tested on {len(test):,} rows from {test['group'].nunique()} real wells"
    )

predictions = pd.concat(results, ignore_index=True)
predictions.to_parquet(PREDICTIONS_PATH, index=False)
print(f"\nSaved predictions to {PREDICTIONS_PATH}")

predictions["alarm"] = predictions["predicted"] != 0
normal = predictions[predictions["phase"] == "normal"]
print(f"\nNormal minutes wrongly flagged (all): {normal['alarm'].mean():.1%}")
print(f"  in purely normal recordings (folder 0): {normal.loc[normal['folder'] == 0, 'alarm'].mean():.1%}")
print(f"  in the normal stretch before a fault: {normal.loc[normal['folder'] != 0, 'alarm'].mean():.1%}")

in_event = predictions["phase"] != "normal"
predictions["alarm_in_event"] = predictions["alarm"] & in_event
predictions["alarm_developing"] = predictions["alarm"] & (predictions["phase"] == "developing")

per_file = (
    predictions[predictions["folder"] != 0]
    .groupby(["folder", "file"])
    .agg(caught=("alarm_in_event", "any"), caught_early=("alarm_developing", "any"))
)
summary = per_file.groupby("folder").agg(
    recordings=("caught", "size"),
    caught=("caught", "mean"),
    caught_while_developing=("caught_early", "mean"),
)
print("\nPer fault (real recordings only, raw minute-by-minute alarms):")
print(summary.to_string(float_format=lambda x: f"{x:.0%}"))

events_only = predictions[in_event]
correct_type = (events_only["predicted"] == events_only["event"]).mean()
print(f"\nFault minutes given the right fault type: {correct_type:.1%}")
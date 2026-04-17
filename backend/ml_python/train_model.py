from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    mean_absolute_error,
    r2_score,
    root_mean_squared_error,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from .data_generation import generate_synthetic_dataset
except ImportError:
    from data_generation import generate_synthetic_dataset


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = ARTIFACTS_DIR / "reports"
DATA_DIR = ARTIFACTS_DIR / "data"

for directory in (ARTIFACTS_DIR, MODELS_DIR, REPORTS_DIR, DATA_DIR):
    directory.mkdir(parents=True, exist_ok=True)


FEATURE_COLUMNS = [
    "city",
    "rainfall",
    "temperature",
    "aqi",
    "humidity",
    "heat_index",
    "orders_completed",
    "active_hours",
    "acceptance_rate",
    "idle_time",
    "avg_delivery_time",
    "zone_demand",
    "order_drop_rate",
    "delivery_delay",
    "traffic_level",
    "zone_risk",
    "experience",
    "past_claims",
    "trust_score",
]
NUMERIC_FEATURES = [column for column in FEATURE_COLUMNS if column != "city"]
CATEGORICAL_FEATURES = ["city"]

RISK_DIRECTION_MAP = {
    "rainfall": 1,
    "temperature": 0.5,
    "aqi": 1,
    "humidity": 0.2,
    "heat_index": 1,
    "orders_completed": -1,
    "active_hours": -1,
    "acceptance_rate": -0.7,
    "idle_time": 1,
    "avg_delivery_time": 0.8,
    "zone_demand": -0.9,
    "order_drop_rate": 1,
    "delivery_delay": 0.9,
    "traffic_level": 0.8,
    "zone_risk": 1,
    "experience": -0.6,
    "past_claims": 0.6,
    "trust_score": -1,
}

PREMIUM_DIRECTION_MAP = {
    "rainfall": 0.5,
    "temperature": 0.2,
    "aqi": 0.4,
    "humidity": 0.1,
    "heat_index": 0.4,
    "orders_completed": -0.3,
    "active_hours": -0.3,
    "acceptance_rate": -0.2,
    "idle_time": 0.4,
    "avg_delivery_time": 0.7,
    "zone_demand": -0.2,
    "order_drop_rate": 1,
    "delivery_delay": 0.8,
    "traffic_level": 0.5,
    "zone_risk": 1,
    "experience": -0.4,
    "past_claims": 0.8,
    "trust_score": -1,
}


@dataclass
class CandidateResult:
    name: str
    pipeline: Pipeline
    metrics: dict[str, Any]
    prediction_frame: pd.DataFrame


def build_preprocessor() -> ColumnTransformer:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
        ],
        sparse_threshold=0.0,
    )


def get_candidate_models(task: str) -> dict[str, Any]:
    if task == "classification":
        models: dict[str, Any] = {
            "random_forest": RandomForestClassifier(
                n_estimators=300,
                max_depth=12,
                min_samples_split=6,
                min_samples_leaf=2,
                class_weight="balanced_subsample",
                random_state=42,
                n_jobs=1,
            ),
            "gradient_boosting": GradientBoostingClassifier(
                learning_rate=0.08,
                max_depth=8,
                random_state=42,
            ),
        }
        try:
            from xgboost import XGBClassifier  # type: ignore

            models["xgboost"] = XGBClassifier(
                n_estimators=300,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.9,
                colsample_bytree=0.9,
                eval_metric="logloss",
                random_state=42,
            )
        except ImportError:
            pass
        return models

    models = {
        "random_forest": RandomForestRegressor(
            n_estimators=300,
            max_depth=12,
            min_samples_split=6,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=1,
        ),
        "gradient_boosting": GradientBoostingRegressor(
            learning_rate=0.06,
            max_depth=8,
            random_state=42,
        ),
    }
    try:
        from xgboost import XGBRegressor  # type: ignore

        models["xgboost"] = XGBRegressor(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=42,
        )
    except ImportError:
        pass
    return models


def evaluate_classifier(y_true: pd.Series, y_pred: np.ndarray, y_prob: np.ndarray | None) -> dict[str, Any]:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "positive_probability_mean": float(np.mean(y_prob)) if y_prob is not None else None,
    }


def evaluate_regressor(y_true: pd.Series, y_pred: np.ndarray) -> dict[str, Any]:
    return {
        "r2": float(r2_score(y_true, y_pred)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(root_mean_squared_error(y_true, y_pred)),
    }


def train_candidates(
    task: str,
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
) -> list[CandidateResult]:
    results: list[CandidateResult] = []
    for model_name, estimator in get_candidate_models(task).items():
        pipeline = Pipeline(
            steps=[
                ("preprocessor", build_preprocessor()),
                ("model", estimator),
            ]
        )
        pipeline.fit(X_train, y_train)
        predictions = pipeline.predict(X_test)

        if task == "classification":
            probabilities = None
            if hasattr(pipeline.named_steps["model"], "predict_proba"):
                probabilities = pipeline.predict_proba(X_test)[:, 1]
            metrics = evaluate_classifier(y_test, predictions, probabilities)
            prediction_frame = pd.DataFrame(
                {
                    "actual": y_test.to_numpy(),
                    "predicted": predictions,
                    "predicted_probability": probabilities if probabilities is not None else np.nan,
                }
            )
        else:
            metrics = evaluate_regressor(y_test, predictions)
            prediction_frame = pd.DataFrame(
                {
                    "actual": y_test.to_numpy(),
                    "predicted": predictions,
                }
            )

        results.append(
            CandidateResult(
                name=model_name,
                pipeline=pipeline,
                metrics=metrics,
                prediction_frame=prediction_frame,
            )
        )
    return results


def choose_best_model(task: str, candidates: list[CandidateResult]) -> CandidateResult:
    if task == "classification":
        return max(candidates, key=lambda candidate: candidate.metrics["accuracy"])
    return max(candidates, key=lambda candidate: candidate.metrics["r2"])


def compute_feature_importance(
    bundle_name: str,
    pipeline: Pipeline,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    task: str,
) -> list[dict[str, Any]]:
    scoring = "accuracy" if task == "classification" else "r2"
    result = permutation_importance(
        pipeline,
        X_test,
        y_test,
        scoring=scoring,
        n_repeats=8,
        random_state=42,
        n_jobs=1,
    )
    importance_df = pd.DataFrame(
        {
            "feature": X_test.columns,
            "importance_mean": result.importances_mean,
            "importance_std": result.importances_std,
        }
    ).sort_values("importance_mean", ascending=False)
    importance_records = importance_df.to_dict(orient="records")
    importance_df.to_csv(REPORTS_DIR / f"{bundle_name}_feature_importance.csv", index=False)
    write_feature_importance_html(bundle_name, importance_df, task)
    return importance_records


def write_feature_importance_html(bundle_name: str, importance_df: pd.DataFrame, task: str) -> None:
    chart_rows: list[str] = []
    max_importance = max(importance_df["importance_mean"].max(), 1e-9)
    for _, row in importance_df.head(12).iterrows():
        width = max(2, int((row["importance_mean"] / max_importance) * 100))
        chart_rows.append(
            f"""
            <div class="row">
              <div class="label">{row["feature"]}</div>
              <div class="bar-wrap"><div class="bar" style="width:{width}%"></div></div>
              <div class="value">{row["importance_mean"]:.4f}</div>
            </div>
            """
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{bundle_name} feature importance</title>
  <style>
    body {{
      font-family: Arial, sans-serif;
      margin: 32px;
      background: #f7f8fb;
      color: #1f2937;
    }}
    .card {{
      max-width: 920px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }}
    h1 {{
      margin-top: 0;
    }}
    .subtitle {{
      color: #475569;
      margin-bottom: 24px;
    }}
    .row {{
      display: grid;
      grid-template-columns: 210px 1fr 90px;
      gap: 16px;
      align-items: center;
      margin-bottom: 14px;
    }}
    .label {{
      font-weight: 600;
    }}
    .bar-wrap {{
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
      height: 16px;
    }}
    .bar {{
      height: 100%;
      background: linear-gradient(90deg, #0f766e, #14b8a6);
      border-radius: 999px;
    }}
    .value {{
      text-align: right;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{bundle_name.replace('_', ' ').title()}</h1>
    <p class="subtitle">Permutation importance for the {task} model on held-out GigWise test data.</p>
    {''.join(chart_rows)}
  </div>
</body>
</html>
"""
    (REPORTS_DIR / f"{bundle_name}_feature_importance.html").write_text(html, encoding="utf-8")


def build_reference_profile(df: pd.DataFrame) -> dict[str, Any]:
    numeric_reference = {column: float(df[column].median()) for column in NUMERIC_FEATURES}
    categorical_reference = {
        column: str(df[column].mode(dropna=True).iloc[0]) for column in CATEGORICAL_FEATURES
    }
    return {
        "numeric": numeric_reference,
        "categorical": categorical_reference,
    }


def prepare_model_bundle(
    task: str,
    best_candidate: CandidateResult,
    X_reference: pd.DataFrame,
    feature_importance: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "task": task,
        "model_name": best_candidate.name,
        "pipeline": best_candidate.pipeline,
        "feature_columns": FEATURE_COLUMNS,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "feature_importance": feature_importance,
        "reference_profile": build_reference_profile(X_reference),
        "metrics": best_candidate.metrics,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    }


def normalize_payload(payload: dict[str, Any], bundle: dict[str, Any]) -> pd.DataFrame:
    normalized: dict[str, Any] = {}
    reference_profile = bundle["reference_profile"]
    for feature in bundle["feature_columns"]:
        if feature in payload and payload[feature] is not None:
            normalized[feature] = payload[feature]
        elif feature in bundle["numeric_features"]:
            normalized[feature] = reference_profile["numeric"][feature]
        else:
            normalized[feature] = reference_profile["categorical"][feature]
    return pd.DataFrame([normalized])


def describe_value_shift(value: float, baseline: float) -> str:
    if baseline == 0:
        return f"value {value:.2f}"
    delta_pct = ((value - baseline) / abs(baseline)) * 100
    return f"{delta_pct:+.1f}% vs typical"


def build_basic_explanation(payload: dict[str, Any], bundle: dict[str, Any]) -> list[str]:
    direction_map = RISK_DIRECTION_MAP if bundle["task"] == "classification" else PREMIUM_DIRECTION_MAP
    reference_profile = bundle["reference_profile"]["numeric"]
    importance_lookup = {item["feature"]: max(item["importance_mean"], 0.0) for item in bundle["feature_importance"]}

    drivers: list[tuple[float, str]] = []
    for feature in bundle["numeric_features"]:
        baseline = float(reference_profile[feature])
        raw_value = payload.get(feature, baseline)
        current_value = baseline if pd.isna(raw_value) else float(raw_value)
        relative_gap = 0.0 if baseline == 0 else (current_value - baseline) / abs(baseline)
        signed_impact = relative_gap * direction_map.get(feature, 0.0) * importance_lookup.get(feature, 0.0)
        if abs(signed_impact) < 0.0025:
            continue
        direction_text = "pushed the prediction upward" if signed_impact > 0 else "helped keep the prediction lower"
        drivers.append(
            (
                abs(signed_impact),
                f"{feature.replace('_', ' ').title()} at {current_value:.2f} ({describe_value_shift(current_value, baseline)}) {direction_text}.",
            )
        )

    city_importance = importance_lookup.get("city", 0.0)
    typical_city = bundle["reference_profile"]["categorical"]["city"]
    current_city = str(payload.get("city", typical_city))
    if city_importance > 0.001 and current_city != typical_city:
        drivers.append(
            (
                city_importance,
                f"City context is {current_city.title()}, which differs from the typical training profile of {typical_city.title()}.",
            )
        )

    ordered = [message for _, message in sorted(drivers, key=lambda item: item[0], reverse=True)[:3]]
    if ordered:
        return ordered
    return ["Inputs are close to the typical worker profile, so no single feature dominates this prediction."]


def train_end_to_end(num_rows: int = 2500) -> dict[str, Any]:
    dataset_path = DATA_DIR / "gigwise_synthetic_dataset.csv"
    df = generate_synthetic_dataset(num_rows=num_rows, save_path=dataset_path)

    X = df[FEATURE_COLUMNS].copy()
    y_classification = df["income_drop"].copy()
    y_regression = df["premium_amount"].copy()

    X_train_risk, X_test_risk, y_train_risk, y_test_risk = train_test_split(
        X,
        y_classification,
        test_size=0.2,
        random_state=42,
        stratify=y_classification,
    )
    X_train_premium, X_test_premium, y_train_premium, y_test_premium = train_test_split(
        X,
        y_regression,
        test_size=0.2,
        random_state=42,
    )

    risk_candidates = train_candidates(
        "classification",
        X_train_risk,
        X_test_risk,
        y_train_risk,
        y_test_risk,
    )
    premium_candidates = train_candidates(
        "regression",
        X_train_premium,
        X_test_premium,
        y_train_premium,
        y_test_premium,
    )

    best_risk = choose_best_model("classification", risk_candidates)
    best_premium = choose_best_model("regression", premium_candidates)

    risk_importance = compute_feature_importance(
        "risk_model",
        best_risk.pipeline,
        X_test_risk,
        y_test_risk,
        "classification",
    )
    premium_importance = compute_feature_importance(
        "premium_model",
        best_premium.pipeline,
        X_test_premium,
        y_test_premium,
        "regression",
    )

    risk_bundle = prepare_model_bundle("classification", best_risk, X_train_risk, risk_importance)
    premium_bundle = prepare_model_bundle("regression", best_premium, X_train_premium, premium_importance)

    with (MODELS_DIR / "risk_model.pkl").open("wb") as file:
        pickle.dump(risk_bundle, file)
    with (MODELS_DIR / "premium_model.pkl").open("wb") as file:
        pickle.dump(premium_bundle, file)

    comparison_report = {
        "risk_model_candidates": {candidate.name: candidate.metrics for candidate in risk_candidates},
        "premium_model_candidates": {candidate.name: candidate.metrics for candidate in premium_candidates},
        "selected_models": {
            "risk_model": best_risk.name,
            "premium_model": best_premium.name,
        },
    }
    (REPORTS_DIR / "model_comparison.json").write_text(
        json.dumps(comparison_report, indent=2),
        encoding="utf-8",
    )

    high_risk_index = int(np.argmax(best_risk.prediction_frame["predicted_probability"].fillna(0).to_numpy()))
    example_risk_payload = X_test_risk.iloc[high_risk_index].to_dict()
    example_premium_payload = X_test_premium.iloc[int(np.argmax(best_premium.prediction_frame["predicted"].to_numpy()))].to_dict()

    training_summary = {
        "dataset_path": str(dataset_path),
        "models": {
            "risk_model": risk_bundle["metrics"],
            "premium_model": premium_bundle["metrics"],
        },
        "selected_models": comparison_report["selected_models"],
        "example_explanations": {
            "risk_prediction": build_basic_explanation(example_risk_payload, risk_bundle),
            "premium_prediction": build_basic_explanation(example_premium_payload, premium_bundle),
        },
    }
    (REPORTS_DIR / "training_summary.json").write_text(
        json.dumps(training_summary, indent=2),
        encoding="utf-8",
    )

    return training_summary


def load_model_bundle(model_path: str | Path) -> dict[str, Any]:
    with Path(model_path).open("rb") as file:
        return pickle.load(file)


if __name__ == "__main__":
    summary = train_end_to_end()
    print("Risk model metrics:")
    print(json.dumps(summary["models"]["risk_model"], indent=2))
    print("Premium model metrics:")
    print(json.dumps(summary["models"]["premium_model"], indent=2))
    print("Selected models:")
    print(json.dumps(summary["selected_models"], indent=2))
    print("Example explanations:")
    print(json.dumps(summary["example_explanations"], indent=2))

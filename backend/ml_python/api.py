from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

try:
    from .train_model import build_basic_explanation, load_model_bundle, normalize_payload
except ImportError:
    from train_model import build_basic_explanation, load_model_bundle, normalize_payload


BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
RISK_MODEL_PATH = MODELS_DIR / "risk_model.pkl"
PREMIUM_MODEL_PATH = MODELS_DIR / "premium_model.pkl"

app = FastAPI(
    title="GigWise ML API",
    description="Income risk and insurance premium prediction service for gig workers.",
    version="1.0.0",
)


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    city: str = Field(default="mumbai", description="Worker operating city.")
    rainfall: float = Field(..., ge=0, description="Rainfall in mm.")
    temperature: float = Field(..., ge=-10, le=60, description="Ambient temperature in Celsius.")
    aqi: float = Field(..., ge=0, le=500, description="US AQI equivalent.")
    humidity: float = Field(..., ge=0, le=100, description="Relative humidity percentage.")
    heat_index: float = Field(..., ge=-10, le=70, description="Feels-like temperature in Celsius.")
    orders_completed: float = Field(..., ge=0, description="Orders completed in the observed window.")
    active_hours: float = Field(..., ge=0, le=24, description="Active working hours.")
    acceptance_rate: float = Field(..., ge=0, le=100, description="Order acceptance rate percentage.")
    idle_time: float = Field(..., ge=0, description="Idle time in minutes.")
    avg_delivery_time: float = Field(..., ge=0, description="Average delivery time in minutes.")
    zone_demand: float = Field(..., ge=0, le=100, description="Demand score for the worker's zone.")
    order_drop_rate: float = Field(..., ge=0, le=100, description="Order drop rate percentage.")
    delivery_delay: float = Field(..., ge=0, description="Delivery delay in minutes.")
    traffic_level: float = Field(..., ge=0, le=100, description="Traffic intensity score.")
    zone_risk: float = Field(..., ge=0, le=100, description="Zone risk score.")
    experience: float = Field(..., ge=0, le=20, description="Worker experience in years.")
    past_claims: int = Field(..., ge=0, description="Historical insurance claims count.")
    trust_score: float = Field(..., ge=0, le=100, description="Trust score percentage.")


def ensure_models_exist() -> None:
    missing_models = [path.name for path in (RISK_MODEL_PATH, PREMIUM_MODEL_PATH) if not path.exists()]
    if missing_models:
        missing_text = ", ".join(missing_models)
        raise HTTPException(
            status_code=500,
            detail=f"Missing model artifacts: {missing_text}. Run train_model.py first.",
        )


def predict_with_bundle(payload: dict[str, Any], bundle: dict[str, Any]) -> dict[str, Any]:
    input_df = normalize_payload(payload, bundle)
    pipeline = bundle["pipeline"]

    if bundle["task"] == "classification":
        predicted_class = int(pipeline.predict(input_df)[0])
        probability = None
        if hasattr(pipeline, "predict_proba"):
            probability = float(pipeline.predict_proba(input_df)[0][1])
        explanation = build_basic_explanation(input_df.iloc[0].to_dict(), bundle)
        return {
            "prediction": predicted_class,
            "probability": round(probability, 4) if probability is not None else None,
            "risk_label": "high_income_drop_risk" if predicted_class == 1 else "stable_income_outlook",
            "explanation": explanation,
            "model_used": bundle["model_name"],
        }

    premium_value = float(pipeline.predict(input_df)[0])
    explanation = build_basic_explanation(input_df.iloc[0].to_dict(), bundle)
    typical_premium = bundle["reference_profile"]["numeric"]["zone_risk"] * 0.48 + 35
    return {
        "prediction": round(premium_value, 2),
        "currency": "INR",
        "billing_frequency": "weekly",
        "pricing_band": "high" if premium_value > typical_premium + 18 else "moderate" if premium_value > typical_premium else "low",
        "explanation": explanation,
        "model_used": bundle["model_name"],
    }


@app.get("/health")
def health_check() -> dict[str, Any]:
    risk_ready = RISK_MODEL_PATH.exists()
    premium_ready = PREMIUM_MODEL_PATH.exists()
    return {
        "status": "ok" if risk_ready and premium_ready else "degraded",
        "risk_model_ready": risk_ready,
        "premium_model_ready": premium_ready,
    }


@app.post("/predict-risk")
def predict_risk(request: PredictionRequest) -> dict[str, Any]:
    ensure_models_exist()
    bundle = load_model_bundle(RISK_MODEL_PATH)
    return predict_with_bundle(request.model_dump(), bundle)


@app.post("/predict-premium")
def predict_premium(request: PredictionRequest) -> dict[str, Any]:
    ensure_models_exist()
    bundle = load_model_bundle(PREMIUM_MODEL_PATH)
    return predict_with_bundle(request.model_dump(), bundle)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "app": "GigWise ML API",
        "endpoints": ["/health", "/predict-risk", "/predict-premium"],
    }

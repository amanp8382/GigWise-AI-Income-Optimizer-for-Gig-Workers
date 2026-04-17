from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
DATA_DIR = ARTIFACTS_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


CITY_COORDINATES: dict[str, dict[str, float]] = {
    "mumbai": {"latitude": 19.0760, "longitude": 72.8777},
    "delhi": {"latitude": 28.6139, "longitude": 77.2090},
    "bangalore": {"latitude": 12.9716, "longitude": 77.5946},
    "hyderabad": {"latitude": 17.3850, "longitude": 78.4867},
    "chennai": {"latitude": 13.0827, "longitude": 80.2707},
    "kolkata": {"latitude": 22.5726, "longitude": 88.3639},
}

FALLBACK_ENVIRONMENT: dict[str, dict[str, float]] = {
    "mumbai": {"rainfall": 7.5, "temperature": 31.0, "aqi": 118.0, "humidity": 78.0},
    "delhi": {"rainfall": 1.6, "temperature": 35.0, "aqi": 182.0, "humidity": 49.0},
    "bangalore": {"rainfall": 3.2, "temperature": 27.0, "aqi": 74.0, "humidity": 68.0},
    "hyderabad": {"rainfall": 2.4, "temperature": 32.0, "aqi": 101.0, "humidity": 58.0},
    "chennai": {"rainfall": 4.4, "temperature": 33.0, "aqi": 96.0, "humidity": 74.0},
    "kolkata": {"rainfall": 5.5, "temperature": 31.0, "aqi": 128.0, "humidity": 81.0},
}


def clamp(value: np.ndarray | float, low: float, high: float) -> np.ndarray | float:
    return np.clip(value, low, high)


def compute_heat_index(temperature_c: np.ndarray | float, humidity: np.ndarray | float) -> np.ndarray:
    temperature_f = np.asarray(temperature_c) * 9 / 5 + 32
    humidity = np.asarray(humidity)
    heat_index_f = (
        -42.379
        + 2.04901523 * temperature_f
        + 10.14333127 * humidity
        - 0.22475541 * temperature_f * humidity
        - 6.83783e-3 * temperature_f**2
        - 5.481717e-2 * humidity**2
        + 1.22874e-3 * temperature_f**2 * humidity
        + 8.5282e-4 * temperature_f * humidity**2
        - 1.99e-6 * temperature_f**2 * humidity**2
    )
    adjusted_f = np.where(
        (temperature_f < 80) | (humidity < 40),
        temperature_f,
        heat_index_f,
    )
    return (adjusted_f - 32) * 5 / 9


def _read_json(url: str, timeout: int = 10) -> dict[str, Any]:
    with urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_live_environment(city: str) -> dict[str, float]:
    city_key = city.lower().strip()
    coords = CITY_COORDINATES.get(city_key)
    if not coords:
        return {**FALLBACK_ENVIRONMENT["mumbai"], "source": "fallback_unknown_city"}

    weather_params = urlencode(
        {
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "current": "temperature_2m,rain,relative_humidity_2m",
            "timezone": "auto",
        }
    )
    aqi_params = urlencode(
        {
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "current": "us_aqi",
            "timezone": "auto",
        }
    )
    weather_url = f"https://api.open-meteo.com/v1/forecast?{weather_params}"
    aqi_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?{aqi_params}"

    try:
        weather_payload = _read_json(weather_url)
        aqi_payload = _read_json(aqi_url)
        current_weather = weather_payload.get("current", {})
        current_aqi = aqi_payload.get("current", {})
        environment = {
            "rainfall": float(current_weather.get("rain", FALLBACK_ENVIRONMENT[city_key]["rainfall"])),
            "temperature": float(
                current_weather.get("temperature_2m", FALLBACK_ENVIRONMENT[city_key]["temperature"])
            ),
            "aqi": float(current_aqi.get("us_aqi", FALLBACK_ENVIRONMENT[city_key]["aqi"])),
            "humidity": float(
                current_weather.get(
                    "relative_humidity_2m",
                    FALLBACK_ENVIRONMENT[city_key]["humidity"],
                )
            ),
            "source": "live_api",
        }
    except (TimeoutError, URLError, ValueError, KeyError, json.JSONDecodeError):
        environment = {**FALLBACK_ENVIRONMENT[city_key], "source": "deterministic_fallback"}

    environment["heat_index"] = float(
        np.round(compute_heat_index(environment["temperature"], environment["humidity"]), 2)
    )
    return environment


def get_environment_snapshots() -> dict[str, dict[str, float]]:
    return {city: fetch_live_environment(city) for city in CITY_COORDINATES}


def _inject_missing_values(df: pd.DataFrame, columns: list[str], rng: np.random.Generator, rate: float) -> pd.DataFrame:
    for column in columns:
        mask = rng.random(len(df)) < rate
        df.loc[mask, column] = np.nan
    return df


def generate_synthetic_dataset(
    num_rows: int = 2500,
    random_state: int = 42,
    save_path: str | Path | None = None,
) -> pd.DataFrame:
    if not 1000 <= num_rows <= 5000:
        raise ValueError("num_rows must be between 1000 and 5000.")

    rng = np.random.default_rng(random_state)
    cities = np.array(list(CITY_COORDINATES.keys()))
    city_choices = rng.choice(cities, size=num_rows, p=[0.22, 0.18, 0.18, 0.14, 0.14, 0.14])
    snapshots = get_environment_snapshots()

    environment_rows = [snapshots[city] for city in city_choices]
    env_df = pd.DataFrame(environment_rows)

    weather_stress = rng.normal(0, 1, num_rows)
    economic_stress = rng.normal(0, 1, num_rows)

    rainfall = clamp(env_df["rainfall"].to_numpy() + rng.gamma(2.4, 4.2, num_rows) + weather_stress * 3.2, 0, 180)
    temperature = clamp(
        env_df["temperature"].to_numpy() + rng.normal(0, 3.5, num_rows) + weather_stress * 1.4,
        16,
        48,
    )
    humidity = clamp(env_df["humidity"].to_numpy() + rng.normal(0, 8.0, num_rows) + rainfall * 0.08, 30, 100)
    aqi = clamp(env_df["aqi"].to_numpy() + rng.normal(0, 28, num_rows) + economic_stress * 11, 35, 420)
    heat_index = clamp(compute_heat_index(temperature, humidity), 18, 60)

    experience = clamp(rng.integers(0, 9, size=num_rows) + rng.normal(0, 0.5, num_rows), 0, 10)
    past_claims = clamp(
        np.round(rng.poisson(0.8 + np.maximum(0, 3.5 - experience) * 0.15, num_rows), 0),
        0,
        8,
    )
    trust_score = clamp(
        62 + experience * 4.6 - past_claims * 3.8 + rng.normal(0, 7, num_rows),
        20,
        100,
    )
    zone_risk = clamp(
        40
        + rainfall * 0.18
        + aqi * 0.07
        + rng.normal(0, 8, num_rows)
        - experience * 1.5
        - trust_score * 0.1,
        10,
        100,
    )
    traffic_level = clamp(
        35 + zone_risk * 0.42 + rng.normal(0, 10, num_rows) + rainfall * 0.09,
        5,
        100,
    )
    zone_demand = clamp(
        72
        - rainfall * 0.11
        - np.maximum(aqi - 120, 0) * 0.04
        + rng.normal(0, 10, num_rows)
        + experience * 1.2,
        10,
        100,
    )
    active_hours = clamp(
        9.4
        - rainfall * 0.018
        - np.maximum(heat_index - 35, 0) * 0.08
        + trust_score * 0.012
        + rng.normal(0, 1.1, num_rows),
        2,
        14,
    )
    idle_time = clamp(
        38
        + rainfall * 0.42
        + traffic_level * 0.3
        - zone_demand * 0.22
        + rng.normal(0, 12, num_rows),
        5,
        240,
    )
    acceptance_rate = clamp(
        82
        - idle_time * 0.08
        - np.maximum(heat_index - 37, 0) * 0.55
        + trust_score * 0.09
        + rng.normal(0, 6, num_rows),
        35,
        100,
    )
    avg_delivery_time = clamp(
        24
        + traffic_level * 0.18
        + rainfall * 0.09
        + np.maximum(heat_index - 34, 0) * 0.25
        + rng.normal(0, 4, num_rows),
        12,
        70,
    )
    delivery_delay = clamp(
        10
        + avg_delivery_time * 0.35
        + rainfall * 0.06
        + traffic_level * 0.08
        + rng.normal(0, 5, num_rows),
        0,
        90,
    )
    order_drop_rate = clamp(
        4
        + rainfall * 0.06
        + np.maximum(aqi - 150, 0) * 0.025
        + delivery_delay * 0.08
        + rng.normal(0, 2.5, num_rows),
        0,
        55,
    )
    orders_completed = clamp(
        28
        + zone_demand * 0.42
        + active_hours * 3.6
        - rainfall * 0.17
        - idle_time * 0.08
        - avg_delivery_time * 0.55
        - order_drop_rate * 0.4
        + experience * 1.4
        + rng.normal(0, 6, num_rows),
        4,
        95,
    )

    risk_signal = (
        (rainfall > 24).astype(int) * 1.2
        + (orders_completed < 32).astype(int) * 1.3
        + (active_hours < 6.5).astype(int) * 1.1
        + (aqi > 175).astype(int) * 0.8
        + (delivery_delay > 30).astype(int) * 0.7
        + (traffic_level > 68).astype(int) * 0.6
        + (zone_demand < 42).astype(int) * 0.9
        + (trust_score < 58).astype(int) * 0.5
        + (past_claims > 2).astype(int) * 0.4
    )
    smoothed_risk_probability = 1 / (1 + np.exp(-(risk_signal - 1.7 + rng.normal(0, 0.65, num_rows))))
    income_drop = (
        (risk_signal >= 2.0)
        | ((rainfall > 35) & (orders_completed < 26))
        | ((heat_index > 40) & (active_hours < 6))
        | ((aqi > 220) & (zone_demand < 40))
        | (smoothed_risk_probability > 0.42)
    ).astype(int)

    premium_amount = (
        35
        + zone_risk * 0.48
        + order_drop_rate * 0.95
        + delivery_delay * 0.35
        + past_claims * 6.5
        + income_drop * 8.5
        + np.maximum(rainfall - 20, 0) * 0.12
        + np.maximum(aqi - 150, 0) * 0.05
        - trust_score * 0.22
        - experience * 0.9
        + rng.normal(0, 4.5, num_rows)
    )
    premium_amount = np.round(clamp(premium_amount, 20, 150), 2)

    df = pd.DataFrame(
        {
            "city": city_choices,
            "rainfall": np.round(rainfall, 2),
            "temperature": np.round(temperature, 2),
            "aqi": np.round(aqi, 2),
            "humidity": np.round(humidity, 2),
            "heat_index": np.round(heat_index, 2),
            "orders_completed": np.round(orders_completed, 2),
            "active_hours": np.round(active_hours, 2),
            "acceptance_rate": np.round(acceptance_rate, 2),
            "idle_time": np.round(idle_time, 2),
            "avg_delivery_time": np.round(avg_delivery_time, 2),
            "zone_demand": np.round(zone_demand, 2),
            "order_drop_rate": np.round(order_drop_rate, 2),
            "delivery_delay": np.round(delivery_delay, 2),
            "traffic_level": np.round(traffic_level, 2),
            "zone_risk": np.round(zone_risk, 2),
            "experience": np.round(experience, 2),
            "past_claims": past_claims.astype(int),
            "trust_score": np.round(trust_score, 2),
            "income_drop": income_drop.astype(int),
            "premium_amount": premium_amount,
            "weather_source": [snapshots[city]["source"] for city in city_choices],
        }
    )

    numeric_columns = [
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
    df = _inject_missing_values(df, numeric_columns, rng, rate=0.03)
    df = _inject_missing_values(df, ["city"], rng, rate=0.015)

    destination = Path(save_path) if save_path else DATA_DIR / "gigwise_synthetic_dataset.csv"
    destination.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(destination, index=False)
    return df


if __name__ == "__main__":
    generated_df = generate_synthetic_dataset()
    print(f"Dataset generated with shape: {generated_df.shape}")
    print(generated_df.head())

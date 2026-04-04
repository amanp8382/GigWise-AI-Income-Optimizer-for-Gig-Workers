const { cityProfiles, defaultCityProfile } = require('./modelConfig');

const CITY_KEYS = Object.keys(cityProfiles);

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalize = (value, min, max) => {
  const numeric = safeNumber(value, NaN);
  if (Number.isNaN(numeric) || max === min) return 0;
  return clamp((numeric - min) / (max - min));
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const isStormCode = (weatherCode) => [95, 96, 99].includes(weatherCode);

const isRainCode = (weatherCode) =>
  [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode);

function buildFeatureState(input) {
  const city = (input.city || 'mumbai').toLowerCase();
  const cityProfile = cityProfiles[city] || defaultCityProfile;
  const avgHours = safeNumber(input.avgHours, 8);
  const deliveries = safeNumber(input.deliveries, 18);
  const workerRating = safeNumber(input.workerRating, 4.6);
  const rainFrequency = clamp(safeNumber(input.rainFrequency, 0));
  const aqiLevel = safeNumber(input.aqiLevel, 120);
  const temperature = safeNumber(input.temperature, 30);
  const windSpeed = safeNumber(input.windSpeed, 12);
  const weatherCode = safeNumber(input.weatherCode, 1);
  const pm25 = safeNumber(input.pm25, aqiLevel / 3);
  const pm10 = safeNumber(input.pm10, aqiLevel / 2);
  const isDay = input.isDay === 0 ? 0 : 1;

  const aqiNorm = normalize(aqiLevel, 30, 400);
  const pm25Norm = normalize(pm25, 10, 180);
  const pm10Norm = normalize(pm10, 20, 260);
  const tempHeatNorm = normalize(temperature, 26, 47);
  const tempColdNorm = normalize(22 - temperature, 0, 18);
  const thermalRisk = clamp(Math.max(tempHeatNorm, tempColdNorm));
  const avgHoursNorm = normalize(avgHours, 3, 14);
  const deliveriesNorm = normalize(deliveries, 4, 45);
  const deliveryIntensityNorm = clamp((deliveries / Math.max(avgHours, 1)) / 4);
  const ratingRiskNorm = 1 - normalize(workerRating, 3, 5);
  const windNorm = normalize(windSpeed, 5, 45);
  const cityRiskNorm = clamp(
    mean([cityProfile.zoneRisk, cityProfile.trafficRisk, cityProfile.climateRisk])
  );
  const volatilityNorm = clamp(cityProfile.volatility);
  const stormNorm = isStormCode(weatherCode) ? 1 : isRainCode(weatherCode) ? 0.45 : 0;
  const daytimeExposureNorm = isDay ? 1 : 0.72;

  return {
    city,
    cityProfile,
    avgHours,
    deliveries,
    workerRating,
    rainFrequency,
    aqiLevel,
    temperature,
    windSpeed,
    weatherCode,
    pm25,
    pm10,
    isDay,
    aqiNorm,
    pm25Norm,
    pm10Norm,
    thermalRisk,
    avgHoursNorm,
    deliveriesNorm,
    deliveryIntensityNorm,
    ratingRiskNorm,
    windNorm,
    cityRiskNorm,
    volatilityNorm,
    stormNorm,
    daytimeExposureNorm
  };
}

function buildFeatureVector(input) {
  const state = buildFeatureState(input);
  const rainRisk = clamp(state.rainFrequency * 0.72 + state.stormNorm * 0.18 + state.windNorm * 0.1);
  const pollutionRisk = clamp(state.aqiNorm * 0.52 + state.pm25Norm * 0.3 + state.pm10Norm * 0.18);
  const fatigueRisk = clamp(
    state.avgHoursNorm * 0.38 +
      state.deliveriesNorm * 0.27 +
      state.deliveryIntensityNorm * 0.22 +
      state.ratingRiskNorm * 0.13
  );
  const locationRisk = clamp(state.cityRiskNorm * 0.72 + state.volatilityNorm * 0.28);
  const interactionRisk = clamp(
    rainRisk * state.deliveryIntensityNorm * 0.32 +
      pollutionRisk * state.avgHoursNorm * 0.24 +
      state.thermalRisk * state.avgHoursNorm * 0.24 +
      state.ratingRiskNorm * Math.max(fatigueRisk, rainRisk) * 0.2
  );
  const baselineRisk = clamp(
    rainRisk * 0.22 +
      pollutionRisk * 0.2 +
      state.thermalRisk * 0.12 +
      fatigueRisk * 0.18 +
      locationRisk * 0.18 +
      state.ratingRiskNorm * 0.1
  );
  const featureMap = {
    bias_proxy: 1,
    rain_norm: state.rainFrequency,
    aqi_norm: state.aqiNorm,
    pm25_norm: state.pm25Norm,
    pm10_norm: state.pm10Norm,
    thermal_risk: state.thermalRisk,
    avg_hours_norm: state.avgHoursNorm,
    deliveries_norm: state.deliveriesNorm,
    delivery_intensity_norm: state.deliveryIntensityNorm,
    rating_risk_norm: state.ratingRiskNorm,
    wind_norm: state.windNorm,
    city_risk_norm: state.cityRiskNorm,
    volatility_norm: state.volatilityNorm,
    storm_norm: state.stormNorm,
    daytime_exposure_norm: state.daytimeExposureNorm,
    rain_risk_norm: rainRisk,
    pollution_risk_norm: pollutionRisk,
    fatigue_risk_norm: fatigueRisk,
    location_risk_norm: locationRisk,
    interaction_risk_norm: interactionRisk,
    baseline_risk_norm: baselineRisk,
    rain_x_delivery: state.rainFrequency * state.deliveryIntensityNorm,
    pollution_x_hours: state.aqiNorm * state.avgHoursNorm,
    heat_x_hours: state.thermalRisk * state.avgHoursNorm,
    wind_x_rain: state.windNorm * state.rainFrequency,
    fatigue_x_rating: state.avgHoursNorm * state.ratingRiskNorm,
    city_x_pollution: state.cityRiskNorm * state.aqiNorm
  };

  for (const cityKey of CITY_KEYS) {
    featureMap[`city_${cityKey}`] = state.city === cityKey ? 1 : 0;
  }

  return {
    state,
    featureMap
  };
}

module.exports = {
  CITY_KEYS,
  clamp,
  safeNumber,
  normalize,
  mean,
  isStormCode,
  isRainCode,
  buildFeatureState,
  buildFeatureVector
};

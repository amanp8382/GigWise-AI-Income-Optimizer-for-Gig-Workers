const { clamp, safeNumber } = require('../ml/featureEngineering');

const BASE_PREMIUM = 100;
const MIN_PREMIUM = 50;
const MAX_PREMIUM = 200;

const MIN_COVERAGE = 500;
const MAX_COVERAGE = 20000;
const INCIDENT_THRESHOLD = 5;

function normalizeRange(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function normalizeFiveStarRating(value) {
  return normalizeRange(safeNumber(value, 0), 0, 5);
}

function normalizeAqi(value) {
  return normalizeRange(safeNumber(value, 0), 0, 500);
}

function normalizeHours(value) {
  return normalizeRange(safeNumber(value, 0), 0, 12);
}

function normalizeCongestionIndex(value) {
  const numeric = safeNumber(value, 0);
  return numeric <= 1 ? clamp(numeric, 0, 1) : normalizeRange(numeric, 0, 10);
}

function normalizeProbability(value, fallback = 0) {
  const numeric = safeNumber(value, fallback);
  return numeric <= 1 ? clamp(numeric, 0, 1) : normalizeRange(numeric, 0, 100);
}

function normalizeIncidents(value, threshold = INCIDENT_THRESHOLD) {
  return normalizeRange(safeNumber(value, 0), 0, threshold);
}

function normalizeWeeklyIncome(value) {
  return Math.max(0, safeNumber(value, 0));
}

function normalizeAreaComponent(value) {
  return normalizeProbability(value, 0);
}

function validateDriverData(driverData = {}) {
  if (!driverData || typeof driverData !== 'object' || Array.isArray(driverData)) {
    throw new Error('driverData must be an object');
  }

  if (!driverData.city || typeof driverData.city !== 'string') {
    throw new Error('city is required');
  }
}

function buildAreaRisk(driverData = {}) {
  if (driverData.areaRisk !== undefined) {
    return normalizeProbability(driverData.areaRisk);
  }

  const crimeRate = normalizeAreaComponent(driverData.crimeRate);
  const accidentRate = normalizeAreaComponent(driverData.accidentRate);
  const disruptionRate = normalizeAreaComponent(driverData.disruptionRate);

  return (crimeRate + accidentRate + disruptionRate) / 3;
}

function buildWeatherRisk(driverData = {}) {
  if (driverData.weatherRisk !== undefined) {
    return normalizeProbability(driverData.weatherRisk);
  }

  const rainfallNorm = normalizeProbability(
    driverData.rainfallNorm !== undefined ? driverData.rainfallNorm : driverData.rainfall
  );
  const heatIndexNorm = normalizeProbability(driverData.heatIndexNorm ?? driverData.heatIndex);
  const extremeWeatherFlag = normalizeProbability(
    driverData.extremeWeatherFlag ?? driverData.extremeWeatherRisk
  );

  return clamp(
    rainfallNorm * 0.4 + heatIndexNorm * 0.3 + extremeWeatherFlag * 0.3,
    0,
    1
  );
}

function calculateRisk(driverData = {}) {
  validateDriverData(driverData);

  const weatherRisk = buildWeatherRisk(driverData);
  const aqiRisk = clamp(safeNumber(driverData.aqi, driverData.aqiLevel) / 300, 0, 1);
  const trafficRisk = normalizeCongestionIndex(
    driverData.congestionIndex ?? driverData.traffic ?? driverData.liveTrafficIndex
  );
  const areaRisk = buildAreaRisk(driverData);
  const exposureRisk = normalizeHours(driverData.activeHours ?? driverData.avgHours);
  const historyRisk = normalizeIncidents(
    driverData.incidents,
    safeNumber(driverData.incidentThreshold, INCIDENT_THRESHOLD)
  );
  const forecastRisk = normalizeProbability(
    driverData.forecastRisk ?? driverData.predictedDisruptionProbability
  );

  const environmentalRisk = clamp(
    weatherRisk * 0.3 + aqiRisk * 0.2 + trafficRisk * 0.2 + areaRisk * 0.3,
    0,
    1
  );
  const totalRisk = clamp(environmentalRisk + exposureRisk + historyRisk, 0, 3);

  return {
    totalRisk,
    environmentalRisk,
    exposureRisk,
    historyRisk,
    forecastRisk,
    normalized: {
      rainfall: Number(
        normalizeProbability(
          driverData.rainfallNorm !== undefined ? driverData.rainfallNorm : driverData.rainfall
        ).toFixed(3)
      ),
      heatIndex: Number(
        normalizeProbability(driverData.heatIndexNorm ?? driverData.heatIndex).toFixed(3)
      ),
      extremeWeather: Number(
        normalizeProbability(
          driverData.extremeWeatherFlag ?? driverData.extremeWeatherRisk
        ).toFixed(3)
      ),
      weather: Number(weatherRisk.toFixed(3)),
      aqi: Number(aqiRisk.toFixed(3)),
      traffic: Number(trafficRisk.toFixed(3)),
      area: Number(areaRisk.toFixed(3)),
      activeHours: Number(exposureRisk.toFixed(3)),
      incidents: Number(historyRisk.toFixed(3)),
      forecast: Number(forecastRisk.toFixed(3))
    },
    weighted: {
      environmental: {
        weather: Number((weatherRisk * 0.3).toFixed(3)),
        aqi: Number((aqiRisk * 0.2).toFixed(3)),
        traffic: Number((trafficRisk * 0.2).toFixed(3)),
        area: Number((areaRisk * 0.3).toFixed(3))
      },
      totals: {
        environmentalRisk: Number(environmentalRisk.toFixed(3)),
        exposureRisk: Number(exposureRisk.toFixed(3)),
        historyRisk: Number(historyRisk.toFixed(3)),
        totalRisk: Number(totalRisk.toFixed(3))
      }
    }
  };
}

function calculateTrustScore(driverData = {}) {
  const rating = normalizeFiveStarRating(driverData.rating ?? driverData.workerRating);
  const consistency = normalizeProbability(driverData.consistency ?? driverData.consistencyScore, 0.7);
  const claimTrend = normalizeProbability(driverData.claimTrend, 0.8);

  const trustScore = clamp(rating * 0.4 + consistency * 0.3 + claimTrend * 0.3, 0, 1);

  return {
    trustScore,
    normalized: {
      rating: Number(rating.toFixed(3)),
      consistency: Number(consistency.toFixed(3)),
      claimTrend: Number(claimTrend.toFixed(3))
    },
    weighted: {
      rating: Number((rating * 0.4).toFixed(3)),
      consistency: Number((consistency * 0.3).toFixed(3)),
      claimTrend: Number((claimTrend * 0.3).toFixed(3))
    }
  };
}

function calculatePremium(driverData = {}) {
  const risk = calculateRisk(driverData);
  const trust = calculateTrustScore(driverData);

  const rawPremium =
    BASE_PREMIUM *
    (1 + risk.totalRisk) *
    (1 + risk.forecastRisk) *
    (1 - trust.trustScore);
  const premium = Math.round(clamp(rawPremium, MIN_PREMIUM, MAX_PREMIUM));

  return {
    basePremium: BASE_PREMIUM,
    rawPremium: Number(rawPremium.toFixed(2)),
    premium,
    totalRisk: Number(risk.totalRisk.toFixed(3)),
    forecastRisk: Number(risk.forecastRisk.toFixed(3)),
    trustScore: Number(trust.trustScore.toFixed(3)),
    normalized: {
      ...risk.normalized,
      ...trust.normalized
    },
    weighted: {
      environmental: risk.weighted.environmental,
      totals: risk.weighted.totals,
      trust: trust.weighted
    }
  };
}

function calculateCoverage(driverData = {}) {
  const premiumDetails =
    driverData.premium === undefined ? calculatePremium(driverData) : driverData;
  const weeklyIncome = normalizeWeeklyIncome(driverData.weeklyIncome ?? driverData.income);
  const trustScore =
    premiumDetails.trustScore !== undefined
      ? safeNumber(premiumDetails.trustScore, 0)
      : calculateTrustScore(driverData).trustScore;
  const totalRisk =
    premiumDetails.totalRisk !== undefined
      ? safeNumber(premiumDetails.totalRisk, 0)
      : calculateRisk(driverData).totalRisk;
  const premium =
    premiumDetails.premium !== undefined
      ? safeNumber(premiumDetails.premium, BASE_PREMIUM)
      : BASE_PREMIUM;

  // Dynamic protection sizing:
  // higher income, stronger trust, stronger forecast signal, and higher premium commitment
  // all expand the amount of income we are willing to protect.
  const premiumCommitment = clamp(premium / BASE_PREMIUM, 0.5, 2);
  const forecastBoost = 1 + trustScore * 0.55 + premiumCommitment * 0.45 + safeNumber(premiumDetails.forecastRisk, 0) * 0.9;
  const riskRetention = clamp(1.18 - totalRisk * 0.22, 0.35, 1.1);
  const projectedCoverage = weeklyIncome * forecastBoost * riskRetention;

  // Instead of a flat range, use income-aware dynamic bounds so higher-earning drivers
  // can access meaningfully larger coverage while still keeping underwriting guardrails.
  const dynamicFloor = Math.max(MIN_COVERAGE, Math.round(weeklyIncome * (0.16 + trustScore * 0.18)));
  const dynamicCeiling = Math.max(
    dynamicFloor,
    Math.min(
      MAX_COVERAGE,
      Math.round(
        weeklyIncome *
          (1.45 + trustScore * 0.95 + safeNumber(premiumDetails.forecastRisk, 0) * 0.85 + premiumCommitment * 0.35)
      )
    )
  );
  const coverage = Math.round(clamp(projectedCoverage, dynamicFloor, dynamicCeiling));

  return {
    weeklyIncome,
    rawCoverage: Number(projectedCoverage.toFixed(2)),
    coverage,
    trustScore: Number(trustScore.toFixed(3)),
    totalRisk: Number(totalRisk.toFixed(3)),
    dynamicFloor,
    dynamicCeiling
  };
}

function buildPricingBreakdown(driverData = {}) {
  const premium = calculatePremium(driverData);
  const coverage = calculateCoverage({
    ...driverData,
    ...premium
  });

  return {
    ...premium,
    coverage: coverage.coverage,
    rawCoverage: coverage.rawCoverage
  };
}

module.exports = {
  BASE_PREMIUM,
  MIN_PREMIUM,
  MAX_PREMIUM,
  MIN_COVERAGE,
  MAX_COVERAGE,
  INCIDENT_THRESHOLD,
  normalizeRange,
  normalizeFiveStarRating,
  normalizeAqi,
  normalizeHours,
  normalizeCongestionIndex,
  normalizeProbability,
  normalizeIncidents,
  calculateRisk,
  calculateTrustScore,
  calculatePremium,
  calculateCoverage,
  buildPricingBreakdown
};

/*
Example input:
const driverData = {
  city: 'Mumbai',
  rainfallNorm: 0.7,
  heatIndexNorm: 0.5,
  extremeWeatherFlag: 1,
  aqiLevel: 165,
  congestionIndex: 0.62,
  crimeRate: 0.4,
  accidentRate: 0.55,
  disruptionRate: 0.6,
  activeHours: 9,
  incidents: 1,
  forecastRisk: 0.35,
  workerRating: 4.6,
  consistencyScore: 0.82,
  claimTrend: 0.9,
  weeklyIncome: 4200
};

Example output shape:
{
  premium: 72,
  coverage: 200,
  totalRisk: 1.276,
  forecastRisk: 0.35,
  trustScore: 0.892
}
*/

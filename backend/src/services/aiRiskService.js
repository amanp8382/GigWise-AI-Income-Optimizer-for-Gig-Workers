const axios = require('axios');

const { fetchAQI, fetchWeather } = require('./weatherService');
const { cityProfiles, defaultCityProfile } = require('../ml/modelConfig');
const { clamp, safeNumber, buildFeatureState } = require('../ml/featureEngineering');
const { predictPremiumWithModel } = require('../ml/premiumModel');
const {
  BASE_PREMIUM,
  calculateRisk,
  calculatePremium: calculateDynamicPremium,
  calculateCoverage: calculateDynamicCoverage,
  calculateTrustScore
} = require('./premiumCalculator');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const DEFAULT_ML_TIMEOUT_MS = 8000;

const normalizeBaseUrl = (value) =>
  String(value || DEFAULT_ML_API_URL)
    .trim()
    .replace(/\/+$/, '');

const getMlApiUrl = () => normalizeBaseUrl(process.env.ML_API_URL);
const getMlTimeout = () => {
  const timeout = Number(process.env.ML_API_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_ML_TIMEOUT_MS;
};

const riskLabelForScore = (riskScore) => {
  if (riskScore < 0.6) return 'Low';
  if (riskScore < 1.3) return 'Medium';
  return 'High';
};

function explainPricing({ premiumDetails, coverageDetails, mlPredictionUsed }) {
  const reasons = [];

  if (premiumDetails.normalized.weather >= 0.55) reasons.push('weather disruption risk');
  if (premiumDetails.normalized.aqi >= 0.45) reasons.push('pollution exposure');
  if (premiumDetails.normalized.traffic >= 0.5) reasons.push('traffic congestion');
  if (premiumDetails.normalized.area >= 0.5) reasons.push('area disruption risk');
  if (premiumDetails.normalized.activeHours >= 0.6) reasons.push('high active hours');
  if (premiumDetails.normalized.incidents >= 0.4) reasons.push('claim history');

  if (!reasons.length) {
    return mlPredictionUsed
      ? `Premium is Rs${premiumDetails.premium} with coverage Rs${coverageDetails.coverage} using the connected ML model and balanced risk conditions`
      : `Premium is Rs${premiumDetails.premium} with coverage Rs${coverageDetails.coverage} under balanced risk conditions`;
  }

  const intro = `${reasons.join(', ')} are driving premium and AI-sized coverage adjustments this week`;
  return mlPredictionUsed ? `${intro}. Local premium model predictions are active.` : intro;
}

function deriveEnvironmentalInputs(input) {
  const state = buildFeatureState(input);

  const rainfallNorm = clamp(input.rainfallNorm ?? state.rainFrequency, 0, 1);
  const heatIndexNorm = clamp(input.heatIndexNorm ?? state.thermalRisk, 0, 1);
  const extremeWeatherFlag =
    input.extremeWeatherFlag !== undefined
      ? clamp(safeNumber(input.extremeWeatherFlag, 0), 0, 1)
      : state.stormNorm > 0
        ? 1
        : state.rainFrequency >= 0.5 || state.thermalRisk >= 0.7
          ? 1
          : 0;
  const congestionIndex =
    input.congestionIndex !== undefined
      ? clamp(safeNumber(input.congestionIndex, 0), 0, 1)
      : clamp(
          state.cityProfile.trafficRisk * 0.65 +
            state.deliveryIntensityNorm * 0.2 +
            state.avgHoursNorm * 0.15,
          0,
          1
        );

  const crimeRate =
    input.crimeRate !== undefined
      ? clamp(safeNumber(input.crimeRate, 0), 0, 1)
      : clamp(state.cityProfile.zoneRisk * 0.8, 0, 1);
  const accidentRate =
    input.accidentRate !== undefined
      ? clamp(safeNumber(input.accidentRate, 0), 0, 1)
      : clamp(state.cityProfile.trafficRisk * 0.75, 0, 1);
  const disruptionRate =
    input.disruptionRate !== undefined
      ? clamp(safeNumber(input.disruptionRate, 0), 0, 1)
      : clamp(state.cityProfile.climateRisk * 0.65 + rainfallNorm * 0.35, 0, 1);

  const forecastRisk =
    input.forecastRisk !== undefined
      ? clamp(safeNumber(input.forecastRisk, 0), 0, 1)
      : clamp(
          rainfallNorm * 0.35 +
            heatIndexNorm * 0.2 +
            extremeWeatherFlag * 0.25 +
            congestionIndex * 0.2,
          0,
          1
        );

  return {
    state,
    rainfallNorm,
    heatIndexNorm,
    extremeWeatherFlag,
    congestionIndex,
    crimeRate,
    accidentRate,
    disruptionRate,
    forecastRisk
  };
}

async function buildRiskInput(input = {}) {
  const city = input.city || 'Mumbai';
  const cityKey = city.toLowerCase();
  const cityProfile = cityProfiles[cityKey] || defaultCityProfile;
  const incomeFactorWeekly =
    input.incomeFactor !== undefined ? safeNumber(input.incomeFactor, 0) * 7 * 20 : null;
  const derivedWeeklyIncome =
    safeNumber(input.activeHours ?? input.avgHours, 8) *
    safeNumber(input.deliveries ?? input.ordersPerDay, 18) *
    30;

  const weather = await fetchWeather(city);
  const aqi = await fetchAQI(city);

  const liveRain = safeNumber(weather?.current?.rain ?? weather?.hourly?.rain?.[0], 0);
  const liveTemp = safeNumber(
    weather?.current?.temperature_2m ?? weather?.hourly?.temperature_2m?.[0],
    30
  );
  const liveWind = safeNumber(weather?.current?.wind_speed_10m, 12);
  const liveWeatherCode = safeNumber(
    weather?.current?.weather_code ?? weather?.hourly?.weather_code?.[0],
    1
  );
  const liveAqi = safeNumber(aqi?.value, 120);
  const livePm25 = safeNumber(aqi?.current?.pm2_5, liveAqi / 3);
  const livePm10 = safeNumber(aqi?.current?.pm10, liveAqi / 2);
  const rainFrequency = clamp(liveRain / 8);

  return {
    city,
    avgHours: safeNumber(input.avgHours ?? input.activeHours, 8),
    activeHours: safeNumber(input.activeHours ?? input.avgHours, 8),
    deliveries: safeNumber(input.deliveries ?? input.ordersPerDay, 18),
    ordersPerDay: safeNumber(input.ordersPerDay ?? input.deliveries, 18),
    workerRating: safeNumber(input.workerRating ?? input.rating, 4.6),
    weeklyIncome: safeNumber(
      input.weeklyIncome ?? input.income ?? incomeFactorWeekly ?? derivedWeeklyIncome,
      3500
    ),
    incomeFactor: safeNumber(input.incomeFactor, 10),
    incidents: Math.max(0, Math.round(safeNumber(input.incidents, 0))),
    consistencyScore: input.consistencyScore ?? input.consistency ?? 0.72,
    claimTrend: input.claimTrend ?? 0.8,
    congestionIndex: input.congestionIndex,
    crimeRate: input.crimeRate,
    accidentRate: input.accidentRate,
    disruptionRate: input.disruptionRate,
    forecastRisk: input.forecastRisk,
    rainfallNorm: input.rainfallNorm,
    heatIndexNorm: input.heatIndexNorm,
    extremeWeatherFlag: input.extremeWeatherFlag,
    aqiLevel: liveAqi,
    temperature: liveTemp,
    windSpeed: liveWind,
    weatherCode: liveWeatherCode,
    pm25: livePm25,
    pm10: livePm10,
    rainFrequency,
    isDay: weather?.current?.is_day ?? 1,
    cityProfile,
    dataSource: {
      weather: `server_${weather?.source || 'live_api'}`,
      aqi: `server_${aqi?.source || 'live_api'}`,
      userAdjustableFields: [
        'activeHours',
        'deliveries',
        'workerRating',
        'weeklyIncome',
        'incidents',
        'consistencyScore',
        'claimTrend',
        'congestionIndex',
        'crimeRate',
        'accidentRate',
        'disruptionRate',
        'forecastRisk'
      ],
      lockedFields: ['aqiLevel', 'temperature', 'windSpeed', 'weatherCode', 'pm25', 'pm10', 'rainFrequency']
    },
    liveContext: {
      weather,
      aqi
    }
  };
}

function calculateCoverage(avgHoursOrDriverData, deliveries, riskScore, incomeFactor) {
  if (
    avgHoursOrDriverData &&
    typeof avgHoursOrDriverData === 'object' &&
    !Array.isArray(avgHoursOrDriverData)
  ) {
    return calculateDynamicCoverage(avgHoursOrDriverData);
  }

  const safeAvgHours = Math.max(0, safeNumber(avgHoursOrDriverData, 0));
  const safeDeliveries = Math.max(0, safeNumber(deliveries, 0));
  const safeRiskScore = clamp(safeNumber(riskScore, 0), 0, 3);
  const safeIncomeFactor = Math.max(0, safeNumber(incomeFactor, 0));
  const weeklyIncome = safeIncomeFactor > 0 ? safeIncomeFactor * 7 * 20 : safeAvgHours * safeDeliveries * 30;

  return calculateDynamicCoverage({
    city: 'Mumbai',
    activeHours: safeAvgHours,
    deliveries: safeDeliveries,
    weeklyIncome,
    totalRisk: safeRiskScore,
    premium: BASE_PREMIUM,
    trustScore: 0.7,
    forecastRisk: clamp(safeRiskScore / 3, 0, 1),
    normalized: {
      weather: clamp(safeRiskScore / 3, 0, 1)
    }
  }).coverage;
}

function buildFastApiPayload(input, environmental) {
  const trust = calculateTrustScore({
    workerRating: input.workerRating,
    consistencyScore: input.consistencyScore,
    claimTrend: input.claimTrend
  });
  const state = environmental.state;

  const rainfall = Math.max(0, Number((environmental.rainfallNorm * 12).toFixed(2)));
  const temperature = Number(safeNumber(input.temperature, 30).toFixed(2));
  const humidity = Number(
    clamp(
      safeNumber(input.liveContext?.weather?.current?.relative_humidity_2m, 52) +
        environmental.rainfallNorm * 24 +
        state.windNorm * 8,
      0,
      100
    ).toFixed(2)
  );
  const heatIndex = Number(
    clamp(
      temperature + environmental.heatIndexNorm * 6 + humidity * 0.02,
      -10,
      70
    ).toFixed(2)
  );
  const ordersCompleted = Math.max(0, Number(safeNumber(input.deliveries, 18).toFixed(2)));
  const activeHours = Number(clamp(safeNumber(input.activeHours, 8), 0, 24).toFixed(2));
  const acceptanceRate = Number(
    clamp(
      safeNumber(
        input.acceptanceRate,
        trust.trustScore * 72 + (1 - state.ratingRiskNorm) * 18 + state.deliveryIntensityNorm * 10
      ),
      0,
      100
    ).toFixed(2)
  );
  const idleTime = Number(
    Math.max(
      0,
      safeNumber(
        input.idleTime,
        (12 - activeHours) * 7 + environmental.rainfallNorm * 18 + (1 - state.deliveryIntensityNorm) * 24
      )
    ).toFixed(2)
  );
  const avgDeliveryTime = Number(
    Math.max(
      0,
      safeNumber(
        input.avgDeliveryTime,
        18 + environmental.congestionIndex * 16 + environmental.rainfallNorm * 8
      )
    ).toFixed(2)
  );
  const zoneDemand = Number(
    clamp(
      safeNumber(
        input.zoneDemand,
        (1 - state.cityProfile.volatility * 0.55 + state.deliveryIntensityNorm * 0.35 - environmental.rainfallNorm * 0.15) * 100
      ),
      0,
      100
    ).toFixed(2)
  );
  const orderDropRate = Number(
    clamp(
      safeNumber(
        input.orderDropRate,
        environmental.forecastRisk * 24 + state.ratingRiskNorm * 8 + environmental.rainfallNorm * 10
      ),
      0,
      100
    ).toFixed(2)
  );
  const deliveryDelay = Number(
    Math.max(
      0,
      safeNumber(
        input.deliveryDelay,
        environmental.congestionIndex * 12 + environmental.rainfallNorm * 10
      )
    ).toFixed(2)
  );
  const trafficLevel = Number(
    clamp(
      safeNumber(input.trafficLevel, environmental.congestionIndex * 100),
      0,
      100
    ).toFixed(2)
  );
  const zoneRisk = Number(
    clamp(
      safeNumber(
        input.zoneRisk,
        ((environmental.crimeRate + environmental.accidentRate + environmental.disruptionRate) / 3) * 100
      ),
      0,
      100
    ).toFixed(2)
  );
  const experience = Number(
    clamp(
      safeNumber(input.experience, safeNumber(input.workerExperienceYears, activeHours / 2.25)),
      0,
      20
    ).toFixed(2)
  );
  const pastClaims = Math.max(0, Math.round(safeNumber(input.pastClaims, input.incidents)));
  const trustScore = Number(clamp(trust.trustScore * 100, 0, 100).toFixed(2));

  return {
    city: String(input.city || 'Mumbai').toLowerCase(),
    rainfall,
    temperature,
    aqi: Number(clamp(safeNumber(input.aqiLevel, 120), 0, 500).toFixed(2)),
    humidity,
    heat_index: heatIndex,
    orders_completed: ordersCompleted,
    active_hours: activeHours,
    acceptance_rate: acceptanceRate,
    idle_time: idleTime,
    avg_delivery_time: avgDeliveryTime,
    zone_demand: zoneDemand,
    order_drop_rate: orderDropRate,
    delivery_delay: deliveryDelay,
    traffic_level: trafficLevel,
    zone_risk: zoneRisk,
    experience,
    past_claims: pastClaims,
    trust_score: trustScore
  };
}

async function fetchMlPredictions(payload) {
  const client = axios.create({
    baseURL: getMlApiUrl(),
    timeout: getMlTimeout()
  });

  const [riskResponse, premiumResponse] = await Promise.all([
    client.post('/predict-risk', payload),
    client.post('/predict-premium', payload)
  ]);

  return {
    risk: riskResponse.data,
    premium: premiumResponse.data
  };
}

function buildMlBackedResult(input, environmental, mlPrediction) {
  const driverData = {
    city: input.city,
    rainfallNorm: environmental.rainfallNorm,
    heatIndexNorm: environmental.heatIndexNorm,
    extremeWeatherFlag: environmental.extremeWeatherFlag,
    aqiLevel: input.aqiLevel,
    congestionIndex: environmental.congestionIndex,
    crimeRate: environmental.crimeRate,
    accidentRate: environmental.accidentRate,
    disruptionRate: environmental.disruptionRate,
    activeHours: input.activeHours,
    deliveries: input.deliveries,
    incidents: input.incidents,
    forecastRisk:
      mlPrediction?.risk?.probability != null
        ? clamp(safeNumber(mlPrediction.risk.probability, environmental.forecastRisk), 0, 1)
        : environmental.forecastRisk,
    workerRating: input.workerRating,
    consistencyScore: input.consistencyScore,
    claimTrend: input.claimTrend,
    weeklyIncome: input.weeklyIncome
  };

  const riskDetails = calculateRisk(driverData);
  const heuristicPremium = calculateDynamicPremium(driverData);
  const mlPremiumValue = safeNumber(mlPrediction?.premium?.prediction, heuristicPremium.premium);
  const premium = Math.round(clamp(mlPremiumValue, 15, 200));
  const rawPremium = Number(mlPremiumValue.toFixed(2));
  const riskProbability = clamp(
    safeNumber(mlPrediction?.risk?.probability, heuristicPremium.forecastRisk),
    0,
    1
  );
  const trustDetails = calculateTrustScore({
    workerRating: input.workerRating,
    consistencyScore: input.consistencyScore,
    claimTrend: input.claimTrend
  });
  const trustDiscount = Number((trustDetails.trustScore * 5).toFixed(2));
  const forecastRiskAmount = Number((riskProbability * 10).toFixed(2));
  const riskFactorAmount = Number((Math.max(0, rawPremium - BASE_PREMIUM - forecastRiskAmount + trustDiscount)).toFixed(2));
  const totalRisk = Number(
    clamp(
      mlPrediction?.risk?.prediction === 1
        ? 1.4 + riskProbability * 1.3
        : riskProbability * 1.2,
      0,
      3
    ).toFixed(2)
  );
  const coverageDetails = calculateDynamicCoverage({
    ...driverData,
    premium,
    rawPremium,
    totalRisk,
    forecastRisk: riskProbability,
    trustScore: trustDetails.trustScore,
    normalized: heuristicPremium.normalized
  });

  return {
    input,
    normalized: heuristicPremium.normalized,
    weighted: {
      weatherRisk: Number((heuristicPremium.normalized.weather ?? 0).toFixed(3)),
      activityRisk: Number(
        (((heuristicPremium.normalized.activeHours ?? 0) + (heuristicPremium.normalized.incidents ?? 0)) / 2).toFixed(3)
      ),
      zoneRisk: Number((heuristicPremium.normalized.area ?? 0).toFixed(3)),
      heuristic: heuristicPremium.weighted,
      mlProbability: Number(riskProbability.toFixed(3))
    },
    ml: {
      source: 'fastapi',
      endpoint: getMlApiUrl(),
      requestPayload: buildFastApiPayload(input, environmental),
      risk: mlPrediction.risk,
      premium: mlPrediction.premium
    },
    heuristicPremium: heuristicPremium.premium,
    basePremium: BASE_PREMIUM,
    riskFactorAmount,
    forecastRiskAmount,
    trustDiscount,
    riskScore: totalRisk,
    forecastRisk: Number(riskProbability.toFixed(2)),
    trustScore: Number(trustDetails.trustScore.toFixed(2)),
    rawPremium,
    premium,
    rawCoverage: coverageDetails.rawCoverage,
    coverage: coverageDetails.coverage,
    coverageBounds: {
      floor: coverageDetails.dynamicFloor,
      ceiling: coverageDetails.dynamicCeiling
    },
    riskLevel: riskLabelForScore(totalRisk),
    explanation: explainPricing({
      premiumDetails: {
        ...heuristicPremium,
        premium,
        rawPremium
      },
      coverageDetails,
      mlPredictionUsed: true
    }),
    pricingFormula: 'Weekly Premium = FastAPI ML premium prediction with trust and forecast-aware Node adjustments for compatibility',
    coverageFormula: 'Dynamic income protection sized from income, premium commitment, trust score, forecast risk, and total risk',
    environmentalInputsLocked: true
  };
}

async function calculatePremiumFromHeuristics(userData = {}) {
  const input = await buildRiskInput(userData);
  const environmental = deriveEnvironmentalInputs(input);

  const driverData = {
    city: input.city,
    rainfallNorm: environmental.rainfallNorm,
    heatIndexNorm: environmental.heatIndexNorm,
    extremeWeatherFlag: environmental.extremeWeatherFlag,
    aqiLevel: input.aqiLevel,
    congestionIndex: environmental.congestionIndex,
    crimeRate: environmental.crimeRate,
    accidentRate: environmental.accidentRate,
    disruptionRate: environmental.disruptionRate,
    activeHours: input.activeHours,
    incidents: input.incidents,
    forecastRisk: environmental.forecastRisk,
    workerRating: input.workerRating,
    consistencyScore: input.consistencyScore,
    claimTrend: input.claimTrend,
    weeklyIncome: input.weeklyIncome
  };

  const riskDetails = calculateRisk(driverData);
  const premiumDetails = calculateDynamicPremium(driverData);
  const coverageDetails = calculateDynamicCoverage({
    ...driverData,
    ...premiumDetails
  });

  return {
    input,
    normalized: premiumDetails.normalized,
    weighted: premiumDetails.weighted,
    ml: {
      source: 'heuristic_fallback'
    },
    heuristicPremium: premiumDetails.premium,
    basePremium: BASE_PREMIUM,
    riskFactorAmount: premiumDetails.riskFactorAmount,
    forecastRiskAmount: premiumDetails.forecastRiskAmount,
    trustDiscount: premiumDetails.trustDiscount,
    riskScore: Number(premiumDetails.totalRisk.toFixed(2)),
    forecastRisk: Number(premiumDetails.forecastRisk.toFixed(2)),
    trustScore: Number(premiumDetails.trustScore.toFixed(2)),
    rawPremium: premiumDetails.rawPremium,
    premium: premiumDetails.premium,
    rawCoverage: coverageDetails.rawCoverage,
    coverage: coverageDetails.coverage,
    coverageBounds: {
      floor: coverageDetails.dynamicFloor,
      ceiling: coverageDetails.dynamicCeiling
    },
    riskLevel: riskLabelForScore(riskDetails.totalRisk),
    explanation: explainPricing({
      premiumDetails,
      coverageDetails,
      mlPredictionUsed: false
    }),
    pricingFormula: 'Weekly Premium = Base Price + Risk Factor + Forecast Risk - Trust Discount',
    coverageFormula: 'Dynamic income protection sized from income, premium commitment, trust score, forecast risk, and total risk',
    environmentalInputsLocked: true
  };
}

function buildLocalModelBackedResult(input, environmental) {
  const driverData = {
    city: input.city,
    rainfallNorm: environmental.rainfallNorm,
    heatIndexNorm: environmental.heatIndexNorm,
    extremeWeatherFlag: environmental.extremeWeatherFlag,
    aqiLevel: input.aqiLevel,
    congestionIndex: environmental.congestionIndex,
    crimeRate: environmental.crimeRate,
    accidentRate: environmental.accidentRate,
    disruptionRate: environmental.disruptionRate,
    activeHours: input.activeHours,
    deliveries: input.deliveries,
    incidents: input.incidents,
    forecastRisk: environmental.forecastRisk,
    workerRating: input.workerRating,
    consistencyScore: input.consistencyScore,
    claimTrend: input.claimTrend,
    weeklyIncome: input.weeklyIncome
  };

  const riskDetails = calculateRisk(driverData);
  const heuristicPremium = calculateDynamicPremium(driverData);

  const modelPrediction = predictPremiumWithModel({
    city: input.city,
    avgHours: input.activeHours,
    deliveries: input.deliveries,
    workerRating: input.workerRating,
    rainFrequency: input.rainFrequency,
    aqiLevel: input.aqiLevel,
    temperature: input.temperature,
    windSpeed: input.windSpeed,
    weatherCode: input.weatherCode,
    pm25: input.pm25,
    pm10: input.pm10,
    isDay: input.isDay
  });

  if (!modelPrediction || !Number.isFinite(modelPrediction.prediction)) {
    return null;
  }

  const blendWeight = clamp(safeNumber(modelPrediction.blendWeight, 0.55), 0.15, 0.85);
  const blendedPremiumValue =
    safeNumber(modelPrediction.prediction, heuristicPremium.premium) * blendWeight +
    heuristicPremium.premium * (1 - blendWeight);

  const premium = Math.round(clamp(blendedPremiumValue, 15, 200));
  const rawPremium = Number(blendedPremiumValue.toFixed(2));

  const trustDetails = calculateTrustScore({
    workerRating: input.workerRating,
    consistencyScore: input.consistencyScore,
    claimTrend: input.claimTrend
  });
  const trustDiscount = Number((trustDetails.trustScore * 5).toFixed(2));
  const forecastRiskAmount = Number((clamp(heuristicPremium.forecastRisk, 0, 1) * 10).toFixed(2));
  const riskFactorAmount = Number(
    (Math.max(0, rawPremium - BASE_PREMIUM - forecastRiskAmount + trustDiscount)).toFixed(2)
  );

  const coverageDetails = calculateDynamicCoverage({
    ...driverData,
    premium,
    rawPremium,
    totalRisk: heuristicPremium.totalRisk,
    forecastRisk: heuristicPremium.forecastRisk,
    trustScore: trustDetails.trustScore,
    normalized: heuristicPremium.normalized
  });

  return {
    input,
    normalized: heuristicPremium.normalized,
    weighted: heuristicPremium.weighted,
    ml: {
      source: 'local_premium_model',
      modelPath: require('../ml/premiumModel').MODEL_PATH,
      metrics: modelPrediction.metrics,
      trainedAt: modelPrediction.trainedAt,
      datasetSize: modelPrediction.datasetSize,
      blendWeight
    },
    heuristicPremium: heuristicPremium.premium,
    basePremium: BASE_PREMIUM,
    riskFactorAmount,
    forecastRiskAmount,
    trustDiscount,
    riskScore: Number(heuristicPremium.totalRisk.toFixed(2)),
    forecastRisk: Number(heuristicPremium.forecastRisk.toFixed(2)),
    trustScore: Number(trustDetails.trustScore.toFixed(2)),
    rawPremium,
    premium,
    rawCoverage: coverageDetails.rawCoverage,
    coverage: coverageDetails.coverage,
    coverageBounds: {
      floor: coverageDetails.dynamicFloor,
      ceiling: coverageDetails.dynamicCeiling
    },
    riskLevel: riskLabelForScore(riskDetails.totalRisk),
    explanation: explainPricing({
      premiumDetails: {
        ...heuristicPremium,
        premium,
        rawPremium
      },
      coverageDetails,
      mlPredictionUsed: true
    }),
    pricingFormula:
      'Weekly Premium = (Local ML premium prediction * blend) + (Node heuristic premium * (1 - blend))',
    coverageFormula:
      'Dynamic income protection sized from income, premium commitment, trust score, forecast risk, and total risk',
    environmentalInputsLocked: true
  };
}

async function calculatePremium(userData = {}) {
  const input = await buildRiskInput(userData);
  const environmental = deriveEnvironmentalInputs(input);
  const fastApiPayload = buildFastApiPayload(input, environmental);

  try {
    const mlPrediction = await fetchMlPredictions(fastApiPayload);
    return buildMlBackedResult(input, environmental, mlPrediction);
  } catch (error) {
    console.error('FastAPI ML prediction failed', error);
  }

  // Keep pricing available when FastAPI is down so quotes can still be generated from heuristic logic.
  const fallbackResult = await calculatePremiumFromHeuristics(userData);
  fallbackResult.ml = {
    ...(fallbackResult.ml || {}),
    source: 'heuristic_fallback'
  };
  return fallbackResult;
}

module.exports = {
  BASE_PRICE: BASE_PREMIUM,
  calculateCoverage,
  calculatePremium,
  buildRiskInput
};

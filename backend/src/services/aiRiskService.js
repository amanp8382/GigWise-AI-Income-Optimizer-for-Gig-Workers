const { fetchAQI, fetchWeather } = require('./weatherService');
const { cityProfiles, defaultCityProfile } = require('../ml/modelConfig');
const { clamp, safeNumber, buildFeatureState } = require('../ml/featureEngineering');
const {
  BASE_PREMIUM,
  calculateRisk,
  calculatePremium: calculateDynamicPremium,
  calculateCoverage: calculateDynamicCoverage
} = require('./premiumCalculator');

const riskLabelForScore = (riskScore) => {
  if (riskScore < 0.6) return 'Low';
  if (riskScore < 1.3) return 'Medium';
  return 'High';
};

function explainPricing({ premiumDetails, coverageDetails }) {
  const reasons = [];

  if (premiumDetails.normalized.weather >= 0.55) reasons.push('weather disruption risk');
  if (premiumDetails.normalized.aqi >= 0.45) reasons.push('pollution exposure');
  if (premiumDetails.normalized.traffic >= 0.5) reasons.push('traffic congestion');
  if (premiumDetails.normalized.area >= 0.5) reasons.push('area disruption risk');
  if (premiumDetails.normalized.activeHours >= 0.6) reasons.push('high active hours');
  if (premiumDetails.normalized.incidents >= 0.4) reasons.push('claim history');

  if (!reasons.length) {
    return `Premium is Rs${premiumDetails.premium} with coverage Rs${coverageDetails.coverage} under balanced risk conditions`;
  }

  return `${reasons.join(', ')} are driving premium and AI-sized coverage adjustments this week`;
}

function deriveEnvironmentalInputs(input) {
  const state = buildFeatureState(input);

  const rainfallNorm = clamp(input.rainfallNorm ?? state.rainFrequency, 0, 1);
  const heatIndexNorm = clamp(input.heatIndexNorm ?? state.thermalRisk, 0, 1);
  const extremeWeatherFlag =
    input.extremeWeatherFlag !== undefined
      ? clamp(safeNumber(input.extremeWeatherFlag, 0), 0, 1)
      : state.stormNorm > 0 ? 1 : state.rainFrequency >= 0.5 || state.thermalRisk >= 0.7 ? 1 : 0;
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

async function calculatePremium(userData = {}) {
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
    ml: null,
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
      coverageDetails
    }),
    pricingFormula: 'Weekly Premium = Base Price + Risk Factor + Forecast Risk - Trust Discount',
    coverageFormula: 'Dynamic income protection sized from income, premium commitment, trust score, forecast risk, and total risk',
    environmentalInputsLocked: true
  };
}

module.exports = {
  BASE_PRICE: BASE_PREMIUM,
  calculateCoverage,
  calculatePremium,
  buildRiskInput
};

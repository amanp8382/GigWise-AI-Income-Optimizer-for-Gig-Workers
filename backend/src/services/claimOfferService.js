const { fetchAQI, fetchWeather } = require('./weatherService');
const { clamp, safeNumber } = require('../ml/featureEngineering');

const CLAIM_TRIGGER_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const getLocationPayload = (user, location = {}) => ({
  city: location.city || user.city,
  latitude: location.latitude,
  longitude: location.longitude
});

const computeRainSeverity = (rain, weatherCode) => {
  const rainScore = clamp(safeNumber(rain, 0) / 8, 0, 1);
  const stormBonus = [95, 96, 99].includes(safeNumber(weatherCode, 0)) ? 0.2 : 0;
  return clamp(rainScore + stormBonus, 0, 1);
};

async function buildClaimOffer({ user, policy, location = {} }) {
  const resolvedLocation = getLocationPayload(user, location);
  const [weather, aqi] = await Promise.all([
    fetchWeather(resolvedLocation),
    fetchAQI(resolvedLocation)
  ]);

  const currentRain = safeNumber(weather?.current?.rain ?? weather?.hourly?.rain?.[0], 0);
  const weatherCode = safeNumber(
    weather?.current?.weather_code ?? weather?.hourly?.weather_code?.[0],
    0
  );
  const currentTemp = safeNumber(
    weather?.current?.temperature_2m ?? weather?.hourly?.temperature_2m?.[0],
    0
  );
  const aqiValue = safeNumber(aqi?.value, 0);
  const rainSeverity = computeRainSeverity(currentRain, weatherCode);
  const hoursScore = clamp(safeNumber(policy?.avgHours, 0) / 12, 0, 1);
  const deliveriesScore = clamp(safeNumber(policy?.deliveries, 0) / 35, 0, 1);
  const workloadScore = clamp(hoursScore * 0.45 + deliveriesScore * 0.55, 0, 1);
  const airStress = clamp(aqiValue / 220, 0, 1);
  const heatStress = clamp((currentTemp - 30) / 12, 0, 1);
  const weatherStress = clamp(rainSeverity * 0.65 + airStress * 0.2 + heatStress * 0.15, 0, 1);
  const payoutRatio = clamp(0.24 + workloadScore * 0.18 + weatherStress * 0.28, 0.22, 0.75);
  const suggestedAmount =
    currentRain > 0
      ? Math.round(
          clamp(safeNumber(policy?.coverage, 0) * payoutRatio, 250, safeNumber(policy?.coverage, 0))
        )
      : 0;

  return {
    eligible: currentRain > 0,
    triggerType: 'RAIN',
    suggestedAmount,
    currentRain,
    currentTemp,
    aqiValue,
    workloadScore: Number(workloadScore.toFixed(3)),
    weatherStress: Number(weatherStress.toFixed(3)),
    weather,
    aqi,
    resolvedLocation: weather?.resolvedLocation || aqi?.resolvedLocation || resolvedLocation,
    explanation:
      currentRain > 0
        ? `Rain detected. Claim amount increased using live rain plus your work intensity of ${safeNumber(
            policy?.avgHours,
            0
          ).toFixed(0)} hours and ${safeNumber(policy?.deliveries, 0).toFixed(0)} orders.`
        : 'No rain detected in the worker area right now.'
  };
}

module.exports = {
  CLAIM_TRIGGER_COOLDOWN_MS,
  buildClaimOffer
};

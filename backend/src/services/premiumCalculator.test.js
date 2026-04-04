const assert = require('assert');
const {
  calculateRisk,
  calculatePremium,
  calculateCoverage,
  normalizeFiveStarRating,
  normalizeAqi,
  normalizeHours
} = require('./premiumCalculator');

assert.strictEqual(normalizeFiveStarRating(5), 1, '5-star rating should normalize to 1');
assert.strictEqual(normalizeAqi(250), 0.5, 'AQI should normalize on a 0-500 scale');
assert.strictEqual(normalizeHours(6), 0.5, '6 hours should normalize on a 0-12 scale');

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
  deliveries: 20,
  incidents: 1,
  forecastRisk: 0.35,
  workerRating: 4.6,
  consistencyScore: 0.82,
  claimTrend: 0.9,
  weeklyIncome: 4200
};

const risk = calculateRisk(driverData);
assert.strictEqual(risk.totalRisk, 1.558, 'total risk should match the formula');
assert.strictEqual(risk.environmentalRisk, 0.608, 'environmental risk should be weighted correctly');
assert.strictEqual(risk.forecastRisk, 0.35, 'forecast risk should normalize to the supplied probability');

const premium = calculatePremium(driverData);
assert.strictEqual(premium.premium, 27, 'premium should follow the current weekly pricing formula');
assert.strictEqual(premium.rawPremium, 26.87, 'raw premium should be exposed for debugging');
assert.strictEqual(premium.trustScore, 0.884, 'trust score should match weighted normalized behavior');
assert.strictEqual(premium.riskFactorAmount, 7.79, 'risk factor should be converted into a rupee add-on');
assert.strictEqual(premium.forecastRiskAmount, 3.5, 'forecast risk should be converted into a rupee add-on');
assert.strictEqual(premium.trustDiscount, 4.42, 'trust should reduce premium as a rupee discount');

const coverage = calculateCoverage({
  ...driverData,
  ...premium
});
assert.strictEqual(coverage.coverage, 1256, 'coverage should size dynamically within the new monthly protection range');
assert.strictEqual(coverage.rawCoverage, 1255.51, 'raw coverage should expose the unclamped dynamic formula output');
assert.strictEqual(coverage.dynamicFloor, 1000, 'coverage floor should remain at the new minimum range');
assert.strictEqual(coverage.dynamicCeiling, 1500, 'coverage ceiling should remain at the new maximum range');

const clampedHighPremium = calculatePremium({
  city: 'Delhi',
  rainfallNorm: 1,
  heatIndexNorm: 1,
  extremeWeatherFlag: 1,
  aqiLevel: 500,
  congestionIndex: 1,
  crimeRate: 1,
  accidentRate: 1,
  disruptionRate: 1,
  activeHours: 12,
  incidents: 5,
  forecastRisk: 1,
  workerRating: 0,
  consistencyScore: 0,
  claimTrend: 0,
  weeklyIncome: 7000
});

assert.strictEqual(clampedHighPremium.premium, 45, 'premium should clamp within the new weekly range');

const clampedCoverage = calculateCoverage({
  city: 'Delhi',
  weeklyIncome: 10000,
  activeHours: 12,
  deliveries: 40,
  premium: 35,
  totalRisk: 0,
  trustScore: 1,
  forecastRisk: 1,
  normalized: { weather: 1 }
});

assert.strictEqual(clampedCoverage.coverage, 1500, 'coverage should clamp to the new dynamic maximum');

console.log('premium calculator tests passed');

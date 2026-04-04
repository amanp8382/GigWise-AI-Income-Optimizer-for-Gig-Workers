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
assert.strictEqual(premium.premium, 50, 'premium should follow the pricing formula');
assert.strictEqual(premium.rawPremium, 40.06, 'raw premium should be exposed for debugging');
assert.strictEqual(premium.trustScore, 0.884, 'trust score should match weighted normalized behavior');

const coverage = calculateCoverage({
  ...driverData,
  ...premium
});
assert.strictEqual(coverage.coverage, 7125, 'coverage should size dynamically from income and risk context');
assert.strictEqual(coverage.dynamicFloor, 1340, 'coverage floor should adapt to income and trust');
assert.strictEqual(coverage.dynamicCeiling, 11602, 'coverage ceiling should expand dynamically');

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

assert.strictEqual(clampedHighPremium.premium, 200, 'premium should clamp to maximum 200');

const clampedCoverage = calculateCoverage({
  city: 'Delhi',
  weeklyIncome: 10000,
  premium: 200,
  totalRisk: 0,
  trustScore: 1,
  forecastRisk: 1
});

assert.strictEqual(clampedCoverage.coverage, 20000, 'coverage should scale to the new dynamic maximum');

console.log('premium calculator tests passed');

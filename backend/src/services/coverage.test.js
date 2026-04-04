const assert = require('assert');
const { calculateCoverage } = require('./aiRiskService');

const legacyCases = [
  {
    name: 'legacy numeric inputs map into the dynamic coverage formula',
    input: [8, 20, 0.5, 1.1],
    expected: 1176
  },
  {
    name: 'higher workload and income produce a larger protected amount',
    input: [14, 45, 0.1, 12],
    expected: 1235
  },
  {
    name: 'invalid numeric inputs still return the floor-backed dynamic coverage',
    input: [-4, -10, 1.4, -2],
    expected: 1111
  }
];

for (const testCase of legacyCases) {
  const actual = calculateCoverage(...testCase.input);
  assert.strictEqual(actual, testCase.expected, testCase.name);
}

const objectResult = calculateCoverage({
  city: 'Mumbai',
  weeklyIncome: 4200,
  activeHours: 9,
  deliveries: 20,
  premium: 27,
  totalRisk: 1.558,
  trustScore: 0.884,
  forecastRisk: 0.35,
  normalized: { weather: 0.73 }
});

assert.deepStrictEqual(
  objectResult,
  {
    weeklyIncome: 4200,
    rawCoverage: 1255.51,
    coverage: 1256,
    trustScore: 0.884,
    totalRisk: 1.558,
    dynamicFloor: 1000,
    dynamicCeiling: 1500
  },
  'object inputs should use the exact dynamic coverage formula output'
);

console.log(`coverage tests passed: ${legacyCases.length + 1}`);

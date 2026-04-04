const assert = require('assert');
const { calculateCoverage } = require('./aiRiskService');

const cases = [
  {
    name: 'medium risk example clamps to minimum coverage',
    input: [8, 20, 0.5, 1.1],
    expected: 1500
  },
  {
    name: 'low risk gets the higher multiplier',
    input: [10, 25, 0.2, 8],
    expected: 2400
  },
  {
    name: 'high risk reduces coverage',
    input: [10, 25, 0.9, 8],
    expected: 1600
  },
  {
    name: 'very large values clamp to maximum coverage',
    input: [14, 45, 0.1, 12],
    expected: 4000
  },
  {
    name: 'negative inputs are treated as zero and clamp to minimum',
    input: [-4, -10, 1.4, -2],
    expected: 1500
  }
];

for (const testCase of cases) {
  const actual = calculateCoverage(...testCase.input);
  assert.strictEqual(actual, testCase.expected, testCase.name);
}

console.log(`coverage tests passed: ${cases.length}`);

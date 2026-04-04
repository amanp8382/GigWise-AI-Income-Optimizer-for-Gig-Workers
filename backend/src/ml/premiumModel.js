const fs = require('fs');
const path = require('path');
const { buildFeatureVector } = require('./featureEngineering');

const MODEL_PATH = path.join(__dirname, 'premiumModel.json');

let cachedModel = null;

function loadPremiumModel() {
  if (cachedModel) return cachedModel;
  if (!fs.existsSync(MODEL_PATH)) return null;

  cachedModel = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  return cachedModel;
}

function predictPremiumWithModel(input) {
  const model = loadPremiumModel();
  if (!model) return null;

  const { featureMap } = buildFeatureVector(input);
  const vector = model.featureNames.map((featureName) => {
    const scaling = model.scaling[featureName] || { mean: 0, std: 1 };
    return ((featureMap[featureName] || 0) - scaling.mean) / scaling.std;
  });

  let prediction = 0;

  if (model.modelType === 'knn' && Array.isArray(model.examples) && model.examples.length) {
    const k = Number(model.k || 7);
    const distancePower = Number(model.distancePower || 2);
    const nearest = model.examples
      .map((example) => {
        const distance = Math.sqrt(
          example.vector.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0)
        );

        return {
          distance,
          premium: Number(example.premium || 0)
        };
      })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, k);

    const weighted = nearest.reduce(
      (accumulator, example) => {
        const weight = 1 / ((example.distance || 0.001) ** distancePower);
        accumulator.totalWeight += weight;
        accumulator.totalValue += example.premium * weight;
        return accumulator;
      },
      { totalWeight: 0, totalValue: 0 }
    );

    prediction = weighted.totalValue / (weighted.totalWeight || 1);
  } else {
    prediction = Number(model.bias || 0);

    model.featureNames.forEach((_, index) => {
      prediction += vector[index] * Number(model.weights[index] || 0);
    });
  }

  return {
    prediction,
    blendWeight: Number(model.blendWeight || 0.55),
    metrics: model.metrics,
    trainedAt: model.trainedAt,
    datasetSize: model.datasetSize
  };
}

function clearPremiumModelCache() {
  cachedModel = null;
}

module.exports = {
  MODEL_PATH,
  loadPremiumModel,
  predictPremiumWithModel,
  clearPremiumModelCache
};

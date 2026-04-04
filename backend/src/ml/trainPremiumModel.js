const fs = require('fs');
const path = require('path');
const {
  buildFeatureVector,
  buildFeatureState,
  clamp
} = require('./featureEngineering');

const DATASET_PATH = path.join(__dirname, 'trainingData.json');
const MODEL_PATH = path.join(__dirname, 'premiumModel.json');
const BASE_PRICE = 50;

function defaultTrainingData() {
  return [
    { city: 'Mumbai', avgHours: 8, deliveries: 20, rainFrequency: 0.45, aqiLevel: 122, temperature: 31, windSpeed: 18, pm25: 38, pm10: 71, workerRating: 4.7, premium: 78 },
    { city: 'Mumbai', avgHours: 11, deliveries: 33, rainFrequency: 0.82, aqiLevel: 135, temperature: 30, windSpeed: 24, pm25: 44, pm10: 85, workerRating: 4.2, premium: 99 },
    { city: 'Delhi', avgHours: 10, deliveries: 24, rainFrequency: 0.06, aqiLevel: 245, temperature: 39, windSpeed: 14, pm25: 94, pm10: 152, workerRating: 4.3, premium: 97 },
    { city: 'Delhi', avgHours: 12, deliveries: 36, rainFrequency: 0.08, aqiLevel: 310, temperature: 42, windSpeed: 16, pm25: 118, pm10: 194, workerRating: 3.7, premium: 118 },
    { city: 'Bangalore', avgHours: 7, deliveries: 16, rainFrequency: 0.21, aqiLevel: 76, temperature: 27, windSpeed: 11, pm25: 26, pm10: 45, workerRating: 4.8, premium: 69 },
    { city: 'Bangalore', avgHours: 11, deliveries: 34, rainFrequency: 0.34, aqiLevel: 84, temperature: 28, windSpeed: 13, pm25: 29, pm10: 48, workerRating: 4.1, premium: 84 },
    { city: 'Hyderabad', avgHours: 8, deliveries: 19, rainFrequency: 0.14, aqiLevel: 105, temperature: 34, windSpeed: 15, pm25: 34, pm10: 62, workerRating: 4.6, premium: 74 },
    { city: 'Hyderabad', avgHours: 12, deliveries: 35, rainFrequency: 0.22, aqiLevel: 148, temperature: 40, windSpeed: 18, pm25: 52, pm10: 88, workerRating: 4.0, premium: 92 },
    { city: 'Chennai', avgHours: 9, deliveries: 22, rainFrequency: 0.36, aqiLevel: 93, temperature: 35, windSpeed: 20, pm25: 28, pm10: 55, workerRating: 4.5, premium: 78 },
    { city: 'Chennai', avgHours: 11, deliveries: 31, rainFrequency: 0.63, aqiLevel: 126, temperature: 36, windSpeed: 23, pm25: 39, pm10: 73, workerRating: 4.0, premium: 97 },
    { city: 'Kolkata', avgHours: 8, deliveries: 18, rainFrequency: 0.42, aqiLevel: 132, temperature: 32, windSpeed: 17, pm25: 43, pm10: 79, workerRating: 4.4, premium: 80 },
    { city: 'Kolkata', avgHours: 12, deliveries: 32, rainFrequency: 0.57, aqiLevel: 176, temperature: 35, windSpeed: 20, pm25: 58, pm10: 106, workerRating: 3.9, premium: 101 },
    { city: 'Mumbai', avgHours: 6, deliveries: 12, rainFrequency: 0.18, aqiLevel: 98, temperature: 29, windSpeed: 14, pm25: 31, pm10: 58, workerRating: 4.9, premium: 65 },
    { city: 'Delhi', avgHours: 7, deliveries: 15, rainFrequency: 0.03, aqiLevel: 185, temperature: 34, windSpeed: 12, pm25: 66, pm10: 114, workerRating: 4.9, premium: 76 },
    { city: 'Bangalore', avgHours: 13, deliveries: 39, rainFrequency: 0.28, aqiLevel: 89, temperature: 29, windSpeed: 15, pm25: 31, pm10: 51, workerRating: 3.8, premium: 90 },
    { city: 'Hyderabad', avgHours: 10, deliveries: 28, rainFrequency: 0.11, aqiLevel: 118, temperature: 37, windSpeed: 16, pm25: 39, pm10: 71, workerRating: 4.2, premium: 83 },
    { city: 'Chennai', avgHours: 13, deliveries: 37, rainFrequency: 0.52, aqiLevel: 112, temperature: 38, windSpeed: 24, pm25: 37, pm10: 69, workerRating: 3.8, premium: 103 },
    { city: 'Kolkata', avgHours: 10, deliveries: 27, rainFrequency: 0.48, aqiLevel: 144, temperature: 33, windSpeed: 18, pm25: 47, pm10: 86, workerRating: 4.1, premium: 88 },
    { city: 'Mumbai', avgHours: 12, deliveries: 38, rainFrequency: 0.88, aqiLevel: 152, temperature: 32, windSpeed: 27, pm25: 53, pm10: 94, workerRating: 3.6, premium: 119 },
    { city: 'Delhi', avgHours: 11, deliveries: 31, rainFrequency: 0.04, aqiLevel: 278, temperature: 44, windSpeed: 17, pm25: 109, pm10: 182, workerRating: 3.9, premium: 112 },
    { city: 'Bangalore', avgHours: 9, deliveries: 21, rainFrequency: 0.26, aqiLevel: 68, temperature: 26, windSpeed: 10, pm25: 22, pm10: 39, workerRating: 4.7, premium: 71 },
    { city: 'Hyderabad', avgHours: 6, deliveries: 13, rainFrequency: 0.08, aqiLevel: 92, temperature: 33, windSpeed: 13, pm25: 29, pm10: 54, workerRating: 4.8, premium: 66 },
    { city: 'Chennai', avgHours: 8, deliveries: 17, rainFrequency: 0.29, aqiLevel: 88, temperature: 34, windSpeed: 19, pm25: 27, pm10: 50, workerRating: 4.6, premium: 73 },
    { city: 'Kolkata', avgHours: 13, deliveries: 40, rainFrequency: 0.68, aqiLevel: 188, temperature: 36, windSpeed: 22, pm25: 64, pm10: 117, workerRating: 3.7, premium: 109 }
  ];
}

function loadDataset() {
  if (!fs.existsSync(DATASET_PATH)) {
    const fallback = defaultTrainingData();
    fs.writeFileSync(DATASET_PATH, JSON.stringify(fallback, null, 2));
    return fallback;
  }

  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  if (!Array.isArray(raw) || raw.length < 8) {
    throw new Error('trainingData.json must be an array with at least 8 rows');
  }

  return raw;
}

function createRng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let temp = state;
    temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rng, amount) {
  return (rng() * 2 - 1) * amount;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function shuffle(rows, seed = 1234) {
  const rng = createRng(seed);
  const cloned = rows.slice();

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }

  return cloned;
}

function clipValue(value, min, max, digits = 3) {
  return Number(clamp(value, min, max).toFixed(digits));
}

function inferWeatherCode(rainFrequency, rng) {
  if (rainFrequency >= 0.85) return 95;
  if (rainFrequency >= 0.7) return rng() > 0.5 ? 82 : 81;
  if (rainFrequency >= 0.45) return rng() > 0.5 ? 63 : 61;
  if (rainFrequency >= 0.2) return 53;
  return 1;
}

function seededPremiumLookup(seedRows) {
  return seedRows.reduce((accumulator, row) => {
    const cityKey = String(row.city || '').toLowerCase();
    accumulator[cityKey] = accumulator[cityKey] || [];
    accumulator[cityKey].push(row);
    return accumulator;
  }, {});
}

function nearestSeedPremium(row, cityRows) {
  if (!cityRows?.length) return 85;

  const scored = cityRows
    .map((candidate) => {
      const distance =
        ((row.avgHours - candidate.avgHours) / 5) ** 2 +
        ((row.deliveries - candidate.deliveries) / 18) ** 2 +
        ((row.rainFrequency - candidate.rainFrequency) / 0.4) ** 2 +
        ((row.aqiLevel - candidate.aqiLevel) / 120) ** 2 +
        ((row.temperature - candidate.temperature) / 10) ** 2 +
        ((row.workerRating - candidate.workerRating) / 1) ** 2;

      return {
        premium: Number(candidate.premium),
        weight: 1 / (Math.sqrt(distance) + 0.2)
      };
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3);

  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0) || 1;
  return scored.reduce((sum, item) => sum + item.premium * item.weight, 0) / totalWeight;
}

function estimateReferencePremium(row, lookup) {
  const state = buildFeatureState(row);
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
  const riskScore = clamp(
    rainRisk * 0.21 +
      pollutionRisk * 0.21 +
      state.thermalRisk * 0.13 +
      fatigueRisk * 0.17 +
      locationRisk * 0.18 +
      state.ratingRiskNorm * 0.1
  );
  const heuristicPremium = BASE_PRICE * (1 + riskScore * 1.42 + interactionRisk * 0.72);
  const cityAnchor = nearestSeedPremium(row, lookup[state.city]);
  const demandAdjustment = state.deliveriesNorm * 10 + state.avgHoursNorm * 8;
  const stabilityAdjustment = -state.ratingRiskNorm * 6 + state.daytimeExposureNorm * 2;

  return Math.round(
    clamp(heuristicPremium * 0.56 + cityAnchor * 0.44 + demandAdjustment + stabilityAdjustment, 55, 230)
  );
}

function buildSyntheticDataset(seedRows, options = {}) {
  const rng = createRng(options.seed || 2026);
  const seedLookup = seededPremiumLookup(seedRows);
  const variantsPerSeed = options.variantsPerSeed || 18;
  const scenarioRowsPerCity = options.scenarioRowsPerCity || 24;
  const syntheticRows = [];

  for (const row of seedRows) {
    for (let variant = 0; variant < variantsPerSeed; variant += 1) {
      const rainFrequency = clipValue(row.rainFrequency + jitter(rng, 0.14), 0, 1);
      const avgHours = clipValue(row.avgHours + jitter(rng, 1.6), 4, 14, 2);
      const deliveries = Math.round(clamp(row.deliveries + jitter(rng, 7), 8, 45));
      const aqiLevel = Math.round(clamp(row.aqiLevel + jitter(rng, 42), 45, 360));
      const temperature = clipValue(row.temperature + jitter(rng, 4.5), 22, 46, 2);
      const windSpeed = clipValue(row.windSpeed + jitter(rng, 5.5), 5, 42, 2);
      const pm25 = clipValue(row.pm25 + jitter(rng, 16), 10, 180, 2);
      const pm10 = clipValue(row.pm10 + jitter(rng, 22), 20, 260, 2);
      const workerRating = clipValue(row.workerRating + jitter(rng, 0.45), 3.2, 5, 2);
      const weatherCode = inferWeatherCode(rainFrequency, rng);
      const isDay = rng() > 0.24 ? 1 : 0;

      const candidate = {
        city: row.city,
        avgHours,
        deliveries,
        rainFrequency,
        aqiLevel,
        temperature,
        windSpeed,
        pm25,
        pm10,
        workerRating,
        weatherCode,
        isDay
      };

      candidate.premium = estimateReferencePremium(candidate, seedLookup);
      syntheticRows.push(candidate);
    }
  }

  for (const [city, cityRows] of Object.entries(seedLookup)) {
    const avgPremium = average(cityRows.map((row) => Number(row.premium)));
    const avgAqi = average(cityRows.map((row) => Number(row.aqiLevel)));
    const avgRain = average(cityRows.map((row) => Number(row.rainFrequency)));
    const avgTemp = average(cityRows.map((row) => Number(row.temperature)));

    for (let index = 0; index < scenarioRowsPerCity; index += 1) {
      const rainFrequency = clipValue(avgRain + rng() * 0.7, 0, 1);
      const avgHours = clipValue(6 + rng() * 8, 4, 14, 2);
      const deliveries = Math.round(12 + rng() * 33);
      const aqiLevel = Math.round(clamp(avgAqi + jitter(rng, 85), 45, 360));
      const temperature = clipValue(avgTemp + jitter(rng, 6.5), 22, 46, 2);
      const windSpeed = clipValue(8 + rng() * 24, 5, 42, 2);
      const pm25 = clipValue(aqiLevel / 3 + jitter(rng, 10), 10, 180, 2);
      const pm10 = clipValue(aqiLevel / 2 + jitter(rng, 16), 20, 260, 2);
      const workerRating = clipValue(3.4 + rng() * 1.5, 3.2, 5, 2);
      const weatherCode = inferWeatherCode(rainFrequency, rng);
      const isDay = rng() > 0.3 ? 1 : 0;

      const candidate = {
        city,
        avgHours,
        deliveries,
        rainFrequency,
        aqiLevel,
        temperature,
        windSpeed,
        pm25,
        pm10,
        workerRating,
        weatherCode,
        isDay
      };

      const anchoredPremium = estimateReferencePremium(candidate, seedLookup);
      candidate.premium = Math.round(clamp(anchoredPremium * 0.85 + avgPremium * 0.15, 55, 230));
      syntheticRows.push(candidate);
    }
  }

  return syntheticRows;
}

function prepareExamples(rows) {
  const prepared = rows.map((row) => {
    const { featureMap } = buildFeatureVector(row);
    return {
      premium: Number(row.premium),
      featureMap
    };
  });

  const featureNames = Object.keys(prepared[0].featureMap).filter((name) => name !== 'bias_proxy');
  return { prepared, featureNames };
}

function computeScaling(rows, featureNames) {
  const stats = {};

  for (const featureName of featureNames) {
    const values = rows.map((row) => row.featureMap[featureName] || 0);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1);
    stats[featureName] = {
      mean,
      std: Math.sqrt(variance) || 1
    };
  }

  return stats;
}

function vectorize(row, featureNames, scaling) {
  return featureNames.map((featureName) => {
    const stat = scaling[featureName];
    return ((row.featureMap[featureName] || 0) - stat.mean) / stat.std;
  });
}

function predictLinear(vector, weights, bias) {
  let result = bias;
  for (let index = 0; index < vector.length; index += 1) {
    result += vector[index] * weights[index];
  }
  return result;
}

function trainLinearModel(trainRows, featureNames, scaling, config = {}) {
  const learningRate = config.learningRate || 0.02;
  const epochs = config.epochs || 4000;
  const l2 = config.l2 || 0.001;
  const weights = new Array(featureNames.length).fill(0);
  let bias = average(trainRows.map((row) => row.premium));

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradients = new Array(featureNames.length).fill(0);
    let biasGradient = 0;

    for (const row of trainRows) {
      const vector = vectorize(row, featureNames, scaling);
      const prediction = predictLinear(vector, weights, bias);
      const error = prediction - row.premium;

      for (let index = 0; index < vector.length; index += 1) {
        gradients[index] += (error * vector[index]) / trainRows.length;
      }
      biasGradient += error / trainRows.length;
    }

    for (let index = 0; index < weights.length; index += 1) {
      weights[index] -= learningRate * (gradients[index] + l2 * weights[index]);
    }
    bias -= learningRate * biasGradient;
  }

  return { modelType: 'linear', weights, bias };
}

function predictKnn(vector, examples, k, distancePower = 2) {
  const nearest = examples
    .map((example) => {
      const distance = Math.sqrt(
        example.vector.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0)
      );

      return {
        distance,
        premium: example.premium
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, k);

  const weighted = nearest.reduce(
    (accumulator, item) => {
      const weight = 1 / ((item.distance || 0.001) ** distancePower);
      accumulator.totalWeight += weight;
      accumulator.totalValue += item.premium * weight;
      return accumulator;
    },
    { totalWeight: 0, totalValue: 0 }
  );

  return weighted.totalValue / (weighted.totalWeight || 1);
}

function trainKnnModel(trainRows, featureNames, scaling, config = {}) {
  return {
    modelType: 'knn',
    k: config.k || 7,
    distancePower: config.distancePower || 2,
    examples: trainRows.map((row) => ({
      vector: vectorize(row, featureNames, scaling),
      premium: row.premium
    }))
  };
}

function predictPreparedRow(row, featureNames, scaling, model) {
  const vector = vectorize(row, featureNames, scaling);

  if (model.modelType === 'knn') {
    return predictKnn(vector, model.examples, model.k, model.distancePower);
  }

  return predictLinear(vector, model.weights, model.bias);
}

function evaluate(rows, featureNames, scaling, model) {
  const predictions = rows.map((row) => {
    const prediction = predictPreparedRow(row, featureNames, scaling, model);
    return {
      actual: row.premium,
      prediction
    };
  });

  const mae =
    predictions.reduce((sum, row) => sum + Math.abs(row.actual - row.prediction), 0) /
    predictions.length;
  const rmse = Math.sqrt(
    predictions.reduce((sum, row) => sum + (row.actual - row.prediction) ** 2, 0) /
      predictions.length
  );
  const meanActual = predictions.reduce((sum, row) => sum + row.actual, 0) / predictions.length;
  const totalVariance =
    predictions.reduce((sum, row) => sum + (row.actual - meanActual) ** 2, 0) || 1;
  const residualVariance = predictions.reduce(
    (sum, row) => sum + (row.actual - row.prediction) ** 2,
    0
  );
  const r2 = 1 - residualVariance / totalVariance;

  return {
    mae: Number(mae.toFixed(3)),
    rmse: Number(rmse.toFixed(3)),
    r2: Number(r2.toFixed(3))
  };
}

function averageMetrics(metrics) {
  return {
    mae: Number(average(metrics.map((metric) => metric.mae)).toFixed(3)),
    rmse: Number(average(metrics.map((metric) => metric.rmse)).toFixed(3)),
    r2: Number(average(metrics.map((metric) => metric.r2)).toFixed(3))
  };
}

function buildFoldSets(rows, folds = 6) {
  const shuffled = shuffle(rows, 17);
  const sets = Array.from({ length: folds }, () => []);

  shuffled.forEach((row, index) => {
    sets[index % folds].push(row);
  });

  return sets.filter((set) => set.length);
}

function trainFromRows(trainRows, candidate) {
  const syntheticRows = candidate.useSyntheticData
    ? buildSyntheticDataset(trainRows, {
        seed: candidate.seed,
        variantsPerSeed: candidate.variantsPerSeed,
        scenarioRowsPerCity: candidate.scenarioRowsPerCity
      })
    : [];
  const trainingRows = trainRows.concat(syntheticRows);
  const { prepared, featureNames } = prepareExamples(trainingRows);
  const scaling = computeScaling(prepared, featureNames);

  const model =
    candidate.modelType === 'knn'
      ? trainKnnModel(prepared, featureNames, scaling, candidate)
      : trainLinearModel(prepared, featureNames, scaling, candidate);

  return {
    trainingRows,
    syntheticRows,
    prepared,
    featureNames,
    scaling,
    model
  };
}

function crossValidateCandidates(seedRows, candidates) {
  const folds = buildFoldSets(seedRows);

  return candidates
    .map((candidate) => {
      const foldMetrics = folds.map((validationRows, foldIndex) => {
        const trainRows = folds
          .filter((_, index) => index !== foldIndex)
          .flat();
        const trained = trainFromRows(trainRows, candidate);
        const { prepared: validationPrepared } = prepareExamples(validationRows);
        return evaluate(
          validationPrepared,
          trained.featureNames,
          trained.scaling,
          trained.model
        );
      });

      return {
        candidate,
        metrics: averageMetrics(foldMetrics)
      };
    })
    .sort((left, right) => {
      if (left.metrics.rmse !== right.metrics.rmse) return left.metrics.rmse - right.metrics.rmse;
      if (left.metrics.mae !== right.metrics.mae) return left.metrics.mae - right.metrics.mae;
      return right.metrics.r2 - left.metrics.r2;
    });
}

function chooseBlendWeight(validationMetrics) {
  const accuracySignal = clamp(validationMetrics.r2, 0, 1);
  const errorPenalty = clamp(validationMetrics.rmse / 12, 0, 0.35);
  return Number(clamp(0.32 + accuracySignal * 0.38 - errorPenalty, 0.3, 0.68).toFixed(2));
}

function saveModel({
  featureNames,
  scaling,
  model,
  metrics,
  datasetSize,
  seedDatasetSize,
  augmentedDatasetSize,
  blendWeight
}) {
  const artifact = {
    version: 2,
    trainedAt: new Date().toISOString(),
    datasetSize,
    seedDatasetSize,
    augmentedDatasetSize,
    modelType: model.modelType,
    featureNames,
    scaling,
    metrics,
    blendWeight
  };

  if (model.modelType === 'knn') {
    artifact.k = model.k;
    artifact.distancePower = model.distancePower;
    artifact.examples = model.examples;
  } else {
    artifact.bias = model.bias;
    artifact.weights = model.weights;
  }

  fs.writeFileSync(MODEL_PATH, JSON.stringify(artifact, null, 2));
  return artifact;
}

function main() {
  const seedRows = loadDataset();
  const candidates = [
    { modelType: 'linear', learningRate: 0.03, epochs: 3500, l2: 0.0008, useSyntheticData: false, seed: 101 },
    { modelType: 'linear', learningRate: 0.02, epochs: 5000, l2: 0.0015, useSyntheticData: false, seed: 202 },
    { modelType: 'linear', learningRate: 0.018, epochs: 6500, l2: 0.0025, useSyntheticData: false, seed: 303 },
    { modelType: 'knn', k: 5, distancePower: 2, useSyntheticData: false, seed: 404 },
    { modelType: 'knn', k: 7, distancePower: 2, useSyntheticData: false, seed: 505 },
    { modelType: 'linear', learningRate: 0.024, epochs: 4800, l2: 0.001, variantsPerSeed: 8, scenarioRowsPerCity: 8, useSyntheticData: true, seed: 606 }
  ];

  const rankedCandidates = crossValidateCandidates(seedRows, candidates);
  const best = rankedCandidates[0];
  const trained = trainFromRows(seedRows, best.candidate);
  const { prepared: seedPrepared } = prepareExamples(seedRows);
  const trainMetrics = evaluate(
    trained.prepared,
    trained.featureNames,
    trained.scaling,
    trained.model
  );
  const seedFitMetrics = evaluate(
    seedPrepared,
    trained.featureNames,
    trained.scaling,
    trained.model
  );
  const blendWeight = chooseBlendWeight(best.metrics);

  const artifact = saveModel({
    featureNames: trained.featureNames,
    scaling: trained.scaling,
    model: trained.model,
    metrics: {
      train: trainMetrics,
      test: best.metrics,
      seedFit: seedFitMetrics
    },
    datasetSize: trained.trainingRows.length,
    seedDatasetSize: seedRows.length,
    augmentedDatasetSize: trained.syntheticRows.length,
    blendWeight
  });

  console.log(
    JSON.stringify(
      {
        savedTo: MODEL_PATH,
        datasetSize: artifact.datasetSize,
        seedDatasetSize: artifact.seedDatasetSize,
        augmentedDatasetSize: artifact.augmentedDatasetSize,
        modelType: artifact.modelType,
        metrics: artifact.metrics,
        blendWeight: artifact.blendWeight,
        selectedCandidate: best.candidate
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  loadDataset,
  buildSyntheticDataset,
  prepareExamples,
  computeScaling,
  trainLinearModel,
  trainKnnModel,
  evaluate,
  crossValidateCandidates
};

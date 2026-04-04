const router = require('express').Router();
const { calculatePremium } = require('../services/aiRiskService');

router.post('/', async (req, res) => {
  try {
    const {
      city,
      avgHours,
      deliveries,
      workerRating,
      incomeFactor,
      incidents,
      vehicleCondition,
      consistencyScore,
      claimTrend,
      traffic,
      areaRisk,
      ordersPerDay
    } = req.body;

    if (!city) return res.status(400).json({ error: 'city is required' });

    const result = await calculatePremium({
      city,
      avgHours,
      deliveries,
      workerRating,
      incomeFactor,
      incidents,
      vehicleCondition,
      consistencyScore,
      claimTrend,
      traffic,
      areaRisk,
      ordersPerDay
    });

    res.json({
      riskScore: result.riskScore,
      adjustmentScore: result.adjustmentScore,
      premium: result.premium,
      rawPremium: result.rawPremium,
      basePremium: result.basePremium,
      riskMultiplier: result.riskMultiplier,
      adjustmentMultiplier: result.adjustmentMultiplier,
      coverage: result.coverage,
      riskLevel: result.riskLevel,
      explanation: result.explanation,
      weighted: result.weighted,
      normalized: result.normalized,
      ml: result.ml,
      heuristicPremium: result.heuristicPremium,
      environmentalInputsLocked: true,
      inputs: result.input
    });
  } catch (err) {
    console.error('Predict premium error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

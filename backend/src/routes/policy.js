const router = require('express').Router();
const { calculatePremium } = require('../services/aiRiskService');
const {
  createPolicy,
  deactivateActivePolicies,
  findUserById
} = require('../store/dataStore');

router.post('/', async (req, res) => {
  try {
    const {
      userId,
      plan,
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
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (city && user.city.toLowerCase() !== city.toLowerCase()) {
      return res.status(400).json({ error: 'Location mismatch: policy rejected' });
    }

    const prediction = await calculatePremium({
      city: city || user.city,
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

    // deactivate existing active policies
    await deactivateActivePolicies(userId);

    const policy = await createPolicy({
      userId,
      city: city || user.city,
      premium: prediction.premium,
      coverage: prediction.coverage,
      avgHours: Number(avgHours) || 0,
      deliveries: Number(deliveries || ordersPerDay) || 0,
      workerRating: Number(workerRating) || 0,
      riskScore: prediction.riskScore,
      forecastRisk: prediction.forecastRisk,
      billingCycle: 'WEEKLY',
      active: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return res.json({
      policy,
      pricing: {
        premium: prediction.premium,
        rawPremium: prediction.rawPremium,
        basePremium: prediction.basePremium,
        riskFactorAmount: prediction.riskFactorAmount,
        forecastRiskAmount: prediction.forecastRiskAmount,
        trustDiscount: prediction.trustDiscount,
        riskScore: prediction.riskScore,
        forecastRisk: prediction.forecastRisk,
        trustScore: prediction.trustScore,
        coverage: prediction.coverage,
        rawCoverage: prediction.rawCoverage,
        coverageBounds: prediction.coverageBounds,
        riskLevel: prediction.riskLevel,
        explanation: prediction.explanation,
        pricingFormula: prediction.pricingFormula,
        coverageFormula: prediction.coverageFormula,
        inputs: prediction.input,
        normalized: prediction.normalized,
        weighted: prediction.weighted,
        ml: prediction.ml,
        heuristicPremium: prediction.heuristicPremium,
        environmentalInputsLocked: true,
        selectedPlan: plan || null
      }
    });
  } catch (err) {
    console.error('Policy create error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

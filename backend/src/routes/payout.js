const router = require('express').Router();
const {
  createClaim,
  findClaimByIdForUser,
  findUserById,
  saveClaim,
  saveUser
} = require('../store/dataStore');
const { fetchWeather } = require('../services/weatherService');

router.post('/', async (req, res) => {
  try {
    const { userId, claimId, triggerType = 'MANUAL', eventCity } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fraud: location mismatch
    if (eventCity && eventCity.toLowerCase() !== user.city.toLowerCase()) {
      return res.status(400).json({
        error: 'Location mismatch: payout rejected',
        fraudDetected: true
      });
    }

    // Check live weather for rainfall before approving payment
    const claimCity = eventCity || user.city;
    const weatherData = await fetchWeather(claimCity);
    const currentRain = weatherData?.current?.rain || 0;

    // Decline claim if no rainfall detected
    if (currentRain === 0 || currentRain === undefined) {
      let claim;
      if (claimId) {
        claim = await findClaimByIdForUser(claimId, userId);
        if (!claim) return res.status(404).json({ error: 'Claim not found' });
        claim.status = 'REJECTED';
        claim.reason = 'no rainfall detected in your area';
        await saveClaim(claim);
      } else {
        claim = await createClaim({
          userId,
          triggerType,
          payout: 0,
          status: 'REJECTED',
          eventCity: claimCity,
          reason: 'no rainfall detected in your area'
        });
      }

      return res.json({
        payout: 0,
        claim,
        fraudDetected: false,
        message: 'no rainfall detected in your area',
        weatherData: {
          city: claimCity,
          currentRain,
          rainfall: 'Not detected'
        }
      });
    }

    // Approve claim if rainfall is detected
    const payout = 200 + Math.floor(Math.random() * 301); // 200-500
    let claim;

    if (claimId) {
      claim = await findClaimByIdForUser(claimId, userId);
      if (!claim) return res.status(404).json({ error: 'Claim not found' });

      claim.triggerType = triggerType || claim.triggerType;
      claim.payout = payout;
      claim.status = 'APPROVED';
      claim.eventCity = eventCity || claim.eventCity || user.city;
      claim.reason = `${claim.triggerType} payout approved - rainfall detected`;
      await saveClaim(claim);
    } else {
      claim = await createClaim({
        userId,
        triggerType,
        payout,
        status: 'APPROVED',
        eventCity: claimCity,
        reason: `${triggerType} payout simulated - rainfall detected`
      });
    }

    user.earnings = (user.earnings || 0) + payout;
    user.walletBalance = (user.walletBalance || 0) + payout;
    await saveUser(user);

    res.json({
      payout,
      claim,
      fraudDetected: false,
      message: 'Payout simulated and credited',
      weatherData: {
        city: claimCity,
        currentRain,
        rainfall: 'Detected'
      }
    });
  } catch (err) {
    console.error('Payout error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

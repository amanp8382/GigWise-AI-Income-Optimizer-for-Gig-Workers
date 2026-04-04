const router = require('express').Router();
const { countRecentClaims, createClaim, findUserById } = require('../store/dataStore');

const REPEAT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

router.post('/', async (req, res) => {
  try {
    const { userId, triggerType = 'MANUAL', eventCity } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fraud: location mismatch
    if (eventCity && eventCity.toLowerCase() !== user.city.toLowerCase()) {
      return res.status(400).json({
        error: 'Location mismatch: claim rejected',
        fraudDetected: true
      });
    }

    // Fraud: repeated claims in short time
    const since = new Date(Date.now() - REPEAT_WINDOW_MS);
    const recentClaims = await countRecentClaims(userId, since);
    if (recentClaims > 0) {
      return res.status(400).json({
        error: 'Repeated claim detected, try later',
        fraudDetected: true
      });
    }

    const claim = await createClaim({
      userId,
      triggerType,
      payout: 0,
      status: 'PENDING',
      eventCity: eventCity || user.city,
      reason: 'Manual claim logged'
    });

    res.json({
      claim,
      fraudDetected: false,
      message: 'Claim recorded and pending review'
    });
  } catch (err) {
    console.error('Claim error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

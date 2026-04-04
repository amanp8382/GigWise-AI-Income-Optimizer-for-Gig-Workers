const router = require('express').Router();
const {
  countRecentClaims,
  createClaim,
  findActivePolicyByUserId,
  findUserById,
  saveUser
} = require('../store/dataStore');
const {
  CLAIM_TRIGGER_COOLDOWN_MS,
  buildClaimOffer
} = require('../services/claimOfferService');
const { safeNumber } = require('../ml/featureEngineering');

const buildEligibilityResponse = async (user, location = {}) => {
  const policy = await findActivePolicyByUserId(user._id);
  if (!policy) {
    return {
      eligible: false,
      canCollect: false,
      requiresKyc: user.kyc?.status !== 'VERIFIED',
      message: 'Activate a policy to unlock live weather claims.'
    };
  }

  const since = new Date(Date.now() - CLAIM_TRIGGER_COOLDOWN_MS);
  const recentClaims = await countRecentClaims(user._id, since);
  const offer = await buildClaimOffer({ user, policy, location });
  const kycVerified = user.kyc?.status === 'VERIFIED';
  const onCooldown = recentClaims > 0;

  if (!offer.eligible) {
    return {
      eligible: false,
      canCollect: false,
      requiresKyc: !kycVerified,
      currentRain: offer.currentRain,
      weather: {
        city: offer.resolvedLocation?.city || user.city,
        currentRain: offer.currentRain,
        aqi: offer.aqiValue,
        temperature: offer.currentTemp
      },
      message: 'No rain detected in the live worker area right now.'
    };
  }

  return {
    eligible: !onCooldown,
    canCollect: !onCooldown && kycVerified,
    requiresKyc: !kycVerified,
    cooldownActive: onCooldown,
    suggestedAmount: offer.suggestedAmount,
    triggerType: offer.triggerType,
    explanation: offer.explanation,
    weather: {
      city: offer.resolvedLocation?.city || user.city,
      currentRain: offer.currentRain,
      aqi: offer.aqiValue,
      temperature: offer.currentTemp
    },
    wallet: {
      balance: user.walletBalance || 0,
      isKycVerified: kycVerified
    },
    message: onCooldown
      ? 'A recent claim was already created for this worker. Try again later.'
      : kycVerified
      ? `Rain detected. Rs ${offer.suggestedAmount} is ready to collect into the wallet.`
      : `Rain detected. Rs ${offer.suggestedAmount} is ready, but KYC must be completed before collection.`
  };
};

router.post('/', async (req, res) => {
  try {
    const { userId, city, latitude, longitude } = req.body;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = await buildEligibilityResponse(user, { city, latitude, longitude });
    res.json(response);
  } catch (err) {
    console.error('Trigger error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/collect', async (req, res) => {
  try {
    const { userId, city, latitude, longitude } = req.body;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const policy = await findActivePolicyByUserId(user._id);
    if (!policy) {
      return res.status(400).json({ error: 'Activate a policy before collecting a rain claim' });
    }

    if (user.kyc?.status !== 'VERIFIED' || !user.kyc?.bankAccountNumber) {
      return res.status(400).json({
        error: 'Complete KYC and link your primary bank account before collecting rain claims',
        requiresKyc: true
      });
    }

    const since = new Date(Date.now() - CLAIM_TRIGGER_COOLDOWN_MS);
    const recentClaims = await countRecentClaims(user._id, since);
    if (recentClaims > 0) {
      return res.status(400).json({ error: 'A recent claim already exists for this worker' });
    }

    const offer = await buildClaimOffer({ user, policy, location: { city, latitude, longitude } });
    if (!offer.eligible) {
      return res.status(400).json({ error: 'No rain detected in the live worker area right now' });
    }

    const claim = await createClaim({
      userId: user._id,
      triggerType: 'RAIN',
      payout: offer.suggestedAmount,
      status: 'APPROVED',
      eventCity: offer.resolvedLocation?.city || city || user.city,
      reason: `Live rain detected. Dynamic claim amount Rs ${offer.suggestedAmount} credited after KYC verification.`
    });

    user.earnings = Number((safeNumber(user.earnings, 0) + offer.suggestedAmount).toFixed(2));
    user.walletBalance = Number(
      (safeNumber(user.walletBalance, 0) + offer.suggestedAmount).toFixed(2)
    );
    await saveUser(user);

    res.json({
      claim,
      collected: true,
      payout: offer.suggestedAmount,
      message: `Rs ${offer.suggestedAmount} collected into your wallet`,
      wallet: {
        balance: user.walletBalance,
        isKycVerified: true
      },
      weather: {
        city: offer.resolvedLocation?.city || user.city,
        currentRain: offer.currentRain
      }
    });
  } catch (err) {
    console.error('Trigger error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

const router = require('express').Router();
const {
  findActivePolicyByUserId,
  countRecentClaims,
  findUserById,
  listClaimsByUserId,
  listPoliciesByUserId
} = require('../store/dataStore');
const { buildClaimOffer, CLAIM_TRIGGER_COOLDOWN_MS } = require('../services/claimOfferService');

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const startOfRollingWeek = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const maskBankAccount = (value) => {
  const digits = String(value || '').replace(/\s+/g, '');
  if (!digits) return '';
  return `XXXXXX${digits.slice(-4)}`;
};

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const policy = await findActivePolicyByUserId(userId);
    const [claims, policies] = await Promise.all([
      listClaimsByUserId(userId, 20),
      listPoliciesByUserId(userId, 24)
    ]);

    const claimOffer = policy ? await buildClaimOffer({ user, policy }) : null;
    const currentRain = claimOffer?.currentRain || 0;
    const isRaining = currentRain > 0;
    const recentClaimCount = await countRecentClaims(
      userId,
      new Date(Date.now() - CLAIM_TRIGGER_COOLDOWN_MS)
    );

    const totalPayout = claims.reduce((sum, item) => sum + (item.payout || 0), 0);
    const lastPayout = claims.find((item) => item.status === 'APPROVED');
    const monthStart = startOfMonth();
    const weeklyStart = startOfRollingWeek();
    const monthlyPolicies = policies.filter((item) => new Date(item.createdAt) >= monthStart);
    const weeklyApprovedClaims = claims.filter(
      (item) => item.status === 'APPROVED' && new Date(item.createdAt) >= weeklyStart
    );
    const monthlyPremiumTotal = monthlyPolicies.reduce(
      (sum, item) => sum + (item.premium || 0),
      0
    );
    const weeklyCollected = weeklyApprovedClaims.reduce(
      (sum, item) => sum + (item.payout || 0),
      0
    );

    res.json({
      user,
      policy,
      policies,
      claims,
      metrics: {
        totalEarnings: user.earnings || 0,
        totalPayout,
        lastPayout: lastPayout ? lastPayout.payout : 0,
        walletBalance: user.walletBalance || 0,
        totalWithdrawn: user.totalWithdrawn || 0,
        monthlyPremiumTotal,
        weeklyCollected
      },
      monthlyInsurance: {
        monthLabel: monthStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
        totalPremium: monthlyPremiumTotal,
        activeCoverage: policy?.coverage || 0,
        weeklyPolicies: monthlyPolicies.length,
        entries: monthlyPolicies.map((item) => ({
          _id: item._id,
          premium: item.premium,
          coverage: item.coverage,
          billingCycle: item.billingCycle || 'WEEKLY',
          startDate: item.startDate,
          endDate: item.endDate,
          active: item.active
        }))
      },
      wallet: {
        balance: user.walletBalance || 0,
        weeklyCollected,
        totalWithdrawn: user.totalWithdrawn || 0,
        kycStatus: user.kyc?.status || 'NOT_STARTED',
        isKycVerified: user.kyc?.status === 'VERIFIED',
        legalName: user.kyc?.legalName || '',
        bankAccountMasked: maskBankAccount(user.kyc?.bankAccountNumber),
        lastWithdrawalAt: user.lastWithdrawalAt || null
      },
      autoClaim: {
        eligible: Boolean(policy && isRaining && recentClaimCount === 0),
        canCollect:
          Boolean(policy && isRaining && recentClaimCount === 0) &&
          user.kyc?.status === 'VERIFIED',
        requiresKyc: user.kyc?.status !== 'VERIFIED',
        suggestedAmount: claimOffer?.suggestedAmount || 0,
        explanation: claimOffer?.explanation || '',
        cooldownActive: recentClaimCount > 0,
        city: claimOffer?.resolvedLocation?.city || user.city
      },
      weatherStatus: {
        city: user.city,
        currentRain,
        isRaining,
        rainfall: isRaining ? 'Rainfall detected' : 'no rainfall detected in your area',
        payoutEligible: isRaining ? 'Yes - Rainfall detected' : 'No - No rainfall detected'
      }
    });
  } catch (err) {
    console.error('Dashboard error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

const router = require('express').Router();
const { findUserById, saveUser } = require('../store/dataStore');

const maskBankAccount = (value) => {
  const digits = String(value || '').replace(/\s+/g, '');
  if (!digits) return '';
  return `XXXXXX${digits.slice(-4)}`;
};

router.post('/setup', async (req, res) => {
  try {
    const { userId, legalName, idNumber, phone, bankAccountNumber, ifscCode } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    if ([legalName, idNumber, phone, bankAccountNumber, ifscCode].some((value) => !String(value || '').trim())) {
      return res.status(400).json({ error: 'Complete KYC and bank account details are required' });
    }

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.kyc = {
      status: 'VERIFIED',
      legalName: String(legalName).trim(),
      idNumber: String(idNumber).trim(),
      phone: String(phone).trim(),
      bankAccountNumber: String(bankAccountNumber).trim(),
      ifscCode: String(ifscCode).trim().toUpperCase(),
      verifiedAt: new Date()
    };

    await saveUser(user);

    res.json({
      message: 'KYC completed. Wallet is linked to the primary bank account.',
      wallet: {
        balance: user.walletBalance || 0,
        totalWithdrawn: user.totalWithdrawn || 0,
        kycStatus: user.kyc.status,
        legalName: user.kyc.legalName,
        bankAccountMasked: maskBankAccount(user.kyc.bankAccountNumber)
      }
    });
  } catch (err) {
    console.error('Wallet setup error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const withdrawalAmount = Number(amount);
    if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid withdrawal amount' });
    }

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.kyc?.status !== 'VERIFIED' || !user.kyc?.bankAccountNumber) {
      return res.status(400).json({
        error: 'Complete KYC and link your primary bank account before withdrawing'
      });
    }

    const walletBalance = Number(user.walletBalance || 0);
    if (withdrawalAmount > walletBalance) {
      return res.status(400).json({
        error: `Only Rs ${walletBalance.toFixed(0)} is available in your wallet right now`
      });
    }

    user.walletBalance = Number((walletBalance - withdrawalAmount).toFixed(2));
    user.totalWithdrawn = Number(((user.totalWithdrawn || 0) + withdrawalAmount).toFixed(2));
    user.lastWithdrawalAt = new Date();

    await saveUser(user);

    res.json({
      message: `Rs ${withdrawalAmount.toFixed(0)} transferred to your primary bank account`,
      wallet: {
        balance: user.walletBalance,
        totalWithdrawn: user.totalWithdrawn,
        kycStatus: user.kyc.status,
        legalName: user.kyc.legalName,
        bankAccountMasked: maskBankAccount(user.kyc.bankAccountNumber),
        lastWithdrawalAt: user.lastWithdrawalAt
      }
    });
  } catch (err) {
    console.error('Wallet withdraw error', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

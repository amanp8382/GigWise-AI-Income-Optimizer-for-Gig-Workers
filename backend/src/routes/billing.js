const crypto = require('crypto');
const router = require('express').Router();
const axios = require('axios');
const { calculatePremium } = require('../services/aiRiskService');
const {
  createPaymentRecord,
  createPolicy,
  deactivateActivePolicies,
  findPaymentByOrderId,
  findUserById,
  savePayment
} = require('../store/dataStore');

const RAZORPAY_ORDER_URL = 'https://api.razorpay.com/v1/orders';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

const hasRazorpayConfig = () => Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
const normalizeNumber = (value) => Number(value) || 0;
const createReceipt = (userId) => `gw_${String(userId).slice(-6)}_${Date.now()}`;

const buildQuoteInput = (payload, fallbackCity) => ({
  city: payload.city || fallbackCity,
  avgHours: normalizeNumber(payload.avgHours),
  deliveries: normalizeNumber(payload.deliveries),
  workerRating: normalizeNumber(payload.workerRating)
});

const buildQuoteSnapshot = (payload, prediction) => ({
  plan: payload.plan || 'AI_DYNAMIC',
  city: payload.city,
  avgHours: payload.avgHours,
  deliveries: payload.deliveries,
  workerRating: payload.workerRating,
  premium: prediction.premium,
  coverage: prediction.coverage,
  riskScore: prediction.riskScore,
  forecastRisk: prediction.forecastRisk,
  riskLevel: prediction.riskLevel,
  explanation: prediction.explanation
});

const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  const generatedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return generatedSignature === signature;
};

const verifyWebhookSignature = (rawBody, signature) => {
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return expectedSignature === signature;
};

async function finalizePaidOrder(paymentRecord, paymentDetails = {}) {
  if (!paymentRecord) {
    throw new Error('Payment record not found');
  }

  if (paymentRecord.activatedPolicyId) {
    return {
      payment: paymentRecord,
      policy: null
    };
  }

  const quote = paymentRecord.quote || {};

  await deactivateActivePolicies(paymentRecord.userId);

  const policy = await createPolicy({
    userId: paymentRecord.userId,
    city: quote.city,
    premium: quote.premium,
    coverage: quote.coverage,
    avgHours: normalizeNumber(quote.avgHours),
    deliveries: normalizeNumber(quote.deliveries),
    workerRating: normalizeNumber(quote.workerRating),
    riskScore: quote.riskScore,
    forecastRisk: quote.forecastRisk,
    billingCycle: 'WEEKLY',
    active: true,
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  paymentRecord.status = 'PAID';
  paymentRecord.razorpayPaymentId =
    paymentDetails.razorpayPaymentId || paymentRecord.razorpayPaymentId || '';
  paymentRecord.razorpaySignature =
    paymentDetails.razorpaySignature || paymentRecord.razorpaySignature || '';
  paymentRecord.paidAt = paymentRecord.paidAt || new Date();
  paymentRecord.activatedPolicyId = policy._id;

  await savePayment(paymentRecord);

  return {
    payment: paymentRecord,
    policy
  };
}

router.post('/order', async (req, res) => {
  try {
    if (!hasRazorpayConfig()) {
      return res.status(500).json({ error: 'Razorpay is not configured on the backend' });
    }

    const { userId, plan } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const quoteInput = buildQuoteInput(req.body, user.city);
    if (quoteInput.city && user.city.toLowerCase() !== quoteInput.city.toLowerCase()) {
      return res.status(400).json({ error: 'Location mismatch: renewal rejected' });
    }

    const prediction = await calculatePremium(quoteInput);
    const receipt = createReceipt(userId);
    const amount = Math.round(prediction.premium * 100);

    const orderResponse = await axios.post(
      RAZORPAY_ORDER_URL,
      {
        amount,
        currency: 'INR',
        receipt,
        notes: {
          userId: String(userId),
          city: quoteInput.city,
          billingCycle: 'WEEKLY',
          plan: plan || 'AI_DYNAMIC'
        }
      },
      {
        auth: {
          username: RAZORPAY_KEY_ID,
          password: RAZORPAY_KEY_SECRET
        },
        timeout: 10000
      }
    );

    await createPaymentRecord({
      userId,
      orderId: orderResponse.data.id,
      receipt,
      status: 'CREATED',
      amount,
      currency: orderResponse.data.currency || 'INR',
      quote: buildQuoteSnapshot(
        {
          ...quoteInput,
          plan
        },
        prediction
      )
    });

    return res.json({
      keyId: RAZORPAY_KEY_ID,
      order: {
        id: orderResponse.data.id,
        amount: orderResponse.data.amount,
        currency: orderResponse.data.currency,
        receipt: orderResponse.data.receipt,
        status: orderResponse.data.status
      },
      pricing: {
        premium: prediction.premium,
        coverage: prediction.coverage,
        riskLevel: prediction.riskLevel,
        explanation: prediction.explanation
      }
    });
  } catch (err) {
    console.error('Billing order error', err.response?.data || err.message);
    res.status(500).json({ error: 'Could not create Razorpay order' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { userId, orderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!userId || !orderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Payment verification fields are required' });
    }

    const paymentRecord = await findPaymentByOrderId(orderId);
    if (!paymentRecord) return res.status(404).json({ error: 'Payment order not found' });
    if (String(paymentRecord.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Payment order does not belong to this user' });
    }

    if (!verifyPaymentSignature({ orderId, paymentId: razorpayPaymentId, signature: razorpaySignature })) {
      paymentRecord.status = 'FAILED';
      await savePayment(paymentRecord);
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    const result = await finalizePaidOrder(paymentRecord, {
      razorpayPaymentId,
      razorpaySignature
    });

    return res.json({
      message: `Policy activated. Weekly premium Rs ${result.payment.quote.premium}. Coverage Rs ${result.payment.quote.coverage}.`,
      payment: {
        orderId: result.payment.orderId,
        paymentId: result.payment.razorpayPaymentId,
        status: result.payment.status
      },
      policy: result.policy,
      pricing: result.payment.quote
    });
  } catch (err) {
    console.error('Billing verify error', err.message);
    res.status(500).json({ error: 'Could not verify payment' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      return res.status(500).json({ error: 'Razorpay webhook secret is not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;

    if (!signature || !rawBody || !verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload?.event || '';
    const paymentEntity = payload?.payload?.payment?.entity || {};
    const orderId = paymentEntity.order_id;

    if (!orderId) {
      return res.json({ ok: true });
    }

    const paymentRecord = await findPaymentByOrderId(orderId);
    if (!paymentRecord) {
      return res.json({ ok: true });
    }

    if (event === 'payment.failed') {
      paymentRecord.status = 'FAILED';
      await savePayment(paymentRecord);
      return res.json({ ok: true });
    }

    if (event === 'payment.captured' || event === 'order.paid') {
      await finalizePaidOrder(paymentRecord, {
        razorpayPaymentId: paymentEntity.id || '',
        razorpaySignature: paymentRecord.razorpaySignature || ''
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Billing webhook error', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, unique: true },
    receipt: { type: String, default: '' },
    status: {
      type: String,
      enum: ['CREATED', 'PAID', 'FAILED', 'CANCELLED'],
      default: 'CREATED'
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    activatedPolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy',
      default: null
    },
    quote: {
      plan: { type: String, default: 'AI_DYNAMIC' },
      city: { type: String, default: '' },
      avgHours: { type: Number, default: 0 },
      deliveries: { type: Number, default: 0 },
      workerRating: { type: Number, default: 0 },
      premium: { type: Number, default: 0 },
      coverage: { type: Number, default: 0 },
      riskScore: { type: Number, default: 0 },
      forecastRisk: { type: Number, default: 0 },
      riskLevel: { type: String, default: '' },
      explanation: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);

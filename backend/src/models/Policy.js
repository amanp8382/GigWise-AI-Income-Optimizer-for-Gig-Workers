const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    city: { type: String, default: '' },
    premium: { type: Number, required: true },
    coverage: { type: Number, required: true },
    avgHours: { type: Number, default: 0 },
    deliveries: { type: Number, default: 0 },
    workerRating: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0 },
    forecastRisk: { type: Number, default: 0 },
    billingCycle: { type: String, default: 'WEEKLY' },
    active: { type: Boolean, default: false },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);

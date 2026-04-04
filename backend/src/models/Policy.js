const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    premium: { type: Number, required: true },
    coverage: { type: Number, required: true },
    billingCycle: { type: String, default: 'WEEKLY' },
    active: { type: Boolean, default: false },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);

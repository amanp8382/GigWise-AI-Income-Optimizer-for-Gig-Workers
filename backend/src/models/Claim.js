const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    triggerType: { type: String, enum: ['RAIN', 'HEAT', 'POLLUTION', 'MANUAL'], required: true },
    payout: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    eventCity: { type: String },
    reason: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Claim', claimSchema);

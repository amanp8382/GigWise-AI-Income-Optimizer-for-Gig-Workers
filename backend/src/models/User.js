const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    city: { type: String, required: true },
    earnings: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    lastWithdrawalAt: { type: Date, default: null },
    kyc: {
      status: {
        type: String,
        enum: ['NOT_STARTED', 'PENDING', 'VERIFIED'],
        default: 'NOT_STARTED'
      },
      legalName: { type: String, default: '' },
      idNumber: { type: String, default: '' },
      phone: { type: String, default: '' },
      bankAccountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      verifiedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);

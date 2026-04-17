const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');

const memory = {
  users: [],
  policies: [],
  claims: [],
  payments: []
};

const isDbReady = () => mongoose.connection.readyState === 1;

const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const isPolicyExpired = (policy) => new Date(policy?.endDate || 0) <= new Date();

const makeId = () => randomUUID();
const defaultKyc = () => ({
  status: 'NOT_STARTED',
  legalName: '',
  idNumber: '',
  phone: '',
  bankAccountNumber: '',
  ifscCode: '',
  verifiedAt: null
});

const buildUserRecord = (data) => ({
  name: data.name,
  city: data.city,
  earnings: data.earnings ?? 0,
  walletBalance: data.walletBalance ?? 0,
  totalWithdrawn: data.totalWithdrawn ?? 0,
  lastWithdrawalAt: data.lastWithdrawalAt ?? null,
  kyc: {
    ...defaultKyc(),
    ...(data.kyc || {})
  }
});

const sortByCreatedDesc = (items) =>
  [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

async function findUserByNameCity(name, city) {
  if (isDbReady()) return User.findOne({ name, city });
  return memory.users.find((user) => user.name === name && user.city === city) || null;
}

async function createUser(data) {
  if (isDbReady()) return User.create(data);

  const user = {
    _id: makeId(),
    ...buildUserRecord(data),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  memory.users.push(user);
  return clone(user);
}

async function findUserById(userId) {
  if (isDbReady()) return User.findById(userId);
  return memory.users.find((user) => user._id === String(userId)) || null;
}

async function saveUser(user) {
  if (isDbReady()) return user.save();

  const index = memory.users.findIndex((item) => item._id === String(user._id));
  if (index >= 0) {
    memory.users[index] = {
      ...memory.users[index],
      ...clone(user),
      updatedAt: nowIso()
    };
    return clone(memory.users[index]);
  }

  return null;
}

async function deactivateActivePolicies(userId) {
  if (isDbReady()) {
    await Policy.updateMany({ userId, active: true }, { active: false });
    return;
  }

  memory.policies = memory.policies.map((policy) =>
    policy.userId === String(userId) && policy.active
      ? { ...policy, active: false, updatedAt: nowIso() }
      : policy
  );
}

async function deactivateExpiredPolicies(userId = null) {
  const now = new Date();

  if (isDbReady()) {
    const filter = { active: true, endDate: { $lte: now } };
    if (userId) filter.userId = userId;
    await Policy.updateMany(filter, { active: false });
    return;
  }

  memory.policies = memory.policies.map((policy) => {
    if (!policy.active) return policy;
    if (userId && policy.userId !== String(userId)) return policy;
    if (!isPolicyExpired(policy)) return policy;

    return { ...policy, active: false, updatedAt: nowIso() };
  });
}

async function createPolicy(data) {
  if (isDbReady()) return Policy.create(data);

  const policy = {
    _id: makeId(),
    ...data,
    userId: String(data.userId),
    billingCycle: data.billingCycle || 'WEEKLY',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  memory.policies.push(policy);
  return clone(policy);
}

async function findActivePolicyByUserId(userId) {
  await deactivateExpiredPolicies(userId);

  if (isDbReady()) {
    return Policy.findOne({ userId, active: true, endDate: { $gt: new Date() } }).sort({
      createdAt: -1
    });
  }

  return sortByCreatedDesc(
    memory.policies.filter(
      (policy) => policy.userId === String(userId) && policy.active && !isPolicyExpired(policy)
    )
  )[0] || null;
}

async function listActivePoliciesWithUsers() {
  await deactivateExpiredPolicies();

  if (isDbReady()) {
    return Policy.find({ active: true, endDate: { $gt: new Date() } }).populate('userId');
  }

  return memory.policies
    .filter((policy) => policy.active && !isPolicyExpired(policy))
    .map((policy) => ({
      ...clone(policy),
      userId: memory.users.find((user) => user._id === policy.userId) || null
    }))
    .filter((policy) => policy.userId);
}

async function createClaim(data) {
  if (isDbReady()) return Claim.create(data);

  const claim = {
    _id: makeId(),
    ...data,
    userId: String(data.userId),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  memory.claims.push(claim);
  return clone(claim);
}

async function countRecentClaims(userId, since) {
  if (isDbReady()) {
    return Claim.countDocuments({ userId, createdAt: { $gte: since } });
  }

  return memory.claims.filter(
    (claim) => claim.userId === String(userId) && new Date(claim.createdAt) >= since
  ).length;
}

async function findClaimByIdForUser(claimId, userId) {
  if (isDbReady()) return Claim.findOne({ _id: claimId, userId });

  return (
    memory.claims.find(
      (claim) => claim._id === String(claimId) && claim.userId === String(userId)
    ) || null
  );
}

async function saveClaim(claim) {
  if (isDbReady()) return claim.save();

  const index = memory.claims.findIndex((item) => item._id === String(claim._id));
  if (index >= 0) {
    memory.claims[index] = {
      ...memory.claims[index],
      ...clone(claim),
      updatedAt: nowIso()
    };
    return clone(memory.claims[index]);
  }

  return null;
}

async function listClaimsByUserId(userId, limit = 20) {
  if (isDbReady()) return Claim.find({ userId }).sort({ createdAt: -1 }).limit(limit);

  return sortByCreatedDesc(
    memory.claims.filter((claim) => claim.userId === String(userId))
  ).slice(0, limit);
}

async function listPoliciesByUserId(userId, limit = 24) {
  if (isDbReady()) return Policy.find({ userId }).sort({ createdAt: -1 }).limit(limit);

  return sortByCreatedDesc(
    memory.policies.filter((policy) => policy.userId === String(userId))
  ).slice(0, limit);
}

async function createPaymentRecord(data) {
  if (isDbReady()) {
    const Payment = require('../models/Payment');
    return Payment.create(data);
  }

  const payment = {
    _id: makeId(),
    userId: String(data.userId),
    ...clone(data),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  memory.payments.push(payment);
  return clone(payment);
}

async function findPaymentByOrderId(orderId) {
  if (isDbReady()) {
    const Payment = require('../models/Payment');
    return Payment.findOne({ orderId });
  }

  return memory.payments.find((payment) => payment.orderId === String(orderId)) || null;
}

async function listPaymentsByUserId(userId, limit = 20) {
  if (isDbReady()) {
    const Payment = require('../models/Payment');
    return Payment.find({ userId }).sort({ createdAt: -1 }).limit(limit);
  }

  return sortByCreatedDesc(
    memory.payments.filter((payment) => payment.userId === String(userId))
  ).slice(0, limit);
}

async function savePayment(payment) {
  if (isDbReady()) return payment.save();

  const index = memory.payments.findIndex((item) => item._id === String(payment._id));
  if (index >= 0) {
    memory.payments[index] = {
      ...memory.payments[index],
      ...clone(payment),
      updatedAt: nowIso()
    };
    return clone(memory.payments[index]);
  }

  return null;
}

module.exports = {
  isDbReady,
  findUserByNameCity,
  createUser,
  findUserById,
  saveUser,
  deactivateActivePolicies,
  deactivateExpiredPolicies,
  createPolicy,
  findActivePolicyByUserId,
  listActivePoliciesWithUsers,
  listPoliciesByUserId,
  createClaim,
  countRecentClaims,
  findClaimByIdForUser,
  saveClaim,
  listClaimsByUserId,
  createPaymentRecord,
  findPaymentByOrderId,
  listPaymentsByUserId,
  savePayment
};

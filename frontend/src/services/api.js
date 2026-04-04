import axios from 'axios';
import { API_BASE, getApiBaseCandidates, setManualApiBaseOverride } from '../constants/config';

let activeApiBase = API_BASE;

const api = axios.create({
  baseURL: activeApiBase,
  timeout: 10000
});

const normalizePremiumPayload = (payload = {}) => ({
  city: payload.city,
  avgHours: Number(payload.avgHours) || 0,
  deliveries: Number(payload.deliveries) || 0,
  workerRating: Number(payload.workerRating) || 0
});

const isNetworkError = (error) => !error?.response && /network error/i.test(error?.message || '');

const setActiveApiBase = (baseURL) => {
  activeApiBase = baseURL;
  api.defaults.baseURL = baseURL;
};

export const setApiBaseOverride = (value) => {
  const nextBase = setManualApiBaseOverride(value);
  if (nextBase) {
    setActiveApiBase(nextBase);
  }
  return nextBase;
};

const requestWithFallback = async (config) => {
  const candidates = [activeApiBase, ...getApiBaseCandidates()].filter(
    (value, index, array) => value && array.indexOf(value) === index
  );

  let lastError;

  for (const baseURL of candidates) {
    try {
      const response = await api.request({
        ...config,
        baseURL
      });

      setActiveApiBase(baseURL);
      return response;
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error)) throw error;
    }
  }

  throw lastError;
};

const getErrorMessage = (error, fallback) => {
  if (isNetworkError(error)) {
    const triedHosts = [activeApiBase, ...getApiBaseCandidates()]
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .join(', ');

    return `Cannot reach GigWise API. Tried: ${triedHosts}. Start the backend and, if you are using a real phone, set EXPO_PUBLIC_API_URL to your computer's LAN address, for example http://192.168.1.10:4000.`;
  }

  return error?.response?.data?.error || error?.message || fallback;
};

export const registerUser = async (name, city) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/register',
      data: { name, city }
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not register'));
  }
};

export const predictPremium = async (payload) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/predict-premium',
      data: normalizePremiumPayload(payload)
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not predict premium'));
  }
};

export const createPolicy = async (payload) => {
  try {
    const normalizedPayload = {
      userId: payload.userId,
      plan: payload.plan,
      city: payload.city,
      avgHours: Number(payload.avgHours) || 0,
      deliveries: Number(payload.deliveries) || 0,
      workerRating: Number(payload.workerRating) || 0
    };
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/policy',
      data: normalizedPayload
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not activate policy'));
  }
};

export const createClaim = async (userId, triggerType = 'MANUAL', eventCity) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/claim',
      data: { userId, triggerType, eventCity }
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not create claim'));
  }
};

export const createPayout = async (userId, claimId, triggerType = 'MANUAL', eventCity) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/payout',
      data: { userId, claimId, triggerType, eventCity }
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not process payout'));
  }
};

export const getDashboard = async (userId) => {
  try {
    const { data } = await requestWithFallback({
      method: 'get',
      url: `/dashboard/${userId}`
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load dashboard'));
  }
};

export const simulateTrigger = async (userId) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/trigger',
      data: { userId }
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not simulate trigger'));
  }
};

export const fetchWeather = async (location = {}) => {
  try {
    const params =
      typeof location === 'string'
        ? { city: location }
        : {
            city: location.city,
            latitude: location.latitude,
            longitude: location.longitude
          };

    const { data } = await requestWithFallback({
      method: 'get',
      url: '/weather',
      params
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load weather'));
  }
};

export const setupWalletKyc = async (payload) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/wallet/setup',
      data: payload
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not complete wallet KYC'));
  }
};

export const withdrawWalletAmount = async (payload) => {
  try {
    const { data } = await requestWithFallback({
      method: 'post',
      url: '/wallet/withdraw',
      data: payload
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not withdraw wallet amount'));
  }
};

export default api;

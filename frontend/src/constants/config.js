import { NativeModules, Platform } from 'react-native';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '4000';
let ExpoConstants = null;

try {
  ExpoConstants = require('expo/node_modules/expo-constants').default;
} catch (_error) {
  ExpoConstants = null;
}

const normalizeHost = (value) => {
  if (!value) return null;

  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/:\d+$/, '');
};

const extractHost = (value) => {
  const match = String(value || '').match(/^(?:[a-zA-Z]+:\/\/)?([^/:?]+)(?::\d+)?/);
  return normalizeHost(match?.[1] || null);
};

const getRuntimeHostFromExpo = () => {
  const candidates = [
    ExpoConstants?.expoConfig?.hostUri,
    ExpoConstants?.expoGoConfig?.debuggerHost,
    ExpoConstants?.manifest2?.extra?.expoClient?.hostUri,
    ExpoConstants?.manifest2?.extra?.expoGo?.debuggerHost,
    ExpoConstants?.linkingUri,
    ExpoConstants?.manifest?.debuggerHost
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host) return host;
  }

  return null;
};

const getRuntimeHostFromNative = () => {
  const candidates = [
    NativeModules.SourceCode?.scriptURL,
    NativeModules.DevSettings?.bundleURL,
    NativeModules.PlatformConstants?.ServerHost,
    NativeModules.PlatformConstants?.serverHost
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host) return host;
  }

  return null;
};

const getRuntimeHostFromWeb = () => {
  if (Platform.OS !== 'web') return null;

  const hostname = globalThis?.location?.hostname || '';
  return normalizeHost(hostname);
};

const buildUrl = (host) => `http://${host}:${API_PORT}`;

const dedupe = (values) => [...new Set(values.filter(Boolean))];

let manualApiBaseOverride = null;

export const normalizeApiBaseInput = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  const host = normalizeHost(trimmed);
  return host ? buildUrl(host) : null;
};

export const setManualApiBaseOverride = (value) => {
  manualApiBaseOverride = normalizeApiBaseInput(value);
  return manualApiBaseOverride;
};

export const getApiBaseCandidates = () => {
  if (manualApiBaseOverride) return [manualApiBaseOverride];

  const manualUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (manualUrl) return [manualUrl.replace(/\/+$/, '')];

  const manualHost = normalizeHost(process.env.EXPO_PUBLIC_API_HOST);
  if (manualHost) return [buildUrl(manualHost)];

  const runtimeHost = getRuntimeHostFromWeb() || getRuntimeHostFromExpo() || getRuntimeHostFromNative();
  const candidates = [];

  if (runtimeHost && runtimeHost !== 'localhost' && runtimeHost !== '127.0.0.1') {
    candidates.push(buildUrl(runtimeHost));
  }

  if (Platform.OS === 'android') {
    candidates.push(buildUrl('10.0.2.2'));
  }

  candidates.push(buildUrl('localhost'));
  candidates.push(buildUrl('127.0.0.1'));

  return dedupe(candidates);
};

export const API_BASE = getApiBaseCandidates()[0];
export const LOCAL_API_IP = API_BASE.replace(/^https?:\/\//i, '');
export const API_PORT_VALUE = API_PORT;

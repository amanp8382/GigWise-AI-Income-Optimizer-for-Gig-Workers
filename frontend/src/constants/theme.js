import { Platform } from 'react-native';
import { colors } from './colors';

const webFont = Platform.OS === 'web'
  ? { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }
  : {};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999
};

export const typography = {
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    ...webFont
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
    ...webFont
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    ...webFont
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    ...webFont
  },
  body: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    ...webFont
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    ...webFont
  }
};

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7
  }
};

import { colors } from './colors';

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
    letterSpacing: 0.6
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24
  },
  body: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  }
};

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  }
};

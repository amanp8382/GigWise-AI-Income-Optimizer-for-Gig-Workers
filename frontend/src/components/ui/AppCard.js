import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../constants/colors';
import { radius, shadows, spacing } from '../../constants/theme';

export default function AppCard({ children, style, tone = 'default' }) {
  return (
    <View style={[styles.base, tone === 'soft' && styles.soft, tone === 'accent' && styles.accent, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card
  },
  soft: {
    backgroundColor: colors.primarySoft,
    borderColor: 'transparent'
  },
  accent: {
    backgroundColor: colors.surface
  }
});

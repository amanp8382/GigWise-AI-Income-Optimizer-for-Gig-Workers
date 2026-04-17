import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../constants/colors';
import { radius, shadows, spacing } from '../../constants/theme';

export default function AppCard({ children, style, tone = 'default' }) {
  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.base, tone === 'soft' && styles.soft, tone === 'accent' && styles.accent, style]}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      style={({ hovered }) => [
        styles.base,
        tone === 'soft' && styles.soft,
        tone === 'accent' && styles.accent,
        hovered && styles.hovered,
        style
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transitionDuration: '240ms',
          transitionTimingFunction: 'ease',
          transitionProperty: 'transform, box-shadow, background-color, border-color'
        }
      : null)
  },
  soft: {
    backgroundColor: colors.primarySoft,
    borderColor: 'transparent'
  },
  accent: {
    backgroundColor: colors.surface
  },
  hovered: {
    transform: [{ scale: 1.02 }],
    borderColor: 'rgba(168, 85, 247, 0.35)',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: `0 18px 54px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(255, 255, 255, 0.10), 0 0 40px rgba(168, 85, 247, 0.16)`
        }
      : null)
  }
});

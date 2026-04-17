import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../../constants/colors';
import { radius, shadows, spacing, typography } from '../../constants/theme';

export default function AppButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  textStyle
}) {
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed, hovered, focused }) => [
        styles.base,
        isSecondary ? styles.secondary : styles.primary,
        (disabled || loading) && styles.disabled,
        Platform.OS === 'web' && hovered && !(disabled || loading) && styles.hovered,
        Platform.OS === 'web' && focused && !(disabled || loading) && styles.focused,
        pressed && !(disabled || loading) && styles.pressed,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.primary : colors.white} />
      ) : (
        <Text style={[styles.text, isSecondary && styles.secondaryText, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    ...shadows.soft,
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
          transitionDuration: '240ms',
          transitionTimingFunction: 'ease',
          transitionProperty: 'transform, box-shadow, background-color, border-color, opacity'
        }
      : null)
  },
  primary: {
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web'
      ? {
          backgroundImage: `linear-gradient(135deg, ${colors.primary} 0%, rgba(168, 85, 247, 0.72) 45%, rgba(168, 85, 247, 0.92) 100%)`
        }
      : null)
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }
      : null)
  },
  disabled: {
    opacity: 0.55
  },
  hovered: {
    transform: [{ translateY: -1 }, { scale: 1.01 }],
    ...(Platform.OS === 'web'
      ? {
          boxShadow: `0 10px 34px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.10), 0 0 28px rgba(168, 85, 247, 0.45)`
        }
      : null)
  },
  focused: {
    ...(Platform.OS === 'web'
      ? { boxShadow: `0 0 0 3px rgba(168, 85, 247, 0.35), 0 14px 40px rgba(0, 0, 0, 0.55)` }
      : null)
  },
  pressed: {
    transform: [{ scale: 0.985 }]
  },
  text: {
    color: colors.white,
    ...typography.label,
    fontSize: 15
  },
  secondaryText: {
    color: colors.text
  }
});

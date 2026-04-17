import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../constants/colors';
import { radius, spacing, typography } from '../../constants/theme';

export default function AppInput({ label, helper, style, ...props }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...props}
        placeholderTextColor={colors.placeholder}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[styles.input, focused && styles.inputFocused, style]}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md
  },
  label: {
    color: colors.textStrong,
    marginBottom: spacing.xs,
    ...typography.label
  },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'none',
          transitionDuration: '220ms',
          transitionTimingFunction: 'ease',
          transitionProperty: 'box-shadow, border-color, background-color, transform'
        }
      : null)
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    ...(Platform.OS === 'web'
      ? { boxShadow: `0 0 0 3px rgba(168, 85, 247, 0.35), 0 10px 32px rgba(0, 0, 0, 0.55)` }
      : null)
  },
  helper: {
    color: colors.muted,
    marginTop: spacing.xs,
    ...typography.body,
    fontSize: 12,
    lineHeight: 18
  }
});

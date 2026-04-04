import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { spacing, typography } from '../../constants/theme';

export default function AppHeader({ eyebrow, title, subtitle, right }) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xl
  },
  copy: {
    flex: 1
  },
  eyebrow: {
    color: colors.primary,
    marginBottom: spacing.sm,
    ...typography.eyebrow
  },
  title: {
    color: colors.textStrong,
    ...typography.title
  },
  subtitle: {
    color: colors.muted,
    marginTop: spacing.sm,
    ...typography.subtitle
  },
  right: {
    alignItems: 'flex-end'
  }
});

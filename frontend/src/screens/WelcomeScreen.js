import React from 'react';
import { Platform, ImageBackground, SafeAreaView, StyleSheet, View } from 'react-native';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import { colors } from '../constants/colors';
import { radius, spacing } from '../constants/theme';

const welcomePoster = require('../../assets/welcome-gigwise.png');

export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground source={welcomePoster} style={styles.background} resizeMode="cover">
        <View style={styles.overlay}>
          <View style={styles.glowTop} />
          <View style={styles.glowBottom} />
          <AppCard style={styles.ctaCard} tone="default">
            <View style={styles.buttonWrap}>
              <AppButton title="Let's Get Started" onPress={() => navigation.navigate('Login')} />
            </View>
          </AppCard>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%'
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(10, 10, 10, 0.55)'
  },
  glowTop: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    top: -220,
    left: -180,
    ...(Platform.OS === 'web'
      ? { filter: 'blur(18px)', opacity: 0.85 }
      : { opacity: 0.75 })
  },
  glowBottom: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(168, 85, 247, 0.10)',
    bottom: -280,
    right: -220,
    ...(Platform.OS === 'web'
      ? { filter: 'blur(22px)', opacity: 0.9 }
      : { opacity: 0.8 })
  },
  ctaCard: {
    padding: spacing.lg,
    borderRadius: radius.xl
  },
  buttonWrap: {
    marginBottom: spacing.xs
  }
});

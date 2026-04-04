import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import AppButton from '../components/ui/AppButton';
import { colors } from '../constants/colors';
import { radius, shadows, spacing } from '../constants/theme';

export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.heroArea}>
          <View style={styles.glowLarge} />
          <View style={styles.glowSmall} />
          <View style={styles.topMist} />

          <View style={styles.deliveryScene}>
            <View style={styles.shadow} />
            <View style={styles.scooter}>
              <View style={styles.rearBox} />
              <View style={styles.scooterBody} />
              <View style={styles.scooterFront} />
              <View style={styles.seat} />
              <View style={styles.handle} />
              <View style={styles.frontWheel} />
              <View style={styles.backWheel} />
              <View style={styles.riderHead} />
              <View style={styles.riderBody} />
              <View style={styles.riderLeg} />
            </View>
          </View>
        </View>

        <View style={styles.copyBlock}>
          <Text style={styles.title}>Hello Delivery Partner</Text>
          <Text style={styles.subtitle}>
            Protect your gig income with weather-aware coverage, live rain claim checks, and wallet-ready payouts.
          </Text>
        </View>

        <AppButton title="LOG IN / JOIN GIGWISE" onPress={() => navigation.navigate('Login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    paddingBottom: 28,
    justifyContent: 'space-between'
  },
  heroArea: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...shadows.card
  },
  glowLarge: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: 'rgba(37,99,235,0.10)',
    top: -40,
    right: -80
  },
  glowSmall: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.10)',
    bottom: 30,
    left: -80
  },
  topMist: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
    top: 25,
    opacity: 0.7
  },
  deliveryScene: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  shadow: {
    position: 'absolute',
    width: 170,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(19,32,36,0.10)',
    bottom: 66
  },
  scooter: {
    width: 210,
    height: 170,
    position: 'relative'
  },
  rearBox: {
    position: 'absolute',
    width: 42,
    height: 36,
    backgroundColor: '#60A5FA',
    borderRadius: 6,
    right: 30,
    top: 52,
    borderWidth: 2,
    borderColor: '#2563EB'
  },
  scooterBody: {
    position: 'absolute',
    width: 112,
    height: 42,
    backgroundColor: '#60A5FA',
    borderRadius: 24,
    left: 46,
    top: 72
  },
  scooterFront: {
    position: 'absolute',
    width: 48,
    height: 58,
    backgroundColor: '#60A5FA',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 14,
    left: 115,
    top: 58,
    transform: [{ rotate: '12deg' }]
  },
  seat: {
    position: 'absolute',
    width: 46,
    height: 10,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    left: 82,
    top: 64
  },
  handle: {
    position: 'absolute',
    width: 24,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    left: 132,
    top: 48,
    transform: [{ rotate: '22deg' }]
  },
  frontWheel: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1D2A2E',
    left: 118,
    top: 104,
    borderWidth: 6,
    borderColor: '#93C5FD'
  },
  backWheel: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1D2A2E',
    left: 52,
    top: 104,
    borderWidth: 6,
    borderColor: '#93C5FD'
  },
  riderHead: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F6C7A8',
    left: 88,
    top: 34
  },
  riderBody: {
    position: 'absolute',
    width: 22,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#4E83C7',
    left: 88,
    top: 56,
    transform: [{ rotate: '-8deg' }]
  },
  riderLeg: {
    position: 'absolute',
    width: 34,
    height: 10,
    borderRadius: 10,
    backgroundColor: '#263E6A',
    left: 98,
    top: 84,
    transform: [{ rotate: '18deg' }]
  },
  copyBlock: {
    marginTop: 28
  },
  title: {
    color: colors.textStrong,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    maxWidth: 260
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 300
  }
});

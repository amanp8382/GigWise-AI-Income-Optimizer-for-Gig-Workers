import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View
} from 'react-native';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import AppHeader from '../components/ui/AppHeader';
import AppInput from '../components/ui/AppInput';
import { colors } from '../constants/colors';
import { LOCAL_API_IP } from '../constants/config';
import { radius, shadows, spacing } from '../constants/theme';
import { registerUser, setApiBaseOverride } from '../services/api';

const citySuggestions = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad'];

export default function LoginScreen({ navigation, setUser }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [apiHost, setApiHost] = useState(LOCAL_API_IP);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (!name.trim() || !city.trim()) {
      setError('Enter your name and city to continue.');
      return;
    }

    const appliedApiBase = setApiBaseOverride(apiHost);
    if (!appliedApiBase) {
      setError('Enter a valid API host like 192.168.1.10:4000.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await registerUser(name.trim(), city.trim());
      setUser(user);
      navigation.replace('Home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.bgFx}>
        <View style={styles.bgGlowA} />
        <View style={styles.bgGlowB} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <AppHeader
              eyebrow="GigWise"
              title="Insurance built for unpredictable gig income."
              subtitle="Fast onboarding, weather-aware protection, and instant payout simulation."
            />
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Rain</Text>
                <Text style={styles.heroStatLabel}>Trigger-aware</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>Wallet</Text>
                <Text style={styles.heroStatLabel}>Payout-ready</Text>
              </View>
            </View>
          </View>

          <AppCard style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to your workspace</Text>
            <Text style={styles.cardHint}>Enter your backend host before continuing.</Text>

            <AppInput
              label="Backend host"
              placeholder="API host, for example 192.168.1.10:4000"
              value={apiHost}
              onChangeText={setApiHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              helper="On a real phone, 10.0.2.2 and localhost will not work. Use your laptop's Wi-Fi IP."
            />

            <AppInput
              label="Full name"
              placeholder="Full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <AppInput
              label="City"
              placeholder="City"
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
            />

            <View style={styles.chipsRow}>
              {citySuggestions.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCity(item)}
                  style={({ pressed, hovered }) => [
                    styles.chip,
                    Platform.OS === 'web' && hovered && styles.chipHovered,
                    pressed && styles.chipPressed
                  ]}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <AppButton title="Continue" onPress={handleContinue} loading={loading} />
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  bgFx: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          backgroundImage:
            'radial-gradient(650px 520px at 20% 12%, rgba(168, 85, 247, 0.22) 0%, rgba(168, 85, 247, 0) 60%), radial-gradient(760px 620px at 90% 35%, rgba(168, 85, 247, 0.18) 0%, rgba(168, 85, 247, 0) 60%)'
        }
      : null)
  },
  bgGlowA: {
    position: 'absolute',
    width: 540,
    height: 540,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    top: -280,
    left: -220,
    opacity: 0.9,
    ...(Platform.OS === 'web' ? { filter: 'blur(26px)' } : null)
  },
  bgGlowB: {
    position: 'absolute',
    width: 660,
    height: 660,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(168, 85, 247, 0.10)',
    bottom: -360,
    right: -300,
    opacity: 0.9,
    ...(Platform.OS === 'web' ? { filter: 'blur(30px)' } : null)
  },
  container: {
    flex: 1,
    width: '100%'
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center'
  },
  hero: {
    marginBottom: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }
      : null)
  },
  heroGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    top: -50,
    right: -70,
    ...(Platform.OS === 'web' ? { filter: 'blur(18px)' } : null)
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md
  },
  heroStat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  heroStatValue: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: '700'
  },
  heroStatLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs
  },
  card: {
    padding: spacing.xl
  },
  cardTitle: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: '700'
  },
  cardHint: {
    color: colors.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web'
      ? {
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease',
          transitionProperty: 'transform, box-shadow, background-color, border-color'
        }
      : null)
  },
  chipHovered: {
    borderColor: 'rgba(168, 85, 247, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ translateY: -1 }],
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 34px rgba(0,0,0,0.55), 0 0 22px rgba(168,85,247,0.14)' }
      : null)
  },
  chipPressed: {
    transform: [{ scale: 0.98 }]
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md
  }
});

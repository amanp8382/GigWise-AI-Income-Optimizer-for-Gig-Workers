import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
                <TouchableOpacity key={item} style={styles.chip} onPress={() => setCity(item)}>
                  <Text style={styles.chipText}>{item}</Text>
                </TouchableOpacity>
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
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.card
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    top: -50,
    right: -40
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
    borderColor: colors.border
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

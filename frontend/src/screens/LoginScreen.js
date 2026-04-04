import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../constants/colors';
import { LOCAL_API_IP } from '../constants/config';
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
            <Text style={styles.eyebrow}>GigWise</Text>
            <Text style={styles.title}>Insurance built for unpredictable gig income.</Text>
            <Text style={styles.subtitle}>
              Fast onboarding, weather-aware protection, and instant payout simulation.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to your workspace</Text>
            <Text style={styles.cardHint}>Enter your backend host before continuing.</Text>

            <TextInput
              placeholder="API host, for example 192.168.1.10:4000"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={apiHost}
              onChangeText={setApiHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.helperText}>
              On a real phone, `10.0.2.2` and `localhost` will not work. Use your laptop&apos;s Wi-Fi IP.
            </Text>

            <TextInput
              placeholder="Full name"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <TextInput
              placeholder="City"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
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

            <TouchableOpacity style={styles.primaryButton} onPress={handleContinue} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Continue</Text>}
            </TouchableOpacity>
          </View>
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
    padding: 24,
    justifyContent: 'center'
  },
  hero: {
    marginBottom: 24
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    marginTop: 10
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700'
  },
  cardHint: {
    color: colors.muted,
    marginTop: 6,
    marginBottom: 14
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 12
  },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: 8,
    marginBottom: 8
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700'
  },
  error: {
    color: colors.danger,
    marginBottom: 10
  }
});

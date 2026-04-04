import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../constants/colors';
import { createPolicy, fetchWeather, predictPremium } from '../services/api';

const cityOptions = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata'];

const sampleProfiles = [
  { key: 'low', label: 'Low Risk', avgHours: '5', deliveries: '10', workerRating: '4.9' },
  { key: 'medium', label: 'Medium Risk', avgHours: '8', deliveries: '20', workerRating: '4.5' },
  { key: 'high', label: 'High Risk', avgHours: '11', deliveries: '32', workerRating: '3.9' }
];

const getPollutionMessage = (aqiLevel) => {
  const value = Number(aqiLevel || 0);
  if (value >= 250) return 'Your area has high pollution -> premium increased';
  if (value >= 150) return 'Air quality is elevated -> premium adjusted upward';
  return 'Air quality is manageable -> premium impact is limited';
};

const toDisplayValue = (value, digits = 0) => Number(value || 0).toFixed(digits);

export default function PolicyScreen({ navigation, user }) {
  const [form, setForm] = useState({
    city: user?.city || 'Mumbai',
    avgHours: '8',
    deliveries: '20',
    workerRating: '4.6'
  });
  const [predicting, setPredicting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [syncingCity, setSyncingCity] = useState(false);
  const [message, setMessage] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [liveSnapshot, setLiveSnapshot] = useState(null);

  const parsedPayload = useMemo(
    () => ({
      city: form.city.trim(),
      avgHours: Number(form.avgHours),
      deliveries: Number(form.deliveries),
      workerRating: Number(form.workerRating)
    }),
    [form]
  );

  useEffect(() => {
    let active = true;

    const syncLiveCityData = async () => {
      if (!form.city.trim()) return;

      setSyncingCity(true);
      try {
        const weatherData = await fetchWeather(form.city.trim());
        if (!active) return;

        const nextRain =
          weatherData?.weather?.current?.rain ??
          weatherData?.weather?.hourly?.rain?.[0] ??
          0;
        const nextTemp =
          weatherData?.weather?.current?.temperature_2m ??
          weatherData?.weather?.hourly?.temperature_2m?.[0] ??
          0;
        const nextAqi = weatherData?.aqi?.value ?? 0;

        setLiveSnapshot({
          rain: nextRain,
          temperature: nextTemp,
          aqi: nextAqi,
          wind: weatherData?.weather?.current?.wind_speed_10m ?? 0,
          updatedAt: weatherData?.weather?.current?.time || ''
        });
        setPrediction(null);
        setMessage(`Live city data synced for ${form.city.trim()}`);
      } catch (err) {
        if (active) setMessage(err.message);
      } finally {
        if (active) setSyncingCity(false);
      }
    };

    syncLiveCityData();

    return () => {
      active = false;
    };
  }, [form.city]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applySample = (sample) => {
    setForm((current) => ({
      ...current,
      avgHours: sample.avgHours,
      deliveries: sample.deliveries,
      workerRating: sample.workerRating
    }));
    setPrediction(null);
    setMessage(`${sample.label} sample loaded for ${form.city}`);
  };

  const handlePredict = async () => {
    setPredicting(true);
    setMessage('');

    try {
      const result = await predictPremium(parsedPayload);
      setPrediction(result);
      setMessage(result.explanation);
    } catch (err) {
      setPrediction(null);
      setMessage(err.message);
    } finally {
      setPredicting(false);
    }
  };

  const handleActivate = async () => {
    if (!user?._id) {
      navigation.replace('Login');
      return;
    }

    setActivating(true);
    setMessage('');

    try {
      const { pricing } = await createPolicy({
        userId: user._id,
        ...parsedPayload,
        plan: prediction?.riskLevel || 'AI_DYNAMIC'
      });
      setMessage(`Policy activated. Weekly premium Rs ${pricing.premium}. Coverage Rs ${pricing.coverage}.`);
      navigation.navigate('Dashboard');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setActivating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>AI Pricing</Text>
        <Text style={styles.title}>City-aware premium prediction.</Text>
        <Text style={styles.subtitle}>
          Premium now changes with live city weather, air quality, work intensity, and worker rating.
        </Text>

        <View style={styles.cityRow}>
          {cityOptions.map((city) => (
            <TouchableOpacity
              key={city}
              style={[styles.cityChip, form.city === city && styles.cityChipActive]}
              onPress={() => updateField('city', city)}
            >
              <Text style={[styles.cityChipText, form.city === city && styles.cityChipTextActive]}>{city}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.samplesRow}>
          {sampleProfiles.map((sample) => (
            <TouchableOpacity key={sample.key} style={styles.sampleChip} onPress={() => applySample(sample)}>
              <Text style={styles.sampleChipText}>{sample.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.liveCard}>
          <Text style={styles.cardTitle}>Live City Inputs</Text>
          {syncingCity ? <ActivityIndicator color={colors.primary} /> : null}
          <Text style={styles.liveLine}>City: {form.city}</Text>
          <Text style={styles.liveLine}>Rain now: {toDisplayValue(liveSnapshot?.rain, 1)} mm</Text>
          <Text style={styles.liveLine}>Temperature now: {toDisplayValue(liveSnapshot?.temperature, 0)} C</Text>
          <Text style={styles.liveLine}>US AQI: {toDisplayValue(liveSnapshot?.aqi, 0)}</Text>
          <Text style={styles.liveLine}>Wind: {toDisplayValue(liveSnapshot?.wind, 0)} km/h</Text>
          <Text style={styles.liveLine}>Updated: {liveSnapshot?.updatedAt || 'Unavailable'}</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.cardTitle}>Work Inputs</Text>
          <TextInput
            style={styles.input}
            value={form.avgHours}
            onChangeText={(value) => updateField('avgHours', value)}
            keyboardType="numeric"
            placeholder="Avg working hours/day"
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            style={styles.input}
            value={form.deliveries}
            onChangeText={(value) => updateField('deliveries', value)}
            keyboardType="numeric"
            placeholder="Deliveries/day"
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            style={styles.input}
            value={form.workerRating}
            onChangeText={(value) => updateField('workerRating', value)}
            keyboardType="numeric"
            placeholder="Worker rating"
            placeholderTextColor={colors.placeholder}
          />

          <Text style={styles.sectionLabel}>Locked city metrics from weather API</Text>
          <View style={styles.lockedInputCard}>
            <Text style={styles.lockedInputLine}>
              Rain now: {toDisplayValue(liveSnapshot?.rain, 1)} mm
            </Text>
            <Text style={styles.lockedInputLine}>
              Temperature now: {toDisplayValue(liveSnapshot?.temperature, 0)} C
            </Text>
            <Text style={styles.lockedInputLine}>
              US AQI: {toDisplayValue(liveSnapshot?.aqi, 0)}
            </Text>
            <Text style={styles.lockedInputHint}>
              These values are fetched on the server during pricing and policy activation, so users cannot modify them.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handlePredict} disabled={predicting || syncingCity}>
            {predicting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Check My Premium</Text>}
          </TouchableOpacity>
        </View>

        {prediction ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultEyebrow}>Prediction Ready</Text>
            <Text style={styles.resultPremium}>Weekly Premium: Rs {prediction.premium}</Text>
            <Text style={styles.resultLine}>Risk Level: {prediction.riskLevel}</Text>
            <Text style={styles.resultLine}>Coverage: Rs {prediction.coverage}</Text>
            <Text style={styles.resultLine}>Risk Score: {prediction.riskScore}</Text>
            <Text style={styles.resultHint}>{prediction.explanation}</Text>
            <Text style={styles.resultHint}>{getPollutionMessage(prediction.inputs?.aqiLevel)}</Text>
            <Text style={styles.resultHint}>City risk baseline: {prediction.normalized?.cityRisk}</Text>

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Weather</Text>
                <Text style={styles.breakdownValue}>{prediction.weighted?.weatherRisk}</Text>
              </View>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Activity</Text>
                <Text style={styles.breakdownValue}>{prediction.weighted?.activityRisk}</Text>
              </View>
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Zone</Text>
                <Text style={styles.breakdownValue}>{prediction.weighted?.zoneRisk}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>What changed</Text>
          <Text style={styles.summaryLine}>Changing city now refreshes live rain, AQI, and temperature.</Text>
          <Text style={styles.summaryLine}>Weather and AQI are locked to server-fetched API values during premium calculation.</Text>
          <Text style={styles.summaryLine}>Worker rating is included, so lower ratings raise risk slightly.</Text>
          <Text style={styles.summaryLine}>Prediction can compare cities, but policy activation still checks your real user city.</Text>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, !prediction && styles.buttonDisabled]}
          onPress={handleActivate}
          disabled={!prediction || activating}
        >
          {activating ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Activate Personalized Plan</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    padding: 20,
    paddingBottom: 32
  },
  eyebrow: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 37,
    marginTop: 10
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 16
  },
  cityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12
  },
  cityChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8
  },
  cityChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  cityChipText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12
  },
  cityChipTextActive: {
    color: colors.white
  },
  samplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16
  },
  sampleChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8
  },
  sampleChipText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12
  },
  liveCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 24,
    padding: 20,
    marginBottom: 14
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  liveLine: {
    color: colors.textSoft,
    marginBottom: 6
  },
  sectionLabel: {
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 8
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
  lockedInputCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12
  },
  lockedInputLine: {
    color: colors.textSoft,
    marginBottom: 6
  },
  lockedInputHint: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: 6
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700'
  },
  buttonDisabled: {
    opacity: 0.45
  },
  resultCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 24,
    padding: 20,
    marginBottom: 14
  },
  resultEyebrow: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 8
  },
  resultPremium: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '800'
  },
  resultLine: {
    color: colors.textSoft,
    marginTop: 8
  },
  resultHint: {
    color: colors.text,
    lineHeight: 20,
    marginTop: 10
  },
  breakdownRow: {
    flexDirection: 'row',
    marginTop: 14
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12
  },
  breakdownLabel: {
    color: colors.muted,
    fontSize: 12
  },
  breakdownValue: {
    color: colors.text,
    fontWeight: '800',
    marginTop: 6
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginVertical: 8
  },
  summaryTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 10
  },
  summaryLine: {
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 6
  },
  message: {
    color: colors.accent,
    marginVertical: 12,
    lineHeight: 20
  }
});

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { fetchWeather, getDashboard, predictPremium } from '../services/api';

const DEFAULT_PREMIUM_INPUTS = {
  city: '',
  avgHours: '8',
  deliveries: '20',
  workerRating: '4.5'
};

const formatCurrency = (value) => `Rs ${Number(value || 0).toFixed(0)}`;

const buildPremiumPayload = (inputs) => ({
  city: inputs.city.trim(),
  avgHours: Number(inputs.avgHours) || 0,
  deliveries: Number(inputs.deliveries) || 0,
  workerRating: Number(inputs.workerRating) || 0
});

export default function HomeScreen({ navigation, user, setUser }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherSummary, setWeatherSummary] = useState(null);
  const [weatherMessage, setWeatherMessage] = useState('');
  const [premiumInputs, setPremiumInputs] = useState({
    ...DEFAULT_PREMIUM_INPUTS,
    city: user?.city || ''
  });
  const [premiumResult, setPremiumResult] = useState(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
  const locationPromptedRef = useRef(false);

  const applyWeatherSummary = useCallback((weatherData, fallbackCity = '') => {
    const resolvedCity =
      weatherData?.resolvedLocation?.city ||
      weatherData?.city ||
      fallbackCity ||
      user?.city ||
      premiumInputs.city;

    const nextWeather = {
      city: resolvedCity,
      observedAt:
        weatherData?.weather?.current?.time || weatherData?.weather?.hourly?.time?.[0] || '',
      rain:
        weatherData?.weather?.current?.rain ?? weatherData?.weather?.hourly?.rain?.[0] ?? 0,
      temp:
        weatherData?.weather?.current?.temperature_2m ??
        weatherData?.weather?.hourly?.temperature_2m?.[0] ??
        0,
      aqi: weatherData?.aqi?.value || 0,
      pm25: weatherData?.aqi?.current?.pm2_5 ?? 0
    };

    setWeatherSummary(nextWeather);
    setPremiumInputs((prev) => ({
      ...prev,
      city: resolvedCity || prev.city
    }));
    setWeatherMessage('');
  }, [premiumInputs.city, user?.city]);

  const syncPremiumDefaults = useCallback((dashboardData) => {
    const policyPremium = dashboardData?.policy?.premium;

    setPremiumInputs((prev) => ({
      ...prev,
      city: prev.city || user?.city || ''
    }));

    setPremiumResult((prev) => {
      if (prev) return prev;
      if (policyPremium == null) return prev;

      return {
        premium: policyPremium,
        coverage: dashboardData?.policy?.coverage || 0,
        riskLevel: dashboardData?.policy?.active ? 'Active policy' : 'Estimated',
        explanation: dashboardData?.policy?.active
          ? 'This is the premium on your current active policy.'
          : 'Recalculate to get a fresh premium estimate.'
      };
    });
  }, [user?.city]);

  const loadLiveWeather = useCallback(async (promptForPermission = false) => {
    setWeatherLoading(true);
    setWeatherMessage('');

    try {
      const Location = await import('expo-location');
      const getPermissions =
        typeof Location.getForegroundPermissionsAsync === 'function'
          ? Location.getForegroundPermissionsAsync
          : null;

      let permission = getPermissions ? await getPermissions() : null;
      if (!permission || permission.status === 'undetermined') {
        if (!promptForPermission) {
          setWeatherSummary(null);
          setWeatherMessage('Weather unavailable until location access is granted.');
          return;
        }

        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission?.status !== 'granted') {
        setWeatherSummary(null);
        setWeatherMessage('Location permission denied, weather unavailable');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy?.Balanced
      });

      const reverse = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });

      const liveCity =
        reverse?.[0]?.city ||
        reverse?.[0]?.district ||
        reverse?.[0]?.subregion ||
        reverse?.[0]?.region ||
        user?.city ||
        premiumInputs.city;

      const weatherData = await fetchWeather({
        city: liveCity,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
      applyWeatherSummary(weatherData, liveCity);
    } catch (err) {
      try {
        const fallbackCity = user?.city || premiumInputs.city;
        if (fallbackCity) {
          const weatherData = await fetchWeather({ city: fallbackCity });
          applyWeatherSummary(weatherData, fallbackCity);
          setWeatherMessage('Using your saved city because live location was unavailable.');
          return;
        }
      } catch (_fallbackError) {
        // Keep the original error message below when both live and city-based lookup fail.
      }

      setWeatherSummary(null);
      if (String(err?.message || '').includes('expo-location')) {
        setWeatherMessage('Location services unavailable, weather unavailable');
      } else {
        setWeatherMessage(err.message || 'Could not load live weather');
      }
    } finally {
      setWeatherLoading(false);
    }
  }, [applyWeatherSummary, premiumInputs.city, user?.city]);

  const loadHomeData = useCallback(async (showRefresh = false, promptForLocation = false) => {
    if (!user?._id) {
      navigation.replace('Login');
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const dashboardData = await getDashboard(user._id);
      setDashboard(dashboardData);
      syncPremiumDefaults(dashboardData);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    await loadLiveWeather(promptForLocation);
  }, [loadLiveWeather, navigation, syncPremiumDefaults, user]);

  useFocusEffect(
    useCallback(() => {
      const shouldPrompt = !locationPromptedRef.current;
      locationPromptedRef.current = true;
      loadHomeData(false, shouldPrompt);
    }, [loadHomeData])
  );

  const handlePremiumInputChange = (field, value) => {
    setPremiumInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecalculatePremium = async () => {
    setPremiumLoading(true);
    setPremiumError('');

    try {
      const result = await predictPremium(buildPremiumPayload(premiumInputs));
      setPremiumResult(result);
    } catch (err) {
      setPremiumError(err.message);
    } finally {
      setPremiumLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const activePolicy = dashboard?.policy;
  const claimsCount = dashboard?.claims?.length || 0;
  const totalPayout = dashboard?.metrics?.totalPayout || 0;
  const walletAmount = dashboard?.wallet?.balance || dashboard?.metrics?.walletBalance || 0;
  const weeklyCollected = dashboard?.wallet?.weeklyCollected || dashboard?.metrics?.weeklyCollected || 0;
  const monthlyInsurance = dashboard?.monthlyInsurance;
  const currentPremiumValue = premiumResult?.premium ?? activePolicy?.premium ?? 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHomeData(true, false)}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Welcome back</Text>
            <Text style={styles.title}>{user?.name}</Text>
            <Text style={styles.subtitle}>{user?.city}</Text>
          </View>
          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => {
              setUser(null);
              navigation.replace('Login');
            }}
          >
            <Text style={styles.ghostButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.walletCard}>
          <Text style={styles.sectionEyebrow}>Wallet</Text>
          <Text style={styles.walletAmount}>{formatCurrency(walletAmount)}</Text>
          <Text style={styles.walletMeta}>
            Approved payouts collect here first. Withdrawals are unlocked only after wallet KYC and
            bank linking are complete.
          </Text>
          <View style={styles.walletStatsRow}>
            <View style={styles.walletMiniCard}>
              <Text style={styles.walletMiniLabel}>Weekly credited</Text>
              <Text style={styles.walletMiniValue}>{formatCurrency(weeklyCollected)}</Text>
            </View>
            <View style={styles.walletMiniCard}>
              <Text style={styles.walletMiniLabel}>Transferred out</Text>
              <Text style={styles.walletMiniValue}>
                {formatCurrency(dashboard?.wallet?.totalWithdrawn || 0)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statCardFull}>
          <Text style={styles.statLabel}>Monthly insurance tracker</Text>
          <Text style={styles.statValue}>
            {formatCurrency(monthlyInsurance?.totalPremium || 0)}
          </Text>
          <Text style={styles.statFoot}>
            {monthlyInsurance?.monthLabel || 'Current month'} premium total across{' '}
            {monthlyInsurance?.weeklyPolicies || 0} weekly plans.
          </Text>
          <Text style={styles.statFoot}>
            Active coverage: {formatCurrency(monthlyInsurance?.activeCoverage || 0)}
          </Text>
          {(monthlyInsurance?.entries || []).slice(0, 2).map((entry) => (
            <View key={entry._id} style={styles.monthlyRow}>
              <Text style={styles.monthlyRowText}>
                {formatCurrency(entry.premium)} for {formatCurrency(entry.coverage)} coverage
              </Text>
              <Text style={styles.monthlyRowMeta}>
                {new Date(entry.startDate).toLocaleDateString()} to{' '}
                {new Date(entry.endDate).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Income protection</Text>
          <Text style={styles.heroValue}>
            {activePolicy?.active ? 'Active this week' : 'No active policy'}
          </Text>
          <Text style={styles.heroMeta}>
            {activePolicy?.active
              ? `Coverage Rs ${activePolicy.coverage} until ${new Date(
                  activePolicy.endDate
                ).toLocaleDateString()}`
              : 'Buy a weekly plan to unlock automated weather payouts.'}
          </Text>
        </View>

        <View style={styles.weatherCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>Live weather and AQI</Text>
            {weatherLoading ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
          {weatherSummary ? (
            <>
              <Text style={styles.weatherLine}>City: {weatherSummary.city}</Text>
              <Text style={styles.weatherLine}>
                Updated: {weatherSummary.observedAt || 'Unavailable'}
              </Text>
              <Text style={styles.weatherLine}>Temperature: {weatherSummary.temp} C</Text>
              <Text style={styles.weatherLine}>Rain: {weatherSummary.rain} mm</Text>
              <Text style={styles.weatherLine}>US AQI: {weatherSummary.aqi}</Text>
              <Text style={styles.weatherLine}>PM2.5: {weatherSummary.pm25}</Text>
            </>
          ) : (
            <Text style={styles.weatherFallback}>
              {weatherMessage || 'Checking location permission for live weather...'}
            </Text>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Protected earnings</Text>
            <Text style={styles.statValue}>
              {formatCurrency(dashboard?.metrics?.totalEarnings || 0)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Claims</Text>
            <Text style={styles.statValue}>{claimsCount}</Text>
          </View>
        </View>

        <View style={styles.statCardFull}>
          <Text style={styles.statLabel}>Total payouts processed</Text>
          <Text style={styles.statValue}>{formatCurrency(totalPayout)}</Text>
          <Text style={styles.statFoot}>
            Recent claims and trigger simulation are available in Dashboard.
          </Text>
        </View>

        <View style={styles.premiumCard}>
          <Text style={styles.sectionEyebrow}>Current Insurance Premium</Text>
          <Text style={styles.premiumValue}>{formatCurrency(currentPremiumValue)}</Text>
          <Text style={styles.premiumMeta}>
            Recalculate using your workload inputs. Weather and AQI are fetched automatically by the server and cannot be edited.
          </Text>

          <TextInput
            style={styles.input}
            value={premiumInputs.city}
            onChangeText={(value) => handlePremiumInputChange('city', value)}
            placeholder="City"
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            style={styles.input}
            value={premiumInputs.avgHours}
            onChangeText={(value) => handlePremiumInputChange('avgHours', value)}
            placeholder="Average hours"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            value={premiumInputs.deliveries}
            onChangeText={(value) => handlePremiumInputChange('deliveries', value)}
            placeholder="Deliveries"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            value={premiumInputs.workerRating}
            onChangeText={(value) => handlePremiumInputChange('workerRating', value)}
            placeholder="Worker rating"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />

          <View style={styles.lockedMetricsCard}>
            <Text style={styles.lockedMetricsTitle}>Locked live environment data</Text>
            <Text style={styles.lockedMetricsLine}>
              Rain now: {weatherSummary ? `${weatherSummary.rain} mm` : 'Loading'}
            </Text>
            <Text style={styles.lockedMetricsLine}>
              Temperature now: {weatherSummary ? `${weatherSummary.temp} C` : 'Loading'}
            </Text>
            <Text style={styles.lockedMetricsLine}>
              US AQI: {weatherSummary ? weatherSummary.aqi : 'Loading'}
            </Text>
          </View>

          {premiumResult?.coverage ? (
            <Text style={styles.premiumDetail}>Coverage: {formatCurrency(premiumResult.coverage)}</Text>
          ) : null}
          {premiumResult?.riskLevel ? (
            <Text style={styles.premiumDetail}>Risk level: {premiumResult.riskLevel}</Text>
          ) : null}
          {premiumResult?.explanation ? (
            <Text style={styles.premiumExplanation}>{premiumResult.explanation}</Text>
          ) : null}
          {premiumError ? <Text style={styles.error}>{premiumError}</Text> : null}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleRecalculatePremium}
            disabled={premiumLoading}
          >
            {premiumLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Recalculate Premium</Text>
            )}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Policy')}
        >
          <Text style={styles.primaryButtonText}>Choose Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.secondaryButtonText}>Open Dashboard</Text>
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
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  container: {
    padding: 20,
    paddingBottom: 32
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22
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
    marginTop: 6
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface
  },
  ghostButtonText: {
    color: colors.text,
    fontWeight: '600'
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8
  },
  walletCard: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  walletAmount: {
    color: colors.textStrong,
    fontSize: 30,
    fontWeight: '800'
  },
  walletMeta: {
    color: colors.textSoft,
    marginTop: 10,
    lineHeight: 20
  },
  walletStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14
  },
  walletMiniCard: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 18,
    padding: 14
  },
  walletMiniLabel: {
    color: colors.muted,
    fontSize: 12
  },
  walletMiniValue: {
    color: colors.textStrong,
    fontWeight: '800',
    fontSize: 18,
    marginTop: 8
  },
  heroCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 28,
    padding: 22,
    marginBottom: 16
  },
  heroLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10
  },
  heroValue: {
    color: colors.textStrong,
    fontSize: 26,
    fontWeight: '800'
  },
  heroMeta: {
    color: colors.textSoft,
    marginTop: 10,
    lineHeight: 20
  },
  weatherCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  weatherLine: {
    color: colors.textSoft,
    marginTop: 6
  },
  weatherFallback: {
    color: colors.muted,
    lineHeight: 20
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border
  },
  statCardFull: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8
  },
  statFoot: {
    color: colors.muted,
    marginTop: 8,
    lineHeight: 19
  },
  monthlyRow: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 12,
    marginTop: 10
  },
  monthlyRowText: {
    color: colors.text,
    fontWeight: '700'
  },
  monthlyRowMeta: {
    color: colors.muted,
    marginTop: 4
  },
  premiumCard: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18
  },
  premiumValue: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: '800'
  },
  premiumMeta: {
    color: colors.textSoft,
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 20
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
  lockedMetricsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12
  },
  lockedMetricsTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 8
  },
  lockedMetricsLine: {
    color: colors.muted,
    marginBottom: 4
  },
  premiumDetail: {
    color: colors.text,
    marginBottom: 6,
    fontWeight: '600'
  },
  premiumExplanation: {
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 20
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700'
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  error: {
    color: colors.danger,
    marginBottom: 12
  }
});

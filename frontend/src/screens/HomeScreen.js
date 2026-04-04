import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import AppHeader from '../components/ui/AppHeader';
import AppInput from '../components/ui/AppInput';
import { colors } from '../constants/colors';
import { radius, spacing } from '../constants/theme';
import {
  checkAutoClaim,
  collectAutoClaim,
  fetchWeather,
  getDashboard,
  predictPremium
} from '../services/api';

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
  const [liveLocation, setLiveLocation] = useState(null);
  const [premiumInputs, setPremiumInputs] = useState({
    ...DEFAULT_PREMIUM_INPUTS,
    city: user?.city || ''
  });
  const [premiumResult, setPremiumResult] = useState(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
  const [autoClaim, setAutoClaim] = useState(null);
  const [autoClaimVisible, setAutoClaimVisible] = useState(false);
  const [collectingClaim, setCollectingClaim] = useState(false);
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
      setLiveLocation({
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
          setLiveLocation({ city: fallbackCity });
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

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadClaimStatus = async () => {
        if (!user?._id) return;

        try {
          const result = await checkAutoClaim({
            userId: user._id,
            city: liveLocation?.city || weatherSummary?.city || user.city,
            latitude: liveLocation?.latitude,
            longitude: liveLocation?.longitude
          });
          if (!active) return;

          setAutoClaim(result);
          setAutoClaimVisible(Boolean(result?.eligible || (result?.suggestedAmount && result?.requiresKyc)));
        } catch (_err) {
          if (active) {
            setAutoClaim(null);
            setAutoClaimVisible(false);
          }
        }
      };

      loadClaimStatus();

      return () => {
        active = false;
      };
    }, [liveLocation?.city, liveLocation?.latitude, liveLocation?.longitude, user?._id, user?.city, weatherSummary?.city])
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

  const handleCollectClaim = async () => {
    if (!user?._id) return;

    setCollectingClaim(true);
    setPremiumError('');

    try {
      const response = await collectAutoClaim({
        userId: user._id,
        city: liveLocation?.city || weatherSummary?.city || user.city,
        latitude: liveLocation?.latitude,
        longitude: liveLocation?.longitude
      });
      setAutoClaimVisible(false);
      setAutoClaim((current) => ({
        ...(current || {}),
        canCollect: false,
        message: response.message,
        wallet: response.wallet
      }));
      await loadHomeData(true, false);
    } catch (err) {
      setPremiumError(err.message);
    } finally {
      setCollectingClaim(false);
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
        <AppHeader
          eyebrow="Welcome back"
          title={user?.name}
          subtitle={user?.city}
          right={
            <AppButton
              title="Log out"
              variant="secondary"
              onPress={() => {
                setUser(null);
                navigation.replace('Login');
              }}
              style={styles.logoutButton}
              textStyle={styles.logoutButtonText}
            />
          }
        />

        <AppCard style={styles.walletCard}>
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
        </AppCard>

        {autoClaim?.suggestedAmount ? (
          <AppCard tone="soft" style={styles.claimBanner}>
            <Text style={styles.sectionEyebrow}>Live rain claim</Text>
            <Text style={styles.claimBannerAmount}>{formatCurrency(autoClaim.suggestedAmount)}</Text>
            <Text style={styles.claimBannerText}>
              {autoClaim.message || 'Rain-based claim amount updates from live weather and workload.'}
            </Text>
          </AppCard>
        ) : null}

        <AppCard style={styles.statCardFull}>
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
        </AppCard>

        <AppCard tone="soft" style={styles.heroCard}>
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
        </AppCard>

        <AppCard style={styles.weatherCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>Live weather and AQI</Text>
            {weatherLoading ? <Text style={styles.loadingTag}>Syncing...</Text> : null}
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
        </AppCard>

        <View style={styles.statsRow}>
          <AppCard style={styles.statCard}>
            <Text style={styles.statLabel}>Protected earnings</Text>
            <Text style={styles.statValue}>
              {formatCurrency(dashboard?.metrics?.totalEarnings || 0)}
            </Text>
          </AppCard>
          <AppCard style={styles.statCard}>
            <Text style={styles.statLabel}>Claims</Text>
            <Text style={styles.statValue}>{claimsCount}</Text>
          </AppCard>
        </View>

        <AppCard style={styles.statCardFull}>
          <Text style={styles.statLabel}>Total payouts processed</Text>
          <Text style={styles.statValue}>{formatCurrency(totalPayout)}</Text>
          <Text style={styles.statFoot}>
            Live weather claims are available from Dashboard when rain is detected.
          </Text>
        </AppCard>

        <AppCard style={styles.premiumCard}>
          <Text style={styles.sectionEyebrow}>Current Insurance Premium</Text>
          <Text style={styles.premiumValue}>{formatCurrency(currentPremiumValue)}</Text>
          <Text style={styles.premiumMeta}>
            Recalculate using your workload inputs. Weather and AQI are fetched automatically by the server and cannot be edited.
          </Text>

          <AppInput
            label="City"
            value={premiumInputs.city}
            onChangeText={(value) => handlePremiumInputChange('city', value)}
            placeholder="City"
          />
          <AppInput
            label="Average hours"
            value={premiumInputs.avgHours}
            onChangeText={(value) => handlePremiumInputChange('avgHours', value)}
            placeholder="Average hours"
            keyboardType="numeric"
          />
          <AppInput
            label="Deliveries"
            value={premiumInputs.deliveries}
            onChangeText={(value) => handlePremiumInputChange('deliveries', value)}
            placeholder="Deliveries"
            keyboardType="numeric"
          />
          <AppInput
            label="Worker rating"
            value={premiumInputs.workerRating}
            onChangeText={(value) => handlePremiumInputChange('workerRating', value)}
            placeholder="Worker rating"
            keyboardType="numeric"
          />

          <AppCard tone="accent" style={styles.lockedMetricsCard}>
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
          </AppCard>

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

          <AppButton title="Recalculate Premium" onPress={handleRecalculatePremium} loading={premiumLoading} />
        </AppCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton title="Choose Policy" onPress={() => navigation.navigate('Policy')} />

        <AppButton title="Open Dashboard" variant="secondary" onPress={() => navigation.navigate('Dashboard')} />
      </ScrollView>

      <Modal
        visible={autoClaimVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAutoClaimVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <AppCard style={styles.modalCard}>
            <Text style={styles.cardTitle}>Rain detected in your area</Text>
            <Text style={styles.modalAmount}>{formatCurrency(autoClaim?.suggestedAmount || 0)}</Text>
            <Text style={styles.modalText}>
              {autoClaim?.message || 'Dynamic claim amount is ready from live weather.'}
            </Text>
            {autoClaim?.weather?.currentRain ? (
              <Text style={styles.modalMeta}>
                Live rain: {autoClaim.weather.currentRain} mm in {autoClaim.weather.city}
              </Text>
            ) : null}
            {premiumError ? <Text style={styles.error}>{premiumError}</Text> : null}
            {autoClaim?.canCollect ? (
              <AppButton title="Collect to Wallet" onPress={handleCollectClaim} loading={collectingClaim} />
            ) : (
              <AppButton
                title="Complete KYC to Collect"
                onPress={() => {
                  setAutoClaimVisible(false);
                  navigation.navigate('Dashboard');
                }}
              />
            )}
            <AppButton title="Dismiss" variant="secondary" onPress={() => setAutoClaimVisible(false)} />
          </AppCard>
        </View>
      </Modal>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  logoutButton: {
    minHeight: 42,
    paddingHorizontal: spacing.md
  },
  logoutButtonText: {
    fontSize: 13
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8
  },
  walletCard: {
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
  claimBanner: {
    marginBottom: 16
  },
  claimBannerAmount: {
    color: colors.textStrong,
    fontSize: 26,
    fontWeight: '800'
  },
  claimBannerText: {
    color: colors.textSoft,
    marginTop: 8,
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
    borderRadius: radius.md,
    padding: spacing.md
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
    marginBottom: 14
  },
  loadingTag: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
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
    flex: 1
  },
  statCardFull: {
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
  lockedMetricsCard: {
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
  error: {
    color: colors.danger,
    marginBottom: 12
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    padding: 24
  },
  modalCard: {
    marginHorizontal: 0
  },
  modalAmount: {
    color: colors.textStrong,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10
  },
  modalText: {
    color: colors.textSoft,
    lineHeight: 21,
    marginBottom: 10
  },
  modalMeta: {
    color: colors.muted,
    marginBottom: 14
  }
});

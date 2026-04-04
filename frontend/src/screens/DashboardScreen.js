import React, { useCallback, useState } from 'react';
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
import {
  createClaim,
  createPayout,
  fetchWeather,
  getDashboard,
  setupWalletKyc,
  withdrawWalletAmount
} from '../services/api';

const formatCurrency = (value) => `Rs ${Number(value || 0).toFixed(0)}`;
const getKycTone = (status) => {
  if (status === 'VERIFIED') return { label: 'Verified', color: colors.success, bg: colors.primarySoft };
  if (status === 'PENDING') return { label: 'Pending', color: colors.accent, bg: '#F8EBC7' };
  return { label: 'Setup needed', color: colors.danger, bg: '#F7E3DC' };
};

export default function DashboardScreen({ navigation, user }) {
  const [dashboard, setDashboard] = useState(null);
  const [weatherSummary, setWeatherSummary] = useState(null);
  const [eventCity, setEventCity] = useState(user?.city || '');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [kycForm, setKycForm] = useState({
    legalName: '',
    idNumber: '',
    phone: '',
    bankAccountNumber: '',
    ifscCode: ''
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [kycLoading, setKycLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [message, setMessage] = useState('');

  const getLiveWeather = useCallback(async () => {
    try {
      const Location = await import('expo-location');
      const permission = await Location.getForegroundPermissionsAsync();

      if (permission?.status !== 'granted') {
        return fetchWeather({ city: user?.city });
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
        user?.city;

      return fetchWeather({
        city: liveCity,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
    } catch (_error) {
      return fetchWeather({ city: user?.city });
    }
  }, [user?.city]);

  const loadData = useCallback(async (showRefresh = false) => {
    if (!user?._id) {
      navigation.replace('Login');
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [dashboardData, weatherData] = await Promise.all([
        getDashboard(user._id),
        getLiveWeather()
      ]);

      setDashboard(dashboardData);
      setWeatherSummary({
        city: weatherData?.resolvedLocation?.city || weatherData?.city || user?.city || '',
        observedAt: weatherData?.weather?.current?.time || '',
        rain: weatherData?.weather?.current?.rain ?? weatherData?.weather?.hourly?.rain?.[0] ?? 0,
        temp:
          weatherData?.weather?.current?.temperature_2m ??
          weatherData?.weather?.hourly?.temperature_2m?.[0] ??
          0,
        wind: weatherData?.weather?.current?.wind_speed_10m ?? 0,
        aqi: weatherData?.aqi?.value || 0,
        pm25: weatherData?.aqi?.current?.pm2_5 ?? 0
      });
      setKycForm((current) => ({
        legalName: current.legalName || dashboardData?.wallet?.legalName || user?.name || '',
        idNumber: current.idNumber,
        phone: current.phone,
        bankAccountNumber: current.bankAccountNumber,
        ifscCode: current.ifscCode
      }));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getLiveWeather, navigation, user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSimulateRain = async () => {
    if (!user?._id) return;

    setSimulating(true);
    setMessage('');

    try {
      const claimResponse = await createClaim(user._id, 'RAIN', eventCity.trim() || user.city);
      const payoutResponse = await createPayout(
        user._id,
        claimResponse.claim._id,
        'RAIN',
        eventCity.trim() || user.city
      );

      setMessage(`Rain simulated. Claim approved and ${formatCurrency(payoutResponse.payout)} moved to wallet.`);
      await loadData(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSimulating(false);
    }
  };

  const handleKycChange = (field, value) => {
    setKycForm((current) => ({ ...current, [field]: value }));
  };

  const handleCompleteKyc = async () => {
    if (!user?._id) return;

    setKycLoading(true);
    setMessage('');

    try {
      const response = await setupWalletKyc({
        userId: user._id,
        ...kycForm
      });
      setMessage(response.message);
      await loadData(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setKycLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!user?._id) return;

    setWithdrawLoading(true);
    setMessage('');

    try {
      const response = await withdrawWalletAmount({
        userId: user._id,
        amount: Number(withdrawAmount)
      });
      setWithdrawAmount('');
      setMessage(response.message);
      await loadData(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const claims = dashboard?.claims || [];
  const wallet = dashboard?.wallet || {};
  const monthlyInsurance = dashboard?.monthlyInsurance || {};
  const canWithdraw = wallet.isKycVerified && Number(wallet.balance || 0) > 0;
  const kycTone = getKycTone(wallet.kycStatus);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />
        }
      >
        <Text style={styles.eyebrow}>Operations</Text>
        <Text style={styles.title}>Claims, monthly insurance, and wallet controls</Text>
        <Text style={styles.subtitle}>
          Weekly policy premiums are tracked monthly, approved payouts land in the wallet, and
          withdrawals only go to the verified primary bank account.
        </Text>

        <View style={styles.weatherCard}>
          <Text style={styles.cardTitle}>Live risk snapshot</Text>
          <Text style={styles.weatherLine}>City: {weatherSummary?.city || 'Unavailable'}</Text>
          <Text style={styles.weatherLine}>Updated: {weatherSummary?.observedAt || 'Unavailable'}</Text>
          <Text style={styles.weatherLine}>Rain now: {weatherSummary?.rain || 0} mm</Text>
          <Text style={styles.weatherLine}>Temperature now: {weatherSummary?.temp || 0} C</Text>
          <Text style={styles.weatherLine}>Wind now: {weatherSummary?.wind || 0} km/h</Text>
          <Text style={styles.weatherLine}>US AQI: {weatherSummary?.aqi || 0}</Text>
          <Text style={styles.weatherLine}>PM2.5: {weatherSummary?.pm25 || 0}</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Wallet balance</Text>
            <Text style={styles.metricValue}>{formatCurrency(wallet.balance || 0)}</Text>
            <Text style={styles.metricMeta}>Ready to withdraw after bank-linked KYC</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Weekly collected</Text>
            <Text style={styles.metricValue}>{formatCurrency(wallet.weeklyCollected || 0)}</Text>
            <Text style={styles.metricMeta}>Approved weekly payouts credited into wallet</Text>
          </View>
        </View>

        <View style={styles.monthlyCard}>
          <Text style={styles.cardTitle}>Monthly insurance tracker</Text>
          <Text style={styles.monthlyAmount}>{formatCurrency(monthlyInsurance.totalPremium || 0)}</Text>
          <Text style={styles.cardHint}>
            {monthlyInsurance.monthLabel || 'Current month'} premium total across{' '}
            {monthlyInsurance.weeklyPolicies || 0} weekly policies.
          </Text>
          <Text style={styles.cardHint}>
            Active coverage right now: {formatCurrency(monthlyInsurance.activeCoverage || 0)}
          </Text>
          {(monthlyInsurance.entries || []).slice(0, 3).map((entry) => (
            <View key={entry._id} style={styles.monthlyEntry}>
              <Text style={styles.monthlyEntryText}>
                {formatCurrency(entry.premium)} premium for {formatCurrency(entry.coverage)} coverage
              </Text>
              <Text style={styles.monthlyEntryMeta}>
                {new Date(entry.startDate).toLocaleDateString()} to{' '}
                {new Date(entry.endDate).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View>
              <Text style={styles.cardTitle}>Wallet and bank transfer</Text>
              <Text style={styles.cardHint}>
                Only the live wallet balance can be withdrawn, and every transfer goes to the
                verified primary bank account.
              </Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: kycTone.bg }]}>
              <Text style={[styles.statusChipText, { color: kycTone.color }]}>{kycTone.label}</Text>
            </View>
          </View>

          <View style={styles.walletGrid}>
            <View style={styles.walletStatBox}>
              <Text style={styles.walletStatLabel}>Available now</Text>
              <Text style={styles.walletStatValue}>{formatCurrency(wallet.balance || 0)}</Text>
            </View>
            <View style={styles.walletStatBox}>
              <Text style={styles.walletStatLabel}>Transferred out</Text>
              <Text style={styles.walletStatValue}>{formatCurrency(wallet.totalWithdrawn || 0)}</Text>
            </View>
          </View>

          <View style={styles.bankPanel}>
            <Text style={styles.bankTitle}>Primary payout account</Text>
            <Text style={styles.walletLine}>
              Holder name: {wallet.legalName || user?.name || 'Not added yet'}
            </Text>
            <Text style={styles.walletLine}>
              Linked bank account: {wallet.bankAccountMasked || 'Not linked yet'}
            </Text>
            {wallet.lastWithdrawalAt ? (
              <Text style={styles.walletLine}>
                Last transfer: {new Date(wallet.lastWithdrawalAt).toLocaleString()}
              </Text>
            ) : (
              <Text style={styles.walletLine}>No transfer has been made yet.</Text>
            )}
          </View>

          {!wallet.isKycVerified ? (
            <>
              <Text style={styles.sectionLabel}>Step 1: Complete wallet KYC</Text>
              <Text style={styles.sectionHint}>
                Add identity and bank details once. After verification, the wallet stays linked to
                this primary account for direct claims.
              </Text>
              <TextInput
                style={styles.input}
                value={kycForm.legalName}
                onChangeText={(value) => handleKycChange('legalName', value)}
                placeholder="Legal name"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={kycForm.idNumber}
                onChangeText={(value) => handleKycChange('idNumber', value)}
                placeholder="Government ID number"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={kycForm.phone}
                onChangeText={(value) => handleKycChange('phone', value)}
                placeholder="Phone number"
                placeholderTextColor={colors.placeholder}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.input}
                value={kycForm.bankAccountNumber}
                onChangeText={(value) => handleKycChange('bankAccountNumber', value)}
                placeholder="Primary bank account number"
                placeholderTextColor={colors.placeholder}
                keyboardType="number-pad"
              />
              <TextInput
                style={styles.input}
                value={kycForm.ifscCode}
                onChangeText={(value) => handleKycChange('ifscCode', value.toUpperCase())}
                placeholder="IFSC code"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={styles.primaryButton} onPress={handleCompleteKyc} disabled={kycLoading}>
                {kycLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Verify KYC and link bank</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Step 2: Withdraw to primary bank account</Text>
              <Text style={styles.sectionHint}>
                You can transfer only the amount available in wallet balance. Claims remain ready
                in the wallet until you need them.
              </Text>
              <TextInput
                style={styles.input}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder={`Available ${formatCurrency(wallet.balance || 0)}`}
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.primaryButton, !canWithdraw && styles.buttonDisabled]}
                onPress={handleWithdraw}
                disabled={!canWithdraw || withdrawLoading}
              >
                {withdrawLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Transfer from wallet</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.simulationCard}>
          <Text style={styles.cardTitle}>Simulate Rain</Text>
          <Text style={styles.cardHint}>
            Use the worker city for a valid payout, or another city to trigger fraud detection.
          </Text>
          <TextInput
            style={styles.input}
            value={eventCity}
            onChangeText={setEventCity}
            placeholder="Event city"
            placeholderTextColor={colors.placeholder}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleSimulateRain} disabled={simulating}>
            {simulating ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Simulate Rain</Text>}
          </TouchableOpacity>
          {message ? (
            <Text style={[styles.message, message.toLowerCase().includes('reject') ? styles.errorMessage : null]}>
              {message}
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Recent claims</Text>
        {claims.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No claims yet</Text>
            <Text style={styles.emptyText}>Use the rain simulation to generate a claim and payout record.</Text>
          </View>
        ) : (
          claims.map((claim) => (
            <View key={claim._id} style={styles.claimCard}>
              <View style={styles.claimTopRow}>
                <Text style={styles.claimType}>{claim.triggerType}</Text>
                <Text style={styles.claimAmount}>{formatCurrency(claim.payout)}</Text>
              </View>
              <Text style={styles.claimStatus}>{claim.status}</Text>
              <Text style={styles.claimMeta}>{new Date(claim.createdAt).toLocaleString()}</Text>
              <Text style={styles.claimMeta}>Event city: {claim.eventCity || user?.city}</Text>
              {claim.reason ? <Text style={styles.claimReason}>{claim.reason}</Text> : null}
            </View>
          ))
        )}
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
    paddingBottom: 36
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
    marginTop: 10
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 18
  },
  weatherCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },
  monthlyCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },
  walletCard: {
    backgroundColor: '#EEF4F1',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10
  },
  cardHint: {
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12
  },
  weatherLine: {
    color: colors.textSoft,
    marginBottom: 6
  },
  walletLine: {
    color: colors.textSoft,
    marginBottom: 6
  },
  walletGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14
  },
  walletStatBox: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border
  },
  walletStatLabel: {
    color: colors.muted,
    fontSize: 12
  },
  walletStatValue: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700'
  },
  bankPanel: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12
  },
  bankTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 10
  },
  monthlyAmount: {
    color: colors.textStrong,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8
  },
  monthlyEntry: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 12,
    marginTop: 10
  },
  monthlyEntryText: {
    color: colors.text,
    fontWeight: '700'
  },
  monthlyEntryMeta: {
    color: colors.muted,
    marginTop: 4
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 12
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    padding: 18
  },
  metricLabel: {
    color: colors.primary,
    fontSize: 13
  },
  metricValue: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8
  },
  metricMeta: {
    color: colors.muted,
    marginTop: 8,
    lineHeight: 18
  },
  simulationCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20
  },
  sectionLabel: {
    color: colors.primary,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 10
  },
  sectionHint: {
    color: colors.muted,
    lineHeight: 19,
    marginBottom: 12
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.textStrong,
    marginBottom: 12
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15
  },
  buttonDisabled: {
    opacity: 0.45
  },
  message: {
    color: colors.success,
    lineHeight: 20,
    marginTop: 12
  },
  errorMessage: {
    color: colors.danger
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12
  },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 20
  },
  claimCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12
  },
  claimTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  claimType: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  claimAmount: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700'
  },
  claimStatus: {
    color: colors.success,
    marginTop: 8,
    fontWeight: '700'
  },
  claimMeta: {
    color: colors.muted,
    marginTop: 6
  },
  claimReason: {
    color: colors.textSoft,
    marginTop: 10,
    lineHeight: 20
  }
});

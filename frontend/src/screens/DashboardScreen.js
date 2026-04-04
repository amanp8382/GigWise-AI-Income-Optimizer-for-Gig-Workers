import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
  collectAutoClaim,
  fetchWeather,
  getDashboard,
  setupWalletKyc,
  withdrawWalletAmount
} from '../services/api';

const formatCurrency = (value) => `Rs ${Number(value || 0).toFixed(0)}`;
const getKycTone = (status) => {
  if (status === 'VERIFIED') return { label: 'Verified', color: colors.success, bg: '#DCFCE7' };
  if (status === 'PENDING') return { label: 'Pending', color: '#B45309', bg: '#FEF3C7' };
  return { label: 'Setup needed', color: colors.danger, bg: '#FEE2E2' };
};

export default function DashboardScreen({ navigation, user }) {
  const [dashboard, setDashboard] = useState(null);
  const [weatherSummary, setWeatherSummary] = useState(null);
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
  const [kycLoading, setKycLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [autoClaimLoading, setAutoClaimLoading] = useState(false);
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

  const handleCollectLiveClaim = async () => {
    if (!user?._id) return;

    setAutoClaimLoading(true);
    setMessage('');

    try {
      const response = await collectAutoClaim({
        userId: user._id,
        city: weatherSummary?.city || user.city
      });
      setMessage(response.message);
      await loadData(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setAutoClaimLoading(false);
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
  const autoClaim = dashboard?.autoClaim || {};
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
        <AppHeader
          eyebrow="Operations"
          title="Claims, monthly insurance, and wallet controls"
          subtitle="Weekly policy premiums are tracked monthly, approved payouts land in the wallet, and withdrawals only go to the verified primary bank account."
        />

        <AppCard style={styles.weatherCard}>
          <Text style={styles.cardTitle}>Live risk snapshot</Text>
          <Text style={styles.weatherLine}>City: {weatherSummary?.city || 'Unavailable'}</Text>
          <Text style={styles.weatherLine}>Updated: {weatherSummary?.observedAt || 'Unavailable'}</Text>
          <Text style={styles.weatherLine}>Rain now: {weatherSummary?.rain || 0} mm</Text>
          <Text style={styles.weatherLine}>Temperature now: {weatherSummary?.temp || 0} C</Text>
          <Text style={styles.weatherLine}>Wind now: {weatherSummary?.wind || 0} km/h</Text>
          <Text style={styles.weatherLine}>US AQI: {weatherSummary?.aqi || 0}</Text>
          <Text style={styles.weatherLine}>PM2.5: {weatherSummary?.pm25 || 0}</Text>
        </AppCard>

        <View style={styles.metricsRow}>
          <AppCard tone="soft" style={styles.metricCard}>
            <Text style={styles.metricLabel}>Wallet balance</Text>
            <Text style={styles.metricValue}>{formatCurrency(wallet.balance || 0)}</Text>
            <Text style={styles.metricMeta}>Ready to withdraw after bank-linked KYC</Text>
          </AppCard>
          <AppCard tone="soft" style={styles.metricCard}>
            <Text style={styles.metricLabel}>Weekly collected</Text>
            <Text style={styles.metricValue}>{formatCurrency(wallet.weeklyCollected || 0)}</Text>
            <Text style={styles.metricMeta}>Approved weekly payouts credited into wallet</Text>
          </AppCard>
        </View>

        <AppCard style={styles.monthlyCard}>
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
        </AppCard>

        <AppCard style={styles.monthlyCard}>
          <Text style={styles.cardTitle}>Live rain claim status</Text>
          <Text style={styles.cardHint}>
            Rain claims are detected automatically from live worker-area weather. Higher work hours,
            more orders, and harsher weather increase the claim amount.
          </Text>
          <Text style={styles.monthlyAmount}>{formatCurrency(autoClaim.suggestedAmount || 0)}</Text>
          <Text style={styles.cardHint}>
            {autoClaim.explanation ||
              (weatherSummary?.rain > 0
                ? 'Rain is present. The app is checking claim readiness.'
                : 'No live rain detected right now.')}
          </Text>
          <Text style={styles.weatherLine}>
            Status:{' '}
            {autoClaim.canCollect
              ? 'Ready to collect'
              : autoClaim.requiresKyc && autoClaim.suggestedAmount
              ? 'Complete KYC to collect'
              : autoClaim.cooldownActive
              ? 'Recent claim cooldown active'
              : 'Waiting for rain trigger'}
          </Text>
          <AppButton
            title="Collect Live Claim"
            onPress={handleCollectLiveClaim}
            loading={autoClaimLoading}
            disabled={!autoClaim.canCollect}
          />
        </AppCard>

        <AppCard tone="accent" style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.walletHeaderCopy}>
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
              <AppInput
                label="Legal name"
                value={kycForm.legalName}
                onChangeText={(value) => handleKycChange('legalName', value)}
                placeholder="Legal name"
              />
              <AppInput
                label="Government ID number"
                value={kycForm.idNumber}
                onChangeText={(value) => handleKycChange('idNumber', value)}
                placeholder="Government ID number"
              />
              <AppInput
                label="Phone number"
                value={kycForm.phone}
                onChangeText={(value) => handleKycChange('phone', value)}
                placeholder="Phone number"
                keyboardType="phone-pad"
              />
              <AppInput
                label="Primary bank account number"
                value={kycForm.bankAccountNumber}
                onChangeText={(value) => handleKycChange('bankAccountNumber', value)}
                placeholder="Primary bank account number"
                keyboardType="number-pad"
              />
              <AppInput
                label="IFSC code"
                value={kycForm.ifscCode}
                onChangeText={(value) => handleKycChange('ifscCode', value.toUpperCase())}
                placeholder="IFSC code"
                autoCapitalize="characters"
              />
              <AppButton title="Verify KYC and link bank" onPress={handleCompleteKyc} loading={kycLoading} />
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Step 2: Withdraw to primary bank account</Text>
              <Text style={styles.sectionHint}>
                You can transfer only the amount available in wallet balance. Claims remain ready
                in the wallet until you need them.
              </Text>
              <AppInput
                label="Withdraw amount"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder={`Available ${formatCurrency(wallet.balance || 0)}`}
                keyboardType="numeric"
              />
              <AppButton
                title="Transfer from wallet"
                onPress={handleWithdraw}
                disabled={!canWithdraw}
                loading={withdrawLoading}
              />
            </>
          )}
        </AppCard>

        {message ? (
          <Text
            style={[
              styles.message,
              message.toLowerCase().includes('reject') || message.toLowerCase().includes('complete kyc')
                ? styles.errorMessage
                : null
            ]}
          >
            {message}
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Recent claims</Text>
        {claims.length === 0 ? (
          <AppCard style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No claims yet</Text>
            <Text style={styles.emptyText}>When rain is detected in the worker area, a live claim becomes available here.</Text>
          </AppCard>
        ) : (
          claims.map((claim) => (
            <AppCard key={claim._id} style={styles.claimCard}>
              <View style={styles.claimTopRow}>
                <Text style={styles.claimType}>{claim.triggerType}</Text>
                <Text style={styles.claimAmount}>{formatCurrency(claim.payout)}</Text>
              </View>
              <Text style={styles.claimStatus}>{claim.status}</Text>
              <Text style={styles.claimMeta}>{new Date(claim.createdAt).toLocaleString()}</Text>
              <Text style={styles.claimMeta}>Event city: {claim.eventCity || user?.city}</Text>
              {claim.reason ? <Text style={styles.claimReason}>{claim.reason}</Text> : null}
            </AppCard>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  weatherCard: {
    marginBottom: spacing.md
  },
  monthlyCard: {
    marginBottom: spacing.md
  },
  walletCard: {
    marginBottom: spacing.lg
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md
  },
  walletHeaderCopy: {
    flex: 1
  },
  cardTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm
  },
  cardHint: {
    color: colors.muted,
    lineHeight: 20,
    marginBottom: spacing.md
  },
  weatherLine: {
    color: colors.textSoft,
    marginBottom: spacing.xs
  },
  walletLine: {
    color: colors.textSoft,
    marginBottom: spacing.xs
  },
  walletGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md
  },
  walletStatBox: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
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
    marginTop: spacing.sm
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700'
  },
  bankPanel: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  bankTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.sm
  },
  monthlyAmount: {
    color: colors.textStrong,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: spacing.sm
  },
  monthlyEntry: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm
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
    marginBottom: spacing.md,
    gap: spacing.md
  },
  metricCard: {
    flex: 1
  },
  metricLabel: {
    color: colors.primary,
    fontSize: 13
  },
  metricValue: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: '800',
    marginTop: spacing.sm
  },
  metricMeta: {
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: 18
  },
  sectionLabel: {
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  sectionHint: {
    color: colors.muted,
    lineHeight: 19,
    marginBottom: spacing.md
  },
  message: {
    color: colors.success,
    lineHeight: 20,
    marginTop: spacing.sm
  },
  errorMessage: {
    color: colors.danger
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md
  },
  emptyState: {
    marginBottom: spacing.md
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
    marginBottom: spacing.md
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
    marginTop: spacing.sm,
    fontWeight: '700'
  },
  claimMeta: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  claimReason: {
    color: colors.textSoft,
    marginTop: spacing.sm,
    lineHeight: 20
  }
});

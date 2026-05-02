import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

type DashboardStats = {
  totalProperties: number;
  totalTenants: number;
  totalArrears: number;
  totalCollected: number;
  activeTenants: number;
};

type RecentPayment = {
  id: string;
  tenantName: string;
  roomCode: string;
  amount: number;
  date: Date;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { landlordId, user } = useAuth();   // ✅ use landlordId

  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0,
    totalTenants: 0,
    totalArrears: 0,
    totalCollected: 0,
    activeTenants: 0,
  });

  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = async () => {
    if (!landlordId) return;

    try {
      // PROPERTIES
      const propertiesQuery = query(collection(db, 'properties'), where('landlordId', '==', landlordId));
      const propertiesSnapshot = await getDocs(propertiesQuery);
      const totalProperties = propertiesSnapshot.size;

      // TENANTS
      const tenantsQuery = query(collection(db, 'tenants'), where('landlordId', '==', landlordId));
      const tenantsSnapshot = await getDocs(tenantsQuery);

      const tenants = tenantsSnapshot.docs.map(doc => doc.data());
      const totalTenants = tenants.length;
      const activeTenants = tenants.filter((t: any) => t.status === 'active').length;
      const totalArrears = tenants.reduce((sum: number, t: any) => sum + (Number(t.balance) || 0), 0);

      // PAYMENTS (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const paymentsQuery = query(collection(db, 'payments'), where('landlordId', '==', landlordId));
      const paymentsSnapshot = await getDocs(paymentsQuery);

      const payments = paymentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          tenantName: data.tenantName || 'Unknown',
          roomCode: data.roomCode || '',
          amount: Number(data.amount) || 0,
          date: data.date?.toDate ? data.date.toDate() : new Date(),
        };
      }) as RecentPayment[];

      // Filter last 30 days
      const recentPaymentsFiltered = payments.filter(p => p.date >= thirtyDaysAgo);
      const totalCollected = recentPaymentsFiltered.reduce((sum, p) => sum + p.amount, 0);
      const recent = payments.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

      setStats({
        totalProperties,
        totalTenants,
        totalArrears,
        totalCollected,
        activeTenants,
      });

      setRecentPayments(recent);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (landlordId) loadDashboardData();
  }, [landlordId]);

  const onRefresh = useCallback(() => {
    if (!landlordId) return;
    setRefreshing(true);
    loadDashboardData();
  }, [landlordId]);

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;
  const formatDate = (date: Date) => date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome back!</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalProperties}</Text>
          <Text style={styles.statLabel}>Properties</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalTenants}</Text>
          <Text style={styles.statLabel}>Tenants</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.activeTenants}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
      </View>

      <View style={styles.financialContainer}>
        <View style={styles.financialCard}>
          <Text style={styles.financialLabel}>Total Arrears</Text>
          <Text style={[styles.financialAmount, styles.arrears]}>{formatCurrency(stats.totalArrears)}</Text>
        </View>
        <View style={styles.financialCard}>
          <Text style={styles.financialLabel}>Collected (30d)</Text>
          <Text style={[styles.financialAmount, styles.collected]}>{formatCurrency(stats.totalCollected)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/add-property')}>
            <Text style={styles.actionIcon}>🏢</Text>
            <Text style={styles.actionText}>Add Property</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/tenants')}>
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionText}>Add Tenant</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/payments')}>
            <Text style={styles.actionIcon}>💰</Text>
            <Text style={styles.actionText}>Record Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/auto-rent')}>
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionText}>Auto Rent</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/unmatched-payments')}>
            <Text style={styles.actionIcon}>⚠️</Text>
            <Text style={styles.actionText}>Unmatched</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/reports')}>
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionText}>Reports</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Payments</Text>
        {recentPayments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recent payments</Text>
            <Text style={styles.emptySubtext}>Record a payment to see it here</Text>
          </View>
        ) : (
          recentPayments.map((payment) => (
            <View key={payment.id} style={styles.paymentItem}>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>{payment.tenantName}</Text>
                <Text style={styles.paymentRoom}>{payment.roomCode}</Text>
              </View>
              <View style={styles.paymentDetails}>
                <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                <Text style={styles.paymentDate}>{formatDate(payment.date)}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// styles remain exactly as you had them – copy the styles from your current file to keep unchanged.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#27ae60', padding: 20, paddingTop: 60, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  welcome: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  email: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 5 },
  settingsIcon: { fontSize: 28, color: 'white' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, marginTop: -20 },
  statCard: { backgroundColor: 'white', borderRadius: 12, padding: 15, alignItems: 'center', flex: 0.31, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  statLabel: { fontSize: 12, color: '#7f8c8d', marginTop: 5 },
  financialContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 15 },
  financialCard: { backgroundColor: 'white', borderRadius: 12, padding: 15, flex: 0.48, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  financialLabel: { fontSize: 12, color: '#7f8c8d', marginBottom: 5 },
  financialAmount: { fontSize: 20, fontWeight: 'bold' },
  arrears: { color: '#e74c3c' },
  collected: { color: '#27ae60' },
  section: { backgroundColor: 'white', margin: 15, marginTop: 0, padding: 15, borderRadius: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#2c3e50' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionButton: { width: '48%', backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  actionIcon: { fontSize: 24, marginBottom: 5 },
  actionText: { fontSize: 12, color: '#2c3e50', textAlign: 'center' },
  paymentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  paymentInfo: { flex: 1 },
  paymentName: { fontSize: 16, fontWeight: '500', color: '#2c3e50' },
  paymentRoom: { fontSize: 12, color: '#7f8c8d', marginTop: 2 },
  paymentDetails: { alignItems: 'flex-end' },
  paymentAmount: { fontSize: 16, fontWeight: '600', color: '#27ae60' },
  paymentDate: { fontSize: 11, color: '#95a5a6', marginTop: 2 },
  emptyContainer: { alignItems: 'center', padding: 30 },
  emptyText: { fontSize: 14, color: '#95a5a6' },
  emptySubtext: { fontSize: 12, color: '#bdc3c7', marginTop: 5 },
});
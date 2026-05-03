import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db, tenantsCollection } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc, addDoc, Timestamp, query, where } from 'firebase/firestore';

type Tenant = {
  id: string;
  name: string;
  roomCode: string;
  monthlyRent: number;
  balance: number;
  status: string;
  landlordId: string;
};

export default function AutoRentScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastRentDate, setLastRentDate] = useState<string | null>(null);

  useEffect(() => {
    if (landlordId) loadData();
  }, [landlordId]);

  const loadData = async (showLoading = true) => {
    if (!landlordId) return;
    if (showLoading) setIsLoading(true);
    try {
      const q = query(tenantsCollection, where('landlordId', '==', landlordId));
      const tenantsSnapshot = await getDocs(q);
      const tenantsList: Tenant[] = [];
      tenantsSnapshot.forEach((doc) => {
        const data = doc.data();
        tenantsList.push({
          id: doc.id,
          name: data.name || 'Unknown',
          roomCode: data.roomCode || 'N/A',
          monthlyRent: data.monthlyRent || 0,
          balance: data.balance || 0,
          status: data.status || 'active',
          landlordId: data.landlordId,
        });
      });
      setTenants(tenantsList);
      const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
      setLastRentDate(currentMonth);
    } catch (error: any) {
      console.error('Error loading tenants:', error);
      Alert.alert('Error', 'Failed to load tenants: ' + error.message);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, [landlordId]);

  const generateRent = async () => {
    if (isProcessing) return;
    const activeTenants = tenants.filter(t => t.status === 'active');
    if (activeTenants.length === 0) {
      Alert.alert('No Active Tenants', 'There are no active tenants to generate rent for.');
      return;
    }
    const totalRent = activeTenants.reduce((sum, t) => sum + t.monthlyRent, 0);
    Alert.alert(
      'Generate Monthly Rent',
      `This will add rent for ${activeTenants.length} active tenant(s).\n\nTotal rent to add: KES ${totalRent.toLocaleString()}\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: processRentGeneration }
      ]
    );
  };

  const processRentGeneration = async () => {
    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const errors: string[] = [];

    try {
      const activeTenants = tenants.filter(t => t.status === 'active');
      for (const tenant of activeTenants) {
        try {
          const tenantRef = doc(db, 'tenants', tenant.id);
          const newBalance = (tenant.balance || 0) + (tenant.monthlyRent || 0);
          await updateDoc(tenantRef, {
            balance: newBalance,
            lastRentGenerated: Timestamp.now(),
            lastRentMonth: currentMonth,
          });
          // Write to rentGenerations collection – ensure this collection exists in Firestore
          await addDoc(collection(db, 'rentGenerations'), {
            tenantId: tenant.id,
            tenantName: tenant.name,
            roomCode: tenant.roomCode,
            amount: tenant.monthlyRent,
            month: currentMonth,
            date: Timestamp.now(),
            type: 'auto',
            previousBalance: tenant.balance,
            newBalance: newBalance,
            landlordId: landlordId,
          });
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(`${tenant.name}: ${error.message}`);
          console.error(`Failed for ${tenant.name}:`, error);
        }
      }
      let message = `✅ Success: ${successCount} tenants\n❌ Failed: ${errorCount} tenants\n\nMonth: ${currentMonth}`;
      if (errors.length > 0 && errors.length <= 3) message += `\n\nErrors:\n${errors.join('\n')}`;
      Alert.alert('Rent Generation Complete', message, [
        { text: 'OK', onPress: () => { loadData(false); router.back(); } }
      ]);
    } catch (error: any) {
      console.error('Rent generation error:', error);
      Alert.alert('Error', 'Failed to generate rent: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => `KES ${(amount || 0).toLocaleString()}`;
  const getTotalActiveRent = () => tenants.filter(t => t.status === 'active').reduce((sum, t) => sum + (t.monthlyRent || 0), 0);
  const getTotalArrears = () => tenants.reduce((sum, t) => sum + ((t.balance || 0) > 0 ? (t.balance || 0) : 0), 0);
  const activeTenants = tenants.filter(t => t.status === 'active');

  if (isLoading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#27ae60" />
        <Text style={styles.loadingText}>Loading tenants...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Auto Rent Generation</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Monthly Rent</Text>
        <Text style={styles.cardSubtitle}>Generate rent for all active tenants. This adds one month's rent to each tenant's balance.</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current Month:</Text>
          <Text style={styles.infoValue}>{lastRentDate || 'Not set'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Active Tenants:</Text>
          <Text style={styles.infoValue}>{activeTenants.length}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Rent to Add:</Text>
          <Text style={[styles.infoValue, styles.totalAmount]}>{formatCurrency(getTotalActiveRent())}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current Total Arrears:</Text>
          <Text style={[styles.infoValue, styles.arrearsAmount]}>{formatCurrency(getTotalArrears())}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>👥 Active Tenants ({activeTenants.length})</Text>
        {activeTenants.length === 0 ? (
          <Text style={styles.emptyText}>No active tenants</Text>
        ) : (
          activeTenants.map((tenant) => (
            <View key={tenant.id} style={styles.tenantPreview}>
              <View style={styles.tenantLeft}>
                <Text style={styles.tenantName}>{tenant.name}</Text>
                <Text style={styles.tenantRoom}>{tenant.roomCode}</Text>
              </View>
              <View style={styles.tenantRight}>
                <Text style={styles.tenantRent}>Rent: {formatCurrency(tenant.monthlyRent)}</Text>
                <Text style={styles.tenantCurrentBalance}>Current: {formatCurrency(tenant.balance)}</Text>
                <Text style={styles.tenantNewBalance}>→ New: {formatCurrency((tenant.balance || 0) + (tenant.monthlyRent || 0))}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity
        style={[styles.generateButton, (isProcessing || activeTenants.length === 0) && styles.disabledButton]}
        onPress={generateRent}
        disabled={isProcessing || activeTenants.length === 0}
      >
        <Text style={styles.generateButtonText}>{isProcessing ? 'Generating...' : 'Generate Monthly Rent'}</Text>
      </TouchableOpacity>

      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>⚠️ Important Notes</Text>
        <Text style={styles.warningText}>• This adds rent to ALL active tenants</Text>
        <Text style={styles.warningText}>• Run this on the 1st of each month</Text>
        <Text style={styles.warningText}>• Can be run multiple times (will double-charge)</Text>
        <Text style={styles.warningText}>• Inactive tenants are excluded</Text>
        <Text style={styles.warningText}>• All transactions are logged for audit</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#7f8c8d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  backButton: { padding: 5 },
  backText: { fontSize: 16, color: '#27ae60' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  card: { backgroundColor: 'white', borderRadius: 12, margin: 15, marginTop: 15, padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#2c3e50', marginBottom: 8 },
  cardSubtitle: { fontSize: 13, color: '#7f8c8d', marginBottom: 15, lineHeight: 18 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoLabel: { fontSize: 14, color: '#7f8c8d' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#2c3e50' },
  totalAmount: { fontSize: 16, fontWeight: 'bold', color: '#27ae60' },
  arrearsAmount: { fontSize: 16, fontWeight: 'bold', color: '#e74c3c' },
  tenantPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tenantLeft: { flex: 1 },
  tenantName: { fontSize: 15, fontWeight: '500', color: '#2c3e50' },
  tenantRoom: { fontSize: 11, color: '#7f8c8d', marginTop: 2 },
  tenantRight: { alignItems: 'flex-end' },
  tenantRent: { fontSize: 12, color: '#27ae60' },
  tenantCurrentBalance: { fontSize: 11, color: '#e74c3c', marginTop: 2 },
  tenantNewBalance: { fontSize: 12, fontWeight: 'bold', color: '#2c3e50', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#95a5a6', padding: 20 },
  generateButton: { backgroundColor: '#27ae60', margin: 15, padding: 16, borderRadius: 8, alignItems: 'center' },
  disabledButton: { backgroundColor: '#95a5a6' },
  generateButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  warningCard: { backgroundColor: '#fff3e0', borderRadius: 12, margin: 15, marginTop: 0, marginBottom: 30, padding: 15, borderWidth: 1, borderColor: '#f39c12' },
  warningTitle: { fontSize: 14, fontWeight: 'bold', color: '#f39c12', marginBottom: 8 },
  warningText: { fontSize: 12, color: '#7f8c8d', marginBottom: 4 },
});
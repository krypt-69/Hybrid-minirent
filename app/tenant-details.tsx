import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db, tenantsCollection, paymentsCollection } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

type Tenant = {
  id: string;
  name: string;
  phone: string;
  propertyId: string;
  propertyName?: string;
  room: string;
  roomCode: string;
  monthlyRent: number;
  balance: number;
  status: string;
  createdAt: string;
  landlordId?: string;
};

type Payment = {
  id: string;
  amount: number;
  date: Date;
  source: string;
  transactionCode?: string;
};

export default function TenantDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { landlordId } = useAuth();   // ✅ use landlordId
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRent, setEditRent] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (id && landlordId) {
      loadTenantDetails();
    }
  }, [id, landlordId]);

  const loadTenantDetails = async () => {
    if (!landlordId) return;
    try {
      // Load tenant details - verify it belongs to this landlord
      const tenantDoc = await getDoc(doc(db, 'tenants', id as string));
      if (tenantDoc.exists()) {
        const data = tenantDoc.data();
        
        // Security check: ensure tenant belongs to current landlord
        if (data.landlordId !== landlordId) {
          Alert.alert('Error', 'You do not have permission to view this tenant');
          router.back();
          return;
        }
        
        setTenant({
          id: tenantDoc.id,
          name: data.name,
          phone: data.phone,
          propertyId: data.propertyId,
          room: data.room,
          roomCode: data.roomCode,
          monthlyRent: data.monthlyRent,
          balance: data.balance || 0,
          status: data.status || 'active',
          createdAt: data.createdAt,
        });
        
        setEditName(data.name);
        setEditPhone(data.phone);
        setEditRent(data.monthlyRent.toString());
      }

      // Load payment history - only payments for this tenant (or all payments under this landlord? Original code fetched all payments for landlord, but we can filter by tenantId)
      // I'll modify to filter by tenantId to be more efficient.
      const paymentsQuery = query(
        paymentsCollection,
        where('tenantId', '==', id as string),   // ✅ get only this tenant's payments
        where('landlordId', '==', landlordId)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsList: Payment[] = [];
      paymentsSnapshot.forEach((doc) => {
        const data = doc.data();
        paymentsList.push({
          id: doc.id,
          amount: data.amount,
          date: data.date?.toDate() || new Date(),
          source: data.source,
          transactionCode: data.transactionCode,
        });
      });
      // Sort newest first
      paymentsList.sort((a, b) => b.date.getTime() - a.date.getTime());
      setPayments(paymentsList);
    } catch (error) {
      console.error('Error loading tenant details:', error);
      Alert.alert('Error', 'Failed to load tenant details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTenant = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Please enter tenant name');
      return;
    }
    if (!editPhone.trim()) {
      Alert.alert('Error', 'Please enter phone number');
      return;
    }
    if (!editRent || parseFloat(editRent) <= 0) {
      Alert.alert('Error', 'Please enter valid monthly rent');
      return;
    }

    setIsUpdating(true);
    try {
      const tenantRef = doc(db, 'tenants', id as string);
      await updateDoc(tenantRef, {
        name: editName.trim(),
        phone: editPhone.trim(),
        monthlyRent: parseFloat(editRent),
      });
      
      Alert.alert('Success', 'Tenant details updated');
      setEditModalVisible(false);
      loadTenantDetails();
    } catch (error) {
      console.error('Error updating tenant:', error);
      Alert.alert('Error', 'Failed to update tenant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkInactive = async () => {
    Alert.alert(
      'Mark as Inactive',
      `Are you sure you want to mark ${tenant?.name} as inactive?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'tenants', id as string), {
                status: 'inactive',
              });
              Alert.alert('Success', 'Tenant marked as inactive');
              loadTenantDetails();
            } catch (error) {
              Alert.alert('Error', 'Failed to update status');
            }
          }
        }
      ]
    );
  };

  const handleReactivate = async () => {
    try {
      await updateDoc(doc(db, 'tenants', id as string), {
        status: 'active',
      });
      Alert.alert('Success', 'Tenant reactivated');
      loadTenantDetails();
    } catch (error) {
      Alert.alert('Error', 'Failed to reactivate tenant');
    }
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString()}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-KE', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'mpesa': return '📱';
      case 'manual': return '✍️';
      case 'whatsapp': return '💬';
      default: return '💰';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#27ae60" />
      </View>
    );
  }

  if (!tenant) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Tenant not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tenant Details</Text>
        <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Tenant Info Card */}
      <View style={styles.card}>
        <View style={styles.nameSection}>
          <Text style={styles.tenantName}>{tenant.name}</Text>
          <View style={[styles.statusBadge, tenant.status === 'active' ? styles.activeBadge : styles.inactiveBadge]}>
            <Text style={styles.statusText}>{tenant.status === 'active' ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoValue}>{tenant.phone}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Room Code:</Text>
          <Text style={[styles.infoValue, styles.roomCode]}>{tenant.roomCode}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Room Number:</Text>
          <Text style={styles.infoValue}>{tenant.room}</Text>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.financialRow}>
          <View>
            <Text style={styles.financialLabel}>Monthly Rent</Text>
            <Text style={styles.financialValue}>{formatCurrency(tenant.monthlyRent)}</Text>
          </View>
          <View>
            <Text style={styles.financialLabel}>Current Balance</Text>
            <Text style={[styles.financialValue, tenant.balance > 0 ? styles.balanceDue : styles.balancePaid]}>
              {formatCurrency(Math.abs(tenant.balance))}
              {tenant.balance > 0 ? ' Due' : ' Paid'}
            </Text>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.paymentButton}
            onPress={() => router.push({
              pathname: '/(tabs)/payments',
              params: { tenantId: tenant.id }
            })}
          >
            <Text style={styles.paymentButtonText}>💰 Record Payment</Text>
          </TouchableOpacity>
          
          {tenant.status === 'active' ? (
            <TouchableOpacity 
              style={styles.inactiveButton}
              onPress={handleMarkInactive}
            >
              <Text style={styles.inactiveButtonText}>⭕ Mark Inactive</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.reactivateButton}
              onPress={handleReactivate}
            >
              <Text style={styles.reactivateButtonText}>✅ Reactivate</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Payment History */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payment History</Text>
        
        {payments.length === 0 ? (
          <View style={styles.emptyPayments}>
            <Text style={styles.emptyText}>No payment records found</Text>
            <Text style={styles.emptySubtext}>Record a payment to see it here</Text>
          </View>
        ) : (
          payments.map((payment) => (
            <View key={payment.id} style={styles.paymentItem}>
              <View style={styles.paymentLeft}>
                <Text style={styles.paymentIcon}>{getSourceIcon(payment.source)}</Text>
                <View>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                  <Text style={styles.paymentDate}>{formatDate(payment.date)}</Text>
                  {payment.transactionCode && (
                    <Text style={styles.transactionCode}>Code: {payment.transactionCode}</Text>
                  )}
                </View>
              </View>
              <View style={styles.paymentRight}>
                <Text style={styles.paymentMethod}>{payment.source.toUpperCase()}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Tenant</Text>
            
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Tenant name"
            />
            
            <Text style={styles.modalLabel}>Phone Number</Text>
            <TextInput
              style={styles.modalInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
            
            <Text style={styles.modalLabel}>Monthly Rent (KES)</Text>
            <TextInput
              style={styles.modalInput}
              value={editRent}
              onChangeText={setEditRent}
              placeholder="Monthly rent"
              keyboardType="numeric"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelModalButton]} 
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveModalButton]} 
                onPress={handleUpdateTenant}
                disabled={isUpdating}
              >
                <Text style={styles.saveModalButtonText}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// styles exactly as you had them (copy from your original file)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  backButton: { padding: 5 },
  backText: { fontSize: 16, color: '#27ae60' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#2c3e50' },
  editButton: { padding: 5 },
  editButtonText: { fontSize: 14, color: '#27ae60', fontWeight: '600' },
  card: { backgroundColor: 'white', borderRadius: 12, margin: 15, marginTop: 15, padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  nameSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  tenantName: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  activeBadge: { backgroundColor: '#27ae60' },
  inactiveBadge: { backgroundColor: '#95a5a6' },
  statusText: { fontSize: 12, color: 'white', fontWeight: '600' },
  infoRow: { flexDirection: 'row', marginBottom: 10 },
  infoLabel: { width: 100, fontSize: 14, color: '#7f8c8d' },
  infoValue: { flex: 1, fontSize: 14, color: '#2c3e50' },
  roomCode: { fontFamily: 'monospace', fontWeight: '600', color: '#3498db' },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 15 },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  financialLabel: { fontSize: 12, color: '#7f8c8d', marginBottom: 5 },
  financialValue: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  balanceDue: { color: '#e74c3c' },
  balancePaid: { color: '#27ae60' },
  actionButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  paymentButton: { flex: 1, backgroundColor: '#27ae60', padding: 12, borderRadius: 8, alignItems: 'center' },
  paymentButtonText: { color: 'white', fontWeight: '600' },
  inactiveButton: { flex: 1, backgroundColor: '#e74c3c', padding: 12, borderRadius: 8, alignItems: 'center' },
  inactiveButtonText: { color: 'white', fontWeight: '600' },
  reactivateButton: { flex: 1, backgroundColor: '#3498db', padding: 12, borderRadius: 8, alignItems: 'center' },
  reactivateButtonText: { color: 'white', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2c3e50', marginBottom: 15 },
  paymentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentIcon: { fontSize: 24 },
  paymentAmount: { fontSize: 16, fontWeight: '600', color: '#2c3e50' },
  paymentDate: { fontSize: 12, color: '#95a5a6', marginTop: 2 },
  transactionCode: { fontSize: 10, color: '#bdc3c7', marginTop: 2 },
  paymentRight: { alignItems: 'flex-end' },
  paymentMethod: { fontSize: 11, color: '#7f8c8d', fontWeight: '500' },
  emptyPayments: { alignItems: 'center', padding: 30 },
  emptyText: { fontSize: 14, color: '#95a5a6' },
  emptySubtext: { fontSize: 12, color: '#bdc3c7', marginTop: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalLabel: { fontSize: 14, fontWeight: '500', color: '#2c3e50', marginBottom: 5, marginTop: 10 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelModalButton: { backgroundColor: '#ecf0f1' },
  saveModalButton: { backgroundColor: '#27ae60' },
  cancelModalButtonText: { color: '#7f8c8d', fontWeight: '600' },
  saveModalButtonText: { color: 'white', fontWeight: '600' },
});
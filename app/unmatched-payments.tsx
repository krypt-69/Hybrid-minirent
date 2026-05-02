import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, ScrollView, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db, unmatchedPaymentsCollection, tenantsCollection, paymentsCollection } from '../lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, addDoc, Timestamp, query, where } from 'firebase/firestore';

type UnmatchedPayment = {
  id: string;
  originalText: string;
  amount: number;
  transactionCode?: string;
  phone?: string;
  extractedRoom?: string;
  date: Date;
  status: 'pending' | 'matched' | 'ignored';
};

type Tenant = {
  id: string;
  name: string;
  roomCode: string;
  phone: string;
  balance?: number;
  status?: string;
  propertyId: string;  // we need this to set propertyId when matching
};

export default function UnmatchedPaymentsScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();   // ✅ use landlordId
  const [unmatched, setUnmatched] = useState<UnmatchedPayment[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<UnmatchedPayment | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isMatching, setIsMatching] = useState(false);

  useEffect(() => {
    if (landlordId) {
      loadData();
    }
  }, [landlordId]);

  const loadData = async () => {
    if (!landlordId) return;
    
    try {
      // Load unmatched payments for this landlord
      const q = query(unmatchedPaymentsCollection, where('landlordId', '==', landlordId));
      const unmatchedSnapshot = await getDocs(q);
      const unmatchedList: UnmatchedPayment[] = [];
      unmatchedSnapshot.forEach((doc) => {
        const data = doc.data();
        unmatchedList.push({
          id: doc.id,
          originalText: data.originalText,
          amount: data.amount,
          transactionCode: data.transactionCode,
          phone: data.phone,
          extractedRoom: data.extractedRoom,
          date: data.date?.toDate() || new Date(),
          status: data.status || 'pending',
        });
      });
      setUnmatched(unmatchedList.sort((a, b) => b.date.getTime() - a.date.getTime()));

      // Load tenants for this landlord
      const tenantsQuery = query(tenantsCollection, where('landlordId', '==', landlordId));
      const tenantsSnapshot = await getDocs(tenantsQuery);
      const tenantsList: Tenant[] = [];
      tenantsSnapshot.forEach((doc) => {
        const data = doc.data();
        tenantsList.push({
          id: doc.id,
          name: data.name,
          roomCode: data.roomCode,
          phone: data.phone,
          balance: data.balance || 0,
          status: data.status || 'active',
          propertyId: data.propertyId,
        });
      });
      setTenants(tenantsList);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load unmatched payments');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    if (!landlordId) return;
    setRefreshing(true);
    loadData();
  }, [landlordId]);

  const handleMatchPayment = async () => {
    if (isMatching) return;
    if (!selectedPayment || !selectedTenant) {
      Alert.alert('Error', 'Please select a tenant');
      return;
    }
    if (!landlordId) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    setIsMatching(true);
    try {
      // Step 1: Record payment to payments collection
      const paymentData: any = {
        tenantId: selectedTenant.id,
        tenantName: selectedTenant.name,
        roomCode: selectedTenant.roomCode,
        amount: selectedPayment.amount,
        date: Timestamp.fromDate(selectedPayment.date),
        source: 'mpesa',
        originalText: selectedPayment.originalText,
        matchedFromUnmatched: true,
        landlordId: landlordId,               // ✅ add landlordId
        propertyId: selectedTenant.propertyId, // ✅ add propertyId
        recordedBy: 'landlord',
        createdAt: Timestamp.now(),
      };
      if (selectedPayment.transactionCode) {
        paymentData.transactionCode = selectedPayment.transactionCode;
      }
      await addDoc(paymentsCollection, paymentData);

      // Step 2: Update tenant balance
      const tenantRef = doc(db, 'tenants', selectedTenant.id);
      const newBalance = (selectedTenant.balance || 0) - selectedPayment.amount;
      await updateDoc(tenantRef, {
        balance: newBalance,
        lastPaymentDate: Timestamp.now(),
      });

      // Step 3: Delete from unmatched
      await deleteDoc(doc(db, 'unmatchedPayments', selectedPayment.id));

      Alert.alert('Success', `Payment of KES ${selectedPayment.amount.toLocaleString()} matched to ${selectedTenant.name}`);
      setModalVisible(false);
      setSelectedPayment(null);
      setSelectedTenant(null);
      await loadData();
    } catch (error) {
      console.error('Error matching payment:', error);
      Alert.alert('Error', 'Failed to match payment: ' + error.message);
    } finally {
      setIsMatching(false);
    }
  };

  const handleIgnore = async (id: string) => {
    Alert.alert(
      'Ignore Payment',
      'This payment will be removed from the list. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ignore',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'unmatchedPayments', id));
              loadData();
              Alert.alert('Success', 'Payment removed');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove payment');
            }
          }
        }
      ]
    );
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString()}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-KE', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderUnmatchedItem = ({ item }: { item: UnmatchedPayment }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => {
        setSelectedPayment(item);
        setModalVisible(true);
      }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
        <Text style={styles.date}>{formatDate(item.date)}</Text>
      </View>
      
      {item.transactionCode && (
        <Text style={styles.code}>Code: {item.transactionCode}</Text>
      )}
      
      {item.extractedRoom && (
        <Text style={styles.room}>Extracted Room: {item.extractedRoom}</Text>
      )}
      
      {item.phone && (
        <Text style={styles.phone}>Phone: {item.phone}</Text>
      )}
      
      <Text style={styles.originalText} numberOfLines={2}>
        {item.originalText}
      </Text>
      
      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={styles.matchButton}
          onPress={() => {
            setSelectedPayment(item);
            setModalVisible(true);
          }}
        >
          <Text style={styles.matchButtonText}>Match</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.ignoreButton}
          onPress={() => handleIgnore(item.id)}
        >
          <Text style={styles.ignoreButtonText}>Ignore</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Unmatched Payments</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          ⚠️ These payments couldn't be matched automatically. Select a payment and assign it to the correct tenant.
        </Text>
      </View>

      {isLoading && !refreshing ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : unmatched.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyText}>No unmatched payments</Text>
          <Text style={styles.emptySubtext}>All payments have been matched successfully</Text>
        </View>
      ) : (
        <FlatList
          data={unmatched}
          renderItem={renderUnmatchedItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Match Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Match Payment</Text>
            
            {selectedPayment && (
              <>
                <View style={styles.paymentDetails}>
                  <Text style={styles.detailLabel}>Amount:</Text>
                  <Text style={styles.detailAmount}>{formatCurrency(selectedPayment.amount)}</Text>
                  
                  <Text style={styles.detailLabel}>Date:</Text>
                  <Text style={styles.detailText}>{formatDate(selectedPayment.date)}</Text>
                  
                  {selectedPayment.transactionCode && (
                    <>
                      <Text style={styles.detailLabel}>Transaction:</Text>
                      <Text style={styles.detailText}>{selectedPayment.transactionCode}</Text>
                    </>
                  )}
                  
                  <Text style={styles.detailLabel}>Original SMS:</Text>
                  <Text style={styles.detailSms}>{selectedPayment.originalText}</Text>
                </View>
                
                <Text style={styles.selectLabel}>Select Tenant:</Text>
                <ScrollView style={styles.tenantList}>
                  {tenants.map((tenant) => (
                    <TouchableOpacity
                      key={tenant.id}
                      style={[
                        styles.tenantOption,
                        selectedTenant?.id === tenant.id && styles.selectedTenant,
                        tenant.status === 'inactive' && styles.inactiveTenant
                      ]}
                      onPress={() => setSelectedTenant(tenant)}
                    >
                      <View style={styles.tenantRow}>
                        <View style={styles.tenantInfo}>
                          <Text style={[styles.tenantName, tenant.status === 'inactive' && styles.inactiveTenantText]}>
                            {tenant.name}
                          </Text>
                          <Text style={styles.tenantRoom}>{tenant.roomCode}</Text>
                          <Text style={styles.tenantPhone}>{tenant.phone}</Text>
                        </View>
                        {tenant.status === 'inactive' && (
                          <View style={styles.inactiveBadge}>
                            <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelModalButton]} 
                onPress={() => {
                  setModalVisible(false);
                  setSelectedTenant(null);
                }}
              >
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.matchModalButton, (!selectedTenant || isMatching) && styles.disabledButton]} 
                onPress={handleMatchPayment}
                disabled={!selectedTenant || isMatching}
              >
                <Text style={styles.matchModalButtonText}>
                  {isMatching ? 'Matching...' : 'Match Payment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 5,
  },
  backText: {
    fontSize: 16,
    color: '#27ae60',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  infoBanner: {
    backgroundColor: '#fff3e0',
    margin: 15,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  infoText: {
    fontSize: 13,
    color: '#7f8c8d',
    lineHeight: 18,
  },
  list: {
    padding: 15,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  amount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
  },
  date: {
    fontSize: 12,
    color: '#95a5a6',
  },
  code: {
    fontSize: 12,
    color: '#3498db',
    marginBottom: 4,
  },
  room: {
    fontSize: 12,
    color: '#27ae60',
    marginBottom: 4,
  },
  phone: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 8,
  },
  originalText: {
    fontSize: 12,
    color: '#95a5a6',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  matchButton: {
    flex: 1,
    backgroundColor: '#27ae60',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  matchButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  ignoreButton: {
    flex: 1,
    backgroundColor: '#ecf0f1',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  ignoreButtonText: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  loading: {
    textAlign: 'center',
    marginTop: 50,
    color: '#95a5a6',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#95a5a6',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bdc3c7',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  paymentDetails: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  detailLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 8,
  },
  detailAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e74c3c',
  },
  detailText: {
    fontSize: 14,
    color: '#2c3e50',
  },
  detailSms: {
    fontSize: 11,
    color: '#95a5a6',
    marginTop: 4,
    fontStyle: 'italic',
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    color: '#2c3e50',
  },
  tenantList: {
    maxHeight: 400,
    marginBottom: 15,
  },
  tenantOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedTenant: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  inactiveTenant: {
    backgroundColor: '#ffe5e5',
  },
  tenantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
  },
  inactiveTenantText: {
    color: '#e74c3c',
    textDecorationLine: 'line-through',
  },
  tenantRoom: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  tenantPhone: {
    fontSize: 11,
    color: '#95a5a6',
    marginTop: 2,
  },
  inactiveBadge: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  inactiveBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelModalButton: {
    backgroundColor: '#ecf0f1',
  },
  matchModalButton: {
    backgroundColor: '#27ae60',
  },
  disabledButton: {
    backgroundColor: '#95a5a6',
  },
  cancelModalButtonText: {
    color: '#7f8c8d',
    fontWeight: '600',
  },
  matchModalButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
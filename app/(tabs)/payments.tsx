import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { db, tenantsCollection, paymentsCollection, propertiesCollection, unmatchedPaymentsCollection } from '../../lib/firebase';
import { collection, getDocs, addDoc, query, where, Timestamp, doc, updateDoc } from 'firebase/firestore';

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
};

type Property = {
  id: string;
  name: string;
  code: string;
};

type ExtractedData = {
  transactionCode: string | null;
  amount: string | null;
  date: string | null;
  time: string | null;
  fullAccountString: string | null;
  rawText: string;
};

type RoomCandidate = {
  value: string;
  description: string;
};

export default function PaymentsScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'manual' | 'mpesa'>('manual');
  const [mpesaCode, setMpesaCode] = useState('');
  const [mpesaText, setMpesaText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  
  // Guided matching states
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [showCandidatesModal, setShowCandidatesModal] = useState(false);
  const [roomCandidates, setRoomCandidates] = useState<RoomCandidate[]>([]);
  const [selectedRoomValue, setSelectedRoomValue] = useState<string | null>(null);
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [matchedTenants, setMatchedTenants] = useState<Tenant[]>([]);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<any>(null);

  useEffect(() => {
    if (landlordId) {
      loadData();
    }
  }, [landlordId]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = tenants.filter(tenant => 
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.roomCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.phone.includes(searchQuery)
      );
      setFilteredTenants(filtered);
    } else {
      setFilteredTenants(tenants);
    }
  }, [searchQuery, tenants]);

  const loadData = async () => {
    if (!landlordId) return;
    try {
      // Load tenants
      const tenantsQuery = query(tenantsCollection, where('landlordId', '==', landlordId));
      const tenantsSnapshot = await getDocs(tenantsQuery);
      const tenantsList: Tenant[] = [];
      tenantsSnapshot.forEach((doc) => {
        const data = doc.data();
        tenantsList.push({
          id: doc.id,
          name: data.name,
          phone: data.phone,
          propertyId: data.propertyId,
          room: data.room,
          roomCode: data.roomCode,
          monthlyRent: data.monthlyRent,
          balance: data.balance || 0,
        });
      });
      setTenants(tenantsList);
      setFilteredTenants(tenantsList);

      // Load properties
      const propertiesQuery = query(propertiesCollection, where('landlordId', '==', landlordId));
      const propertiesSnapshot = await getDocs(propertiesQuery);
      const propertiesList: Property[] = [];
      propertiesSnapshot.forEach((doc) => {
        const data = doc.data();
        propertiesList.push({
          id: doc.id,
          name: data.name,
          code: data.code,
        });
      });
      setProperties(propertiesList);
    } catch (error) {
      Alert.alert('Error', 'Failed to load data');
    }
  };

  // --- UPDATED M-Pesa extraction (now supports "for ROOMCODE" messages) ---
  const extractReliableFields = (text: string): ExtractedData => {
    // 1. Transaction Code (10-12 uppercase alphanumeric, often at the start)
    const codeMatch = text.match(/\b([A-Z0-9]{10,12})\b/);
    
    // 2. Amount (Ksh/KES)
    const amountMatch = text.match(/(?:Ksh|KES)\s?([\d,]+(?:\.\d{2})?)/i);
    
    // 3. Account / Room Reference – try all known patterns
    let fullAccountString = null;

    const standardMatch = text.match(/account\s+([A-Z0-9\-_#\/]+)/i);
    const refMatch = text.match(/Ref:?\s+([A-Z0-9\-_#\/]+)/i);
    const ncbaStyleMatch = text.match(/224619\s+([A-Z0-9\-_#\/]+)/i);
    // NEW: captures room code after "for" (e.g., "sent to LORA PLACE for ASSD-FF-12")
    const forMatch = text.match(/for\s+([A-Z0-9\-_#\/]+)/i);

    if (standardMatch) {
      fullAccountString = standardMatch[1];
    } else if (refMatch) {
      fullAccountString = refMatch[1];
    } else if (ncbaStyleMatch) {
      fullAccountString = ncbaStyleMatch[1];
    } else if (forMatch) {
      fullAccountString = forMatch[1];
    }

    // 4. Date and Time
    const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)/i);

    return {
      transactionCode: codeMatch ? codeMatch[1] : null,
      amount: amountMatch ? amountMatch[1].replace(/,/g, '') : null,
      date: dateMatch ? dateMatch[1] : null,
      time: timeMatch ? timeMatch[1] : null,
      fullAccountString: fullAccountString,
      rawText: text,
    };
  };

  const generateRoomCandidates = (accountString: string | null): RoomCandidate[] => {
    if (!accountString) return [];
    const candidates: RoomCandidate[] = [];

    // 1. Full original string
    candidates.push({ value: accountString, description: `Full reference: ${accountString}` });

    // 2. Split by hyphens, slashes, spaces
    const parts = accountString.split(/[\s\-\/]+/);
    if (parts.length > 1) {
      parts.forEach(part => {
        if (part.length > 0) {
          candidates.push({ value: part, description: `Part of code: ${part}` });
        }
      });
    }

    // 3. Trailing digits
    const trailingDigits = accountString.match(/(\d+)$/);
    if (trailingDigits) {
      candidates.push({ value: trailingDigits[1], description: `Room Number: ${trailingDigits[1]}` });
    }

    // Unique results only
    return candidates.filter((c, i, self) => 
      self.findIndex(t => t.value.toLowerCase() === c.value.toLowerCase()) === i
    );
  };

  const findTenantsByRoomIdentifier = (roomValue: string): Tenant[] => {
    const matched = tenants.filter(tenant => {
      if (tenant.room === roomValue) return true;
      if (tenant.roomCode === roomValue) return true;
      if (tenant.room.endsWith(roomValue)) return true;
      const tenantDigits = tenant.room.replace(/[^0-9]/g, '');
      const searchDigits = roomValue.replace(/[^0-9]/g, '');
      if (tenantDigits === searchDigits && searchDigits.length > 0) return true;
      return false;
    });
    return matched.map(tenant => ({
      ...tenant,
      propertyName: properties.find(p => p.id === tenant.propertyId)?.name,
    }));
  };

  const handleMpesaPaste = () => {
    if (!mpesaText.trim()) {
      Alert.alert('Error', 'Please paste the M-Pesa SMS');
      return;
    }
    const extracted = extractReliableFields(mpesaText);
    setExtractedData(extracted);
    if (extracted.amount) setAmount(extracted.amount);
    if (extracted.transactionCode) setMpesaCode(extracted.transactionCode);
    const candidates = generateRoomCandidates(extracted.fullAccountString);
    setRoomCandidates(candidates);
    setShowCandidatesModal(true);
  };

  const handleSelectRoomCandidate = (candidate: RoomCandidate) => {
    setSelectedRoomValue(candidate.value);
    setShowCandidatesModal(false);
    
    const matched = findTenantsByRoomIdentifier(candidate.value);
    setMatchedTenants(matched);

    if (matched.length === 0) {
      Alert.alert(
        'No Tenant Found',
        `No tenant found with room identifier "${candidate.value}".\n\nYou can still record this payment in Unmatched Payments.`,
        [
          { text: 'Save to Unmatched', onPress: () => saveToUnmatched() },
          { text: 'Cancel', style: 'cancel', onPress: () => resetMpesaFlow() },
        ]
      );
    } else if (matched.length === 1) {
      const tenant = matched[0];
      setSelectedTenant(tenant);
      if (extractedData?.amount) {
        setAmount(extractedData.amount);
      }
      showConfirmationDialog(tenant);
    } else {
      setShowPropertySelector(true);
    }
  };

  // Single showConfirmationDialog – uses amount state and mpesaCode
  const showConfirmationDialog = (tenant: Tenant) => {
    const paymentAmount = parseFloat(amount);
    setPaymentToConfirm({
      tenant,
      amount: paymentAmount,
      transactionCode: mpesaCode,
      newBalance: tenant.balance - paymentAmount,
    });
    setConfirmationVisible(true);
  };

  const resetMpesaFlow = () => {
    setMpesaText('');
    setExtractedData(null);
    setMpesaCode('');
    setSelectedTenant(null);
  };

  const handleSelectProperty = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setShowPropertySelector(false);
    showConfirmationDialog(tenant);
  };

  const saveConfirmedPayment = async () => {
    if (!paymentToConfirm) return;
    setIsLoading(true);
    try {
      const { tenant, amount: paymentAmount, transactionCode, newBalance } = paymentToConfirm;
      
      await addDoc(paymentsCollection, {
        tenantId: tenant.id,
        tenantName: tenant.name,
        roomCode: tenant.roomCode,
        amount: paymentAmount,
        date: Timestamp.now(),
        source: 'mpesa',
        transactionCode: transactionCode || null,
        originalText: mpesaText,
        landlordId: landlordId,
        propertyId: tenant.propertyId,
        recordedBy: 'landlord',
      });
      
      const tenantRef = doc(db, 'tenants', tenant.id);
      await updateDoc(tenantRef, {
        balance: newBalance,
        lastPaymentDate: Timestamp.now(),
      });
      
      Alert.alert('Success', `Payment of KES ${paymentAmount.toLocaleString()} recorded for ${tenant.name}\nNew Balance: KES ${newBalance.toLocaleString()}`);
      setConfirmationVisible(false);
      resetForm();
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to save payment');
    } finally {
      setIsLoading(false);
    }
  };

  const saveToUnmatched = async () => {
    if (!extractedData || !amount) return;
    setIsLoading(true);
    try {
      await addDoc(unmatchedPaymentsCollection, {
        originalText: extractedData.rawText,
        amount: parseFloat(amount),
        transactionCode: mpesaCode || null,
        extractedRoom: selectedRoomValue,
        date: Timestamp.now(),
        status: 'pending',
        landlordId: landlordId,
      });
      Alert.alert('Unmatched Payment Saved', `Payment saved. You can match it later in Unmatched Payments.`);
      resetMpesaFlow();
    } catch (error) {
      Alert.alert('Error', 'Failed to save payment');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelMpesaFlow = () => {
    Alert.alert(
      'Cancel Payment',
      'Are you sure you want to cancel this payment? All entered data will be lost.',
      [
        { text: 'No, Continue', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: resetMpesaFlow }
      ]
    );
  };

  const resetForm = () => {
    setSelectedTenant(null);
    setAmount('');
    setPaymentMethod('manual');
    setMpesaCode('');
    setMpesaText('');
    setSearchQuery('');
    setExtractedData(null);
    setSelectedRoomValue(null);
    setMatchedTenants([]);
    setPaymentToConfirm(null);
  };

  const cancelManualSelection = () => {
    setSelectedTenant(null);
    setAmount('');
    setSearchQuery('');
    setShowTenantSelector(false);
  };

  // MANUAL PAYMENT HANDLERS
  const handleManualSelectTenant = () => {
    setShowTenantSelector(true);
  };

  const handleManualRecordPayment = async () => {
    if (!selectedTenant) {
      Alert.alert('Error', 'Please select a tenant');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    
    setIsLoading(true);
    try {
      const paymentAmount = parseFloat(amount);
      const newBalance = selectedTenant.balance - paymentAmount;
      
      await addDoc(paymentsCollection, {
        tenantId: selectedTenant.id,
        tenantName: selectedTenant.name,
        roomCode: selectedTenant.roomCode,
        amount: paymentAmount,
        date: Timestamp.now(),
        source: 'manual',
        landlordId: landlordId,
        propertyId: selectedTenant.propertyId,
        recordedBy: 'landlord',
      });
      
      const tenantRef = doc(db, 'tenants', selectedTenant.id);
      await updateDoc(tenantRef, {
        balance: newBalance,
        lastPaymentDate: Timestamp.now(),
      });
      
      Alert.alert('Success', `Payment recorded!\nNew Balance: KES ${newBalance.toLocaleString()}`);
      resetManualForm();
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to record payment');
    } finally {
      setIsLoading(false);
    }
  };

  const resetManualForm = () => {
    setSelectedTenant(null);
    setAmount('');
    setSearchQuery('');
  };

  const renderTenantItem = ({ item }: { item: Tenant }) => (
    <TouchableOpacity 
      style={styles.tenantItem}
      onPress={() => {
        setSelectedTenant(item);
        setShowTenantSelector(false);
      }}
    >
      <Text style={styles.tenantItemName}>{item.name}</Text>
      <Text style={styles.tenantItemDetails}>{item.roomCode} • KES {item.monthlyRent.toLocaleString()}</Text>
      <Text style={[styles.tenantItemBalance, item.balance > 0 ? styles.balanceDue : styles.balancePaid]}>
        Balance: KES {item.balance.toLocaleString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Record Payment</Text>
        {/* Refresh Button */}
        <TouchableOpacity onPress={loadData} style={styles.refreshButton}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Payment Method Tabs */}
      <View style={styles.card}>
        <Text style={styles.label}>Payment Method</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, paymentMethod === 'manual' && styles.activeTab]}
            onPress={() => {
              setPaymentMethod('manual');
              resetMpesaFlow();
            }}
          >
            <Text style={[styles.tabText, paymentMethod === 'manual' && styles.activeTabText]}>Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, paymentMethod === 'mpesa' && styles.activeTab]}
            onPress={() => {
              setPaymentMethod('mpesa');
              resetManualForm();
            }}
          >
            <Text style={[styles.tabText, paymentMethod === 'mpesa' && styles.activeTabText]}>M-Pesa SMS</Text>
          </TouchableOpacity>
        </View>

        {/* MANUAL PAYMENT */}
        {paymentMethod === 'manual' && (
          <View>
            <TouchableOpacity 
              style={styles.selectorButton}
              onPress={handleManualSelectTenant}
            >
              <Text style={styles.selectorText}>
                {selectedTenant ? `${selectedTenant.name} (${selectedTenant.roomCode})` : 'Select Tenant *'}
              </Text>
            </TouchableOpacity>
            
            {selectedTenant && (
              <>
                <View style={styles.selectedInfo}>
                  <Text style={styles.infoText}>Room: {selectedTenant.roomCode}</Text>
                  <Text style={styles.infoText}>Monthly Rent: KES {selectedTenant.monthlyRent.toLocaleString()}</Text>
                  <Text style={[styles.infoText, selectedTenant.balance > 0 ? styles.balanceDue : styles.balancePaid]}>
                    Current Balance: KES {selectedTenant.balance.toLocaleString()}
                  </Text>
                </View>
                
                <TouchableOpacity style={styles.cancelStepButton} onPress={cancelManualSelection}>
                  <Text style={styles.cancelStepButtonText}>Cancel Selection</Text>
                </TouchableOpacity>
              </>
            )}
            
            <TextInput
              style={styles.input}
              placeholder="Amount (KES)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
            
            <TouchableOpacity 
              style={[styles.recordButton, (!selectedTenant || !amount) && styles.disabledButton]}
              onPress={handleManualRecordPayment}
              disabled={!selectedTenant || !amount || isLoading}
            >
              <Text style={styles.recordButtonText}>
                {isLoading ? 'Recording...' : 'Record Payment'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* M-PESA SMS PAYMENT */}
        {paymentMethod === 'mpesa' && (
          <View>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Paste M-Pesa SMS here..."
              value={mpesaText}
              onChangeText={setMpesaText}
              multiline
              numberOfLines={4}
            />
            
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.parseButton} onPress={handleMpesaPaste}>
                <Text style={styles.parseButtonText}>Extract & Guide Me</Text>
              </TouchableOpacity>
              
              {mpesaText && (
                <TouchableOpacity style={styles.cancelStepButtonSmall} onPress={cancelMpesaFlow}>
                  <Text style={styles.cancelStepButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Tenant Selector Modal (Manual) */}
      <Modal visible={showTenantSelector} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Tenant</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, room code, or phone..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <FlatList
              data={filteredTenants}
              renderItem={renderTenantItem}
              keyExtractor={(item) => item.id}
              style={styles.tenantList}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowTenantSelector(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Room Candidates Modal */}
      <Modal visible={showCandidatesModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Identify Room Number</Text>
              <TouchableOpacity onPress={() => {
                setShowCandidatesModal(false);
                cancelMpesaFlow();
              }} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Extracted: "{extractedData?.fullAccountString || 'Unknown'}"
            </Text>
            <Text style={styles.modalQuestion}>Which part represents the room number?</Text>
            
            {roomCandidates.map((candidate, index) => (
              <TouchableOpacity
                key={index}
                style={styles.candidateButton}
                onPress={() => handleSelectRoomCandidate(candidate)}
              >
                <Text style={styles.candidateText}>{candidate.description}</Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity style={styles.cancelModalButton} onPress={() => {
              setShowCandidatesModal(false);
              saveToUnmatched();
            }}>
              <Text style={styles.cancelModalButtonText}>Save to Unmatched Instead</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.cancelStepButton} onPress={() => {
              setShowCandidatesModal(false);
              cancelMpesaFlow();
            }}>
              <Text style={styles.cancelStepButtonText}>Cancel Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Property Selector Modal */}
      <Modal visible={showPropertySelector} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Multiple Properties Found</Text>
              <TouchableOpacity onPress={() => {
                setShowPropertySelector(false);
                cancelMpesaFlow();
              }} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Room "{selectedRoomValue}" exists in multiple properties. Select the correct one:
            </Text>
            
            {matchedTenants.map((tenant) => (
              <TouchableOpacity
                key={tenant.id}
                style={styles.propertyOption}
                onPress={() => handleSelectProperty(tenant)}
              >
                <Text style={styles.propertyName}>{tenant.propertyName || 'Unknown Property'}</Text>
                <Text style={styles.propertyDetails}>
                  {tenant.name} • Rent: KES {tenant.monthlyRent.toLocaleString()} • Balance: KES {tenant.balance.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity style={styles.cancelStepButton} onPress={() => {
              setShowPropertySelector(false);
              cancelMpesaFlow();
            }}>
              <Text style={styles.cancelStepButtonText}>Cancel Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal visible={confirmationVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Payment</Text>
              <TouchableOpacity onPress={() => setConfirmationVisible(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {paymentToConfirm && (
              <View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Tenant:</Text>
                  <Text style={styles.confirmValue}>{paymentToConfirm.tenant.name}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Property:</Text>
                  <Text style={styles.confirmValue}>{paymentToConfirm.tenant.propertyName || 'N/A'}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Room:</Text>
                  <Text style={styles.confirmValue}>{paymentToConfirm.tenant.roomCode}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Amount:</Text>
                  <Text style={styles.confirmValue}>KES {paymentToConfirm.amount.toLocaleString()}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Current Balance:</Text>
                  <Text style={styles.confirmValue}>KES {paymentToConfirm.tenant.balance.toLocaleString()}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>New Balance:</Text>
                  <Text style={[styles.confirmValue, styles.newBalance]}>KES {paymentToConfirm.newBalance.toLocaleString()}</Text>
                </View>
                {paymentToConfirm.transactionCode && (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Transaction:</Text>
                    <Text style={styles.confirmValue}>{paymentToConfirm.transactionCode}</Text>
                  </View>
                )}
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelModalButton} onPress={() => setConfirmationVisible(false)}>
                <Text style={styles.cancelModalButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={saveConfirmedPayment}>
                <Text style={styles.confirmButtonText}>Confirm & Save</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.cancelStepButton} onPress={() => {
              setConfirmationVisible(false);
              cancelMpesaFlow();
            }}>
              <Text style={styles.cancelStepButtonText}>Cancel Entire Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#27ae60" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: 'white', 
    borderBottomWidth: 1, 
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: { padding: 5 },
  backText: { fontSize: 16, color: '#27ae60', fontWeight: '500' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
  refreshButton: { padding: 5 },
  refreshText: { fontSize: 22, color: '#3498db' },
  card: { 
    backgroundColor: 'white', 
    borderRadius: 16, 
    padding: 20, 
    margin: 16, 
    marginTop: 12,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 4, 
    elevation: 3,
  },
  label: { fontSize: 16, fontWeight: '600', color: '#2c3e50', marginBottom: 12 },
  selectorButton: { 
    borderWidth: 1, 
    borderColor: '#dee2e6', 
    borderRadius: 12, 
    padding: 14, 
    backgroundColor: '#fff', 
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectorText: { fontSize: 16, color: '#2c3e50' },
  selectedInfo: { 
    marginTop: 12, 
    padding: 12, 
    backgroundColor: '#f8f9fa', 
    borderRadius: 12,
    marginBottom: 12,
  },
  infoText: { fontSize: 14, color: '#6c757d', marginBottom: 6 },
  tabContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#f8f9fa', borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#27ae60' },
  tabText: { fontSize: 14, color: '#6c757d', fontWeight: '500' },
  activeTabText: { color: 'white', fontWeight: '600' },
  input: { 
    borderWidth: 1, 
    borderColor: '#dee2e6', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 16, 
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  textArea: { height: 120, textAlignVertical: 'top' },
  parseButton: { 
    backgroundColor: '#3498db', 
    padding: 15, 
    borderRadius: 12, 
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  parseButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  recordButton: { backgroundColor: '#27ae60', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  disabledButton: { backgroundColor: '#adb5bd' },
  recordButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 24, width: '90%', maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center', flex: 1 },
  modalCloseButton: { padding: 8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 20, color: '#6c757d', fontWeight: 'bold' },
  modalSubtitle: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginBottom: 16 },
  modalQuestion: { fontSize: 16, fontWeight: '600', marginBottom: 16, color: '#2c3e50' },
  candidateButton: { backgroundColor: '#f8f9fa', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e9ecef' },
  candidateText: { fontSize: 16, color: '#2c3e50', textAlign: 'center' },
  propertyOption: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  propertyName: { fontSize: 16, fontWeight: '600', color: '#2c3e50', marginBottom: 4 },
  propertyDetails: { fontSize: 13, color: '#6c757d' },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  confirmLabel: { fontSize: 14, color: '#6c757d' },
  confirmValue: { fontSize: 14, fontWeight: '500', color: '#2c3e50' },
  newBalance: { color: '#27ae60', fontWeight: 'bold', fontSize: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelModalButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e9ecef' },
  cancelModalButtonText: { color: '#6c757d', fontWeight: '600' },
  confirmButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#27ae60' },
  confirmButtonText: { color: 'white', fontWeight: '600', fontSize: 15 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  searchInput: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 16 },
  tenantList: { maxHeight: 500 },
  tenantItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  tenantItemName: { fontSize: 16, fontWeight: '600', color: '#2c3e50', marginBottom: 4 },
  tenantItemDetails: { fontSize: 13, color: '#6c757d', marginBottom: 4 },
  tenantItemBalance: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  balanceDue: { color: '#e74c3c' },
  balancePaid: { color: '#27ae60' },
  closeButton: { marginTop: 16, padding: 14, alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 12 },
  closeButtonText: { color: '#6c757d', fontWeight: '600' },
  cancelStepButton: { 
    marginTop: 12, 
    padding: 12, 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  cancelStepButtonText: { color: '#dc3545', fontWeight: '600', fontSize: 14 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelStepButtonSmall: { 
    padding: 15, 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dc3545',
    paddingHorizontal: 20,
  },
});
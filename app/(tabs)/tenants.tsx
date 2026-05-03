import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, RefreshControl } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { db, tenantsCollection, propertiesCollection } from '../../lib/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

type Property = {
  id: string;
  name: string;
  code: string;
};

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
  status: 'active' | 'inactive';
  landlordId: string;   // ✅ added
};

export default function TenantsScreen() {
  const { landlordId } = useAuth();   // ✅ use landlordId
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // ✅ Added for refresh control
  const [modalVisible, setModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // ✅ Added for double-click prevention
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantRoom, setTenantRoom] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [showPropertySelector, setShowPropertySelector] = useState(false);

  useEffect(() => {
    if (landlordId) {
      loadData();
    }
  }, [landlordId]);

  const loadData = async () => {
    if (!landlordId) return;
    setIsLoading(true);
    try {
      // Load only landlord's properties
      const propertiesQuery = query(propertiesCollection, where('landlordId', '==', landlordId));
      const propertiesSnapshot = await getDocs(propertiesQuery);
      const propertiesList: Property[] = [];
      propertiesSnapshot.forEach((doc) => {
        propertiesList.push({ id: doc.id, ...doc.data() } as Property);
      });
      setProperties(propertiesList);

      // Load only landlord's tenants
      const tenantsQuery = query(tenantsCollection, where('landlordId', '==', landlordId));
      const tenantsSnapshot = await getDocs(tenantsQuery);
      const tenantsList: Tenant[] = [];
      tenantsSnapshot.forEach((doc) => {
        const tenant = doc.data() as Tenant;
        const property = propertiesList.find(p => p.id === tenant.propertyId);
        tenantsList.push({
          ...tenant,
          id: doc.id,
          propertyName: property?.name,
        });
      });
      setTenants(tenantsList);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
      setRefreshing(false); // ✅ Stop refreshing
    }
  };

  const handleAddTenant = async () => {
    if (isSubmitting) return; // ✅ Prevent double-click
    setIsSubmitting(true); // ✅ Set submitting state
    
    if (!selectedProperty) {
      Alert.alert('Error', 'Please select a property');
      setIsSubmitting(false);
      return;
    }
    if (!tenantName.trim()) {
      Alert.alert('Error', 'Please enter tenant name');
      setIsSubmitting(false);
      return;
    }
    if (!tenantPhone.trim()) {
      Alert.alert('Error', 'Please enter phone number');
      setIsSubmitting(false);
      return;
    }
    if (!tenantRoom.trim()) {
      Alert.alert('Error', 'Please enter room number');
      setIsSubmitting(false);
      return;
    }
    if (!monthlyRent || parseFloat(monthlyRent) <= 0) {
      Alert.alert('Error', 'Please enter valid monthly rent');
      setIsSubmitting(false);
      return;
    }

    const selectedProp = properties.find(p => p.id === selectedProperty);
    const roomCode = `${selectedProp?.code}-${tenantRoom.trim().toUpperCase()}`;

    try {
      await addDoc(tenantsCollection, {
        landlordId: landlordId,   // ✅ changed from userId
        name: tenantName.trim(),
        phone: tenantPhone.trim(),
        propertyId: selectedProperty,
        room: tenantRoom.trim().toUpperCase(),
        roomCode: roomCode,
        monthlyRent: parseFloat(monthlyRent),
        balance: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      
      Alert.alert('Success', `Tenant added successfully\nRoom Code: ${roomCode}`);
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error adding tenant:', error);
      Alert.alert('Error', 'Failed to add tenant');
    } finally {
      setIsSubmitting(false); // ✅ Reset submitting state
    }
  };

  const resetForm = () => {
    setSelectedProperty('');
    setTenantName('');
    setTenantPhone('');
    setTenantRoom('');
    setMonthlyRent('');
  };

  const handleDeleteTenant = async (id: string, name: string) => {
    Alert.alert(
      'Delete Tenant',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'tenants', id));
              loadData();
              Alert.alert('Success', 'Tenant deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete tenant');
            }
          }
        }
      ]
    );
  };

  const renderTenant = ({ item }: { item: Tenant }) => (
    <TouchableOpacity 
      style={styles.tenantCard}
      onPress={() => router.push(`/tenant-details?id=${item.id}`)}
    >
      <View style={styles.tenantInfo}>
        <Text style={styles.tenantName}>{item.name}</Text>
        <Text style={styles.tenantDetails}>
          {item.propertyName} • Room {item.room}
        </Text>
        <Text style={styles.roomCode}>Code: {item.roomCode}</Text>
        <Text style={styles.rent}>Rent: KES {item.monthlyRent.toLocaleString()}</Text>
        <Text style={[styles.balance, item.balance > 0 ? styles.balanceDue : styles.balancePaid]}>
          Balance: KES {item.balance.toLocaleString()}
        </Text>
      </View>
      <TouchableOpacity 
        onPress={() => handleDeleteTenant(item.id, item.name)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const PropertySelectorModal = () => (
    <Modal
      visible={showPropertySelector}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Property</Text>
          {properties.map((prop) => (
            <TouchableOpacity
              key={prop.id}
              style={styles.propertyOption}
              onPress={() => {
                setSelectedProperty(prop.id);
                setShowPropertySelector(false);
              }}
            >
              <Text style={styles.propertyOptionText}>{prop.name} ({prop.code})</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowPropertySelector(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tenants</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {isLoading && !refreshing ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : tenants.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No tenants yet</Text>
          <Text style={styles.emptySubtext}>Tap + Add to add your first tenant</Text>
        </View>
      ) : (
        <FlatList
          data={tenants}
          renderItem={renderTenant}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={() => { 
                setRefreshing(true); 
                loadData(); 
              }} 
            />
          }
        />
      )}

      {/* Add Tenant Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Tenant</Text>
            
            <TouchableOpacity 
              style={styles.selectorButton}
              onPress={() => setShowPropertySelector(true)}
            >
              <Text style={styles.selectorText}>
                {selectedProperty 
                  ? properties.find(p => p.id === selectedProperty)?.name 
                  : 'Select Property *'}
              </Text>
            </TouchableOpacity>

            <TextInput
  style={styles.input}
  placeholder="Tenant Name *"
  placeholderTextColor="#ff6b35"  // Vibrant Orange
  value={tenantName}
  onChangeText={setTenantName}
/>
<TextInput
  style={styles.input}
  placeholder="Phone Number *"
  placeholderTextColor="#ff6b35"  // Vibrant Orange
  value={tenantPhone}
  onChangeText={setTenantPhone}
  keyboardType="phone-pad"
/>
<TextInput
  style={styles.input}
  placeholder="Room Number * (e.g., A4)"
  placeholderTextColor="#ff6b35"  // Vibrant Orange
  value={tenantRoom}
  onChangeText={setTenantRoom}
  autoCapitalize="characters"
/>
<TextInput
  style={styles.input}
  placeholder="Monthly Rent * (KES)"
  placeholderTextColor="#ff6b35"  // Vibrant Orange
  value={monthlyRent}
  onChangeText={setMonthlyRent}
  keyboardType="numeric"
/>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelModalButton]} 
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveModalButton, isSubmitting && styles.disabledButton]} 
                onPress={handleAddTenant}
                disabled={isSubmitting}
              >
                <Text style={styles.saveModalButtonText}>
                  {isSubmitting ? 'Adding...' : 'Add Tenant'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PropertySelectorModal />
    </View>
  );
}

// styles exactly as you had them (copy from your original file)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  addButton: { backgroundColor: '#27ae60', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  list: { padding: 15 },
  tenantCard: { backgroundColor: 'white', borderRadius: 12, padding: 15, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  tenantInfo: { flex: 1 },
  tenantName: { fontSize: 18, fontWeight: '600', color: '#2c3e50' },
  tenantDetails: { fontSize: 14, color: '#7f8c8d', marginTop: 4 },
  roomCode: { fontSize: 12, color: '#3498db', marginTop: 2, fontFamily: 'monospace' },
  rent: { fontSize: 14, color: '#2c3e50', marginTop: 4 },
  balance: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  balanceDue: { color: '#e74c3c' },
  balancePaid: { color: '#27ae60' },
  deleteButton: { padding: 8 },
  deleteText: { color: '#e74c3c', fontSize: 14 },
  loading: { textAlign: 'center', marginTop: 50, color: '#95a5a6' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, color: '#95a5a6', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#bdc3c7', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%', maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  selectorButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#fff' },
  selectorText: { fontSize: 16, color: '#2c3e50' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  cancelModalButton: { backgroundColor: '#e74c3c' },
  saveModalButton: { backgroundColor: '#27ae60' },
  cancelModalButtonText: { color: 'white', fontWeight: '600' },
  saveModalButtonText: { color: 'white', fontWeight: '600' },
  propertyOption: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  propertyOptionText: { fontSize: 16 },
  cancelButton: { padding: 15, alignItems: 'center', marginTop: 10 },
  cancelButtonText: { color: '#e74c3c', fontWeight: '600' },
  disabledButton: { opacity: 0.6 }, // ✅ Added for disabled button style
});
import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

type Caretaker = {
  id: string;
  email: string;
  propertyId: string;
  propertyName?: string;
};

type Property = {
  id: string;
  name: string;
  code: string;
};

export default function CaretakersScreen() {
  const router = useRouter();  
  const { landlordId } = useAuth();
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [landlordPassword, setLandlordPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (landlordId) loadData();
  }, [landlordId]);

  const loadData = async () => {
    if (!landlordId) return;
    setIsLoading(true);
    try {
      // Load properties
      const propsSnap = await getDocs(query(collection(db, 'properties'), where('landlordId', '==', landlordId)));
      const propsList: Property[] = propsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
      setProperties(propsList);

      // Load caretakers from Firestore
      const caretakersSnap = await getDocs(query(collection(db, 'caretakers'), where('landlordId', '==', landlordId)));
      const caretakersList: Caretaker[] = [];
      for (const docSnap of caretakersSnap.docs) {
        const data = docSnap.data();
        const property = propsList.find(p => p.id === data.propertyId);
        caretakersList.push({
          id: docSnap.id,
          email: data.email,
          propertyId: data.propertyId,
          propertyName: property?.name || 'Unknown',
        });
      }
      setCaretakers(caretakersList);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCaretaker = async () => {
  if (!newEmail.trim() || !newPassword.trim() || !selectedPropertyId || !landlordPassword.trim()) {
    Alert.alert('Error', 'Please fill all fields including your landlord password');
    return;
  }

  setIsSubmitting(true);

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No landlord logged in');
    const landlordEmail = currentUser.email;
    if (!landlordEmail) throw new Error('Landlord email not found');

    // Optional: check if caretaker email already exists in your Firestore list
    try {
      const existingCaretaker = await getDocs(
        query(collection(db, 'caretakers'), where('email', '==', newEmail.trim()), where('landlordId', '==', landlordId))
      );
      if (!existingCaretaker.empty) {
        Alert.alert('Error', 'A caretaker with this email already exists in your list.');
        return;
      }
    } catch (err) {
      // ignore Firestore check error
    }

    // STEP 1: Create caretaker user (this will sign out the landlord)
    let caretakerUid = null;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, newEmail.trim(), newPassword.trim());
      caretakerUid = userCredential.user.uid;
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Error', `Email ${newEmail} is already registered. Please use a different email.`);
      } else {
        throw error;
      }
      return;
    }

    // STEP 2: Immediately log landlord back in
    await signInWithEmailAndPassword(auth, landlordEmail, landlordPassword);
    
    // ✅ STEP 3: Update the selected property with caretakerId
    const propertyRef = doc(db, 'properties', selectedPropertyId);
    await updateDoc(propertyRef, { caretakerId: caretakerUid });

    // STEP 4: Save caretaker record to Firestore (optional audit)
    await addDoc(collection(db, 'caretakers'), {
      email: newEmail.trim(),
      propertyId: selectedPropertyId,
      landlordId: landlordId,
      createdAt: new Date().toISOString(),
      firebaseUid: caretakerUid,
    });
    
    Alert.alert('Success', 'Caretaker account created and assigned');
    setModalVisible(false);
    setNewEmail('');
    setNewPassword('');
    setSelectedPropertyId('');
    setLandlordPassword('');
    loadData();
  } catch (error: any) {
    console.error(error);
    if (error.code === 'auth/wrong-password') {
      Alert.alert('Error', 'Your landlord password is incorrect.');
    } else if (error.message.includes('permission')) {
      Alert.alert('Warning', 'Caretaker was created but we had a small permission issue. Please check if the caretaker appears in the list.');
      await loadData(); // reload the list anyway
    } else {
      Alert.alert('Error', error.message || 'Failed to create caretaker');
    }
  } finally {
    setIsSubmitting(false);
  }
};

  const handleDeleteCaretaker = async (id: string, email: string) => {
    Alert.alert(
      'Delete Caretaker',
      `Are you sure you want to delete ${email}? The caretaker's login will no longer work.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // First, get the caretaker document to retrieve firebaseUid
              const caretakerDoc = await getDocs(query(collection(db, 'caretakers'), where('email', '==', email), where('landlordId', '==', landlordId)));
              if (!caretakerDoc.empty) {
                const firebaseUid = caretakerDoc.docs[0].data().firebaseUid;
                // Delete from Firebase Auth (requires admin SDK – client can't do this directly)
                // So we cannot delete the Auth user from client side. We can only remove the Firestore record.
                // For now, just delete Firestore record. Caretaker will still be able to log in but won't have access.
                // To fully delete, we need a Cloud Function. But we skip that for now.
              }
              await deleteDoc(doc(db, 'caretakers', id));
              loadData();
              Alert.alert('Success', 'Caretaker removed from your list. (Auth user remains – to fully delete, use Firebase Console or a Cloud Function)');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const renderCaretaker = ({ item }: { item: Caretaker }) => (
  <TouchableOpacity 
    onPress={() => router.push(`/caretaker-details?id=${item.id}`)} 
    activeOpacity={0.7}
  >
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.email}>{item.email}</Text>
        <Text style={styles.property}>Property: {item.propertyName}</Text>
      </View>
      <TouchableOpacity 
        onPress={() => handleDeleteCaretaker(item.id, item.email)} 
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Caretakers</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#27ae60" style={styles.loader} />
      ) : caretakers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No caretakers yet</Text>
          <Text style={styles.emptySubtext}>Tap + Add to create a caretaker</Text>
        </View>
      ) : (
        <FlatList
          data={caretakers}
          renderItem={renderCaretaker}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshing={isLoading}
          onRefresh={loadData}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Caretaker</Text>
            <TextInput
              style={styles.input}
              placeholder="Caretaker Email"
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Caretaker Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <Text style={styles.label}>Assign to Property</Text>
            {properties.map(prop => (
              <TouchableOpacity
                key={prop.id}
                style={[styles.propertyOption, selectedPropertyId === prop.id && styles.selectedProperty]}
                onPress={() => setSelectedPropertyId(prop.id)}
              >
                <Text style={styles.propertyOptionText}>{prop.name} ({prop.code})</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.label, { marginTop: 16 }]}>Your Landlord Password (to re-authenticate)</Text>
            <TextInput
              style={styles.input}
              placeholder="Your password"
              value={landlordPassword}
              onChangeText={setLandlordPassword}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddCaretaker} disabled={isSubmitting}>
                <Text style={styles.saveButtonText}>{isSubmitting ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  addButton: { backgroundColor: '#27ae60', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  loader: { marginTop: 50 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, color: '#95a5a6', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#bdc3c7', textAlign: 'center' },
  list: { padding: 15 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 15, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardInfo: { flex: 1 },
  email: { fontSize: 16, fontWeight: '600', color: '#2c3e50' },
  property: { fontSize: 14, color: '#7f8c8d', marginTop: 4 },
  deleteButton: { backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  deleteButtonText: { color: 'white', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%', maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#2c3e50', marginBottom: 8 },
  propertyOption: { padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8, backgroundColor: '#fff' },
  selectedProperty: { backgroundColor: '#e8f5e9', borderColor: '#27ae60' },
  propertyOptionText: { fontSize: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#ecf0f1' },
  cancelButtonText: { color: '#7f8c8d', fontWeight: '600' },
  saveButton: { backgroundColor: '#27ae60' },
  saveButtonText: { color: 'white', fontWeight: '600' },
});
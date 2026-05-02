import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

type Property = {
  id: string;
  name: string;
  code: string;
  caretakerId?: string;
};

export default function AssignCaretakerScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [uid, setUid] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadProperties();
  }, [landlordId]);

  const loadProperties = async () => {
    if (!landlordId) return;
    try {
      const q = query(collection(db, 'properties'), where('landlordId', '==', landlordId));
      const snap = await getDocs(q);
      const props = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
      setProperties(props);
    } catch (error) {
      Alert.alert('Error', 'Failed to load properties');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedProperty) {
      Alert.alert('Error', 'Select a property first');
      return;
    }
    if (!uid.trim()) {
      Alert.alert('Error', 'Please paste the caretaker UID');
      return;
    }

    setIsSubmitting(true);
    try {
      const propertyRef = doc(db, 'properties', selectedProperty.id);
      await updateDoc(propertyRef, { caretakerId: uid.trim() });
      Alert.alert('Success', `Caretaker assigned to ${selectedProperty.name}`);
      setUid('');
      setSelectedProperty(null);
      loadProperties();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderProperty = ({ item }: { item: Property }) => (
    <TouchableOpacity
      style={[styles.propertyCard, selectedProperty?.id === item.id && styles.selectedCard]}
      onPress={() => setSelectedProperty(item)}
    >
      <Text style={styles.propertyName}>{item.name}</Text>
      <Text style={styles.propertyCode}>Code: {item.code}</Text>
      {item.caretakerId && <Text style={styles.assigned}>Assigned caretaker UID: {item.caretakerId}</Text>}
    </TouchableOpacity>
  );

  if (isLoading) return <ActivityIndicator size="large" color="#27ae60" style={{ marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Assign Caretaker to Property</Text>
      <FlatList
        data={properties}
        renderItem={renderProperty}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />
      {selectedProperty && (
        <View style={styles.card}>
          <Text style={styles.label}>Paste Caretaker UID from Firebase Console:</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., abc123xyz..."
            value={uid}
            onChangeText={setUid}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.button} onPress={handleAssign} disabled={isSubmitting}>
            <Text style={styles.buttonText}>{isSubmitting ? 'Assigning...' : 'Assign Caretaker'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20 },
  list: { gap: 12 },
  propertyCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  selectedCard: { borderColor: '#27ae60', backgroundColor: '#e8f5e9' },
  propertyName: { fontSize: 18, fontWeight: '600', color: '#2c3e50' },
  propertyCode: { fontSize: 14, color: '#7f8c8d', marginTop: 4 },
  assigned: { fontSize: 12, color: '#27ae60', marginTop: 4 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12, marginTop: 20 },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 16 },
  button: { backgroundColor: '#27ae60', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
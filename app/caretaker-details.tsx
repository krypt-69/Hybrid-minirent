import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

type Caretaker = {
  id: string;
  email: string;
  propertyId: string;
  propertyName?: string;
  firebaseUid?: string;
  createdAt: string;
  landlordId: string;
};

export default function CaretakerDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // caretaker document ID
  const { landlordId } = useAuth();
  const [caretaker, setCaretaker] = useState<Caretaker | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id && landlordId) loadCaretaker();
  }, [id, landlordId]);

  const loadCaretaker = async () => {
    try {
      const docRef = doc(db, 'caretakers', id as string);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        Alert.alert('Error', 'Caretaker not found');
        router.back();
        return;
      }
      const data = snap.data();
      if (data.landlordId !== landlordId) {
        Alert.alert('Error', 'Permission denied');
        router.back();
        return;
      }

      // Fetch property name
      let propertyName = 'Unknown';
      if (data.propertyId) {
        const propSnap = await getDoc(doc(db, 'properties', data.propertyId));
        if (propSnap.exists()) propertyName = propSnap.data().name;
      }

      setCaretaker({
        id: snap.id,
        email: data.email,
        propertyId: data.propertyId,
        propertyName,
        firebaseUid: data.firebaseUid,
        createdAt: data.createdAt,
        landlordId: data.landlordId,
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load caretaker details');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return 'Invalid date';
    }
  };

  if (isLoading) return <ActivityIndicator size="large" color="#27ae60" style={{ marginTop: 50 }} />;
  if (!caretaker) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Caretaker Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{caretaker.email}</Text>

        <Text style={styles.label}>Assigned Property</Text>
        <Text style={styles.value}>{caretaker.propertyName}</Text>

        <Text style={styles.label}>Firebase UID (for reference)</Text>
        <Text style={styles.mono}>{caretaker.firebaseUid || 'Not stored'}</Text>

        <Text style={styles.label}>Created At</Text>
        <Text style={styles.value}>{formatDate(caretaker.createdAt)}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            Alert.alert(
              'Delete Caretaker',
              `Are you sure you want to delete ${caretaker.email}?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    // Firestore delete logic is already in caretakers.tsx, so just go back.
                    Alert.alert('Info', 'Please use the Delete button on the main list to remove this caretaker.');
                  }
                }
              ]
            );
          }}
        >
          <Text style={styles.deleteButtonText}>Delete Caretaker</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  backButton: { padding: 5 },
  backText: { fontSize: 16, color: '#27ae60' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
  card: { backgroundColor: 'white', borderRadius: 12, margin: 15, padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#7f8c8d', marginTop: 16, marginBottom: 4 },
  value: { fontSize: 16, color: '#2c3e50' },
  mono: { fontSize: 14, fontFamily: 'monospace', color: '#2c3e50', backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6 },
  actions: { margin: 15, marginTop: 0 },
  deleteButton: { backgroundColor: '#e74c3c', padding: 14, borderRadius: 8, alignItems: 'center' },
  deleteButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
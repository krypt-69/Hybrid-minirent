import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { db, propertiesCollection } from '../lib/firebase';
import { addDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function AddPropertyScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();   // ✅ use landlordId
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter property name');
      return;
    }
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter property code');
      return;
    }
    if (!landlordId) {
      Alert.alert('Error', 'You must be logged in as a landlord');
      return;
    }

    setIsLoading(true);
    try {
      await addDoc(propertiesCollection, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        location: location.trim(),
        landlordId: landlordId,   // ✅ changed from userId
        createdAt: new Date().toISOString(),
      });

      Alert.alert('Success', 'Property added successfully');
      router.back();
    } catch (error) {
      console.error('Error adding property:', error);
      Alert.alert('Error', 'Failed to add property');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Property</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Property Name *</Text>
<TextInput
  style={styles.input}
  placeholder="e.g., Sunrise Hostel"
  placeholderTextColor="#f39c12"  // Yellow-Orange
  value={name}
  onChangeText={setName}
/>

<Text style={styles.label}>Property Code *</Text>
<TextInput
  style={styles.input}
  placeholder="e.g., SR"
  placeholderTextColor="#3498db"  // Bright Blue
  value={code}
  onChangeText={setCode}
  autoCapitalize="characters"
/>
<Text style={styles.hint}>Used to create unique room codes (e.g., SR-A4)</Text>

<Text style={styles.label}>Location (Optional)</Text>
<TextInput
  style={styles.input}
  placeholder="e.g., Ngong Road, Nairobi"
  placeholderTextColor="#2ecc71"  // Bright Green
  value={location}
  onChangeText={setLocation}
/>

        <TouchableOpacity 
          style={[styles.saveButton, isLoading && styles.disabledButton]} 
          onPress={handleSave}
          disabled={isLoading}
        >
          <Text style={styles.saveButtonText}>
            {isLoading ? 'Saving...' : 'Save Property'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  backButton: { padding: 5 },
  backText: { fontSize: 16, color: '#27ae60' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#2c3e50', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  hint: { fontSize: 12, color: '#7f8c8d', marginTop: 4 },
  saveButton: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 30 },
  disabledButton: { backgroundColor: '#95a5a6' },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
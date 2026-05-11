import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { db, propertiesCollection } from '../../lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

type Property = {
  id: string;
  name: string;
  code: string;
  location?: string;
  landlordId: string;
};

export default function PropertiesScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (landlordId) {
      loadProperties();
    }
  }, [landlordId]);

  const loadProperties = async () => {
    if (!landlordId) return;
    try {
      const q = query(propertiesCollection, where('landlordId', '==', landlordId));
      const querySnapshot = await getDocs(q);
      const propertiesList: Property[] = [];
      querySnapshot.forEach((doc) => {
        propertiesList.push({ id: doc.id, ...doc.data() } as Property);
      });
      setProperties(propertiesList);
    } catch (error) {
      console.error('Error loading properties:', error);
      Alert.alert('Error', 'Failed to load properties');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProperty = () => {
    router.push('/add-property');
  };

  const handleDeleteProperty = async (id: string, name: string) => {
    Alert.alert(
      'Delete Property',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'properties', id));
              loadProperties();
              Alert.alert('Success', 'Property deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete property');
            }
          }
        }
      ]
    );
  };

  const renderProperty = ({ item }: { item: Property }) => (
    <TouchableOpacity 
      style={styles.propertyCard}
      onPress={() => router.push(`/property-details?id=${item.id}`)}
    >
      <View style={styles.propertyInfo}>
        <Text style={styles.propertyName}>{item.name}</Text>
        <Text style={styles.propertyCode}>Code: {item.code}</Text>
        {item.location && <Text style={styles.propertyLocation}>{item.location}</Text>}
      </View>
      <TouchableOpacity 
        onPress={() => handleDeleteProperty(item.id, item.name)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Properties</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.refreshButton} onPress={loadProperties}>
            <Text style={styles.refreshButtonText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleAddProperty}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : properties.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No properties yet</Text>
          <Text style={styles.emptySubtext}>Tap + Add to create your first property</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          renderItem={renderProperty}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={loadProperties}
          refreshing={isLoading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  // New style for the button group
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refreshButton: { padding: 8 },
  refreshButtonText: { fontSize: 22, color: '#3498db' },
  addButton: { backgroundColor: '#27ae60', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  list: { padding: 15 },
  propertyCard: { backgroundColor: 'white', borderRadius: 12, padding: 15, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  propertyInfo: { flex: 1 },
  propertyName: { fontSize: 18, fontWeight: '600', color: '#2c3e50' },
  propertyCode: { fontSize: 14, color: '#7f8c8d', marginTop: 4 },
  propertyLocation: { fontSize: 12, color: '#95a5a6', marginTop: 2 },
  deleteButton: { padding: 8 },
  deleteText: { color: '#e74c3c', fontSize: 14 },
  loading: { textAlign: 'center', marginTop: 50, color: '#95a5a6' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, color: '#95a5a6', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#bdc3c7', textAlign: 'center' },
});
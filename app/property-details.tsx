import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db, propertiesCollection, tenantsCollection } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

type Property = {
  id: string;
  name: string;
  code: string;
  location?: string;
  landlordId: string;
  createdAt: string;
};

type Tenant = {
  id: string;
  name: string;
  phone: string;
  room: string;
  roomCode: string;
  monthlyRent: number;
  balance: number;
  status: string;
};

export default function PropertyDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { landlordId } = useAuth();   // ✅ use landlordId
  const [property, setProperty] = useState<Property | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id && landlordId) {
      loadData();
    }
  }, [id, landlordId]);

  const loadData = async () => {
    if (!landlordId) return;
    
    try {
      // Load property details
      const propertyDoc = await getDoc(doc(db, 'properties', id as string));
      if (propertyDoc.exists()) {
        const data = propertyDoc.data();
        if (data.landlordId !== landlordId) {
          Alert.alert('Error', 'You do not have permission to view this property');
          router.back();
          return;
        }
        setProperty({
          id: propertyDoc.id,
          name: data.name,
          code: data.code,
          location: data.location,
          landlordId: data.landlordId,
          createdAt: data.createdAt,
        });
      } else {
        Alert.alert('Error', 'Property not found');
        router.back();
        return;
      }

      // Load tenants for this property (they already have landlordId filter, but we need propertyId)
      const tenantsQuery = query(
        tenantsCollection,
        where('propertyId', '==', id),
        where('landlordId', '==', landlordId)
      );
      const tenantsSnapshot = await getDocs(tenantsQuery);
      const tenantsList: Tenant[] = [];
      tenantsSnapshot.forEach((doc) => {
        const data = doc.data();
        tenantsList.push({
          id: doc.id,
          name: data.name,
          phone: data.phone,
          room: data.room,
          roomCode: data.roomCode,
          monthlyRent: data.monthlyRent,
          balance: data.balance || 0,
          status: data.status || 'active',
        });
      });
      setTenants(tenantsList);
    } catch (error) {
      console.error('Error loading property:', error);
      Alert.alert('Error', 'Failed to load property details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProperty = async () => {
    Alert.alert(
      'Delete Property',
      `Are you sure you want to delete "${property?.name}"? This will also delete all tenants in this property.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all tenants in this property first
              for (const tenant of tenants) {
                await deleteDoc(doc(db, 'tenants', tenant.id));
              }
              // Delete the property
              await deleteDoc(doc(db, 'properties', id as string));
              Alert.alert('Success', 'Property deleted successfully');
              router.back();
            } catch (error) {
              console.error('Error deleting property:', error);
              Alert.alert('Error', 'Failed to delete property');
            }
          }
        }
      ]
    );
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString()}`;
  };

  const getTotalMonthlyRent = () => {
    return tenants.filter(t => t.status === 'active').reduce((sum, t) => sum + t.monthlyRent, 0);
  };

  const getTotalArrears = () => {
    return tenants.filter(t => t.status === 'active').reduce((sum, t) => sum + (t.balance > 0 ? t.balance : 0), 0);
  };

  const getOccupancyRate = () => {
    const totalRooms = tenants.length;
    const activeRooms = tenants.filter(t => t.status === 'active').length;
    if (totalRooms === 0) return 0;
    return Math.round((activeRooms / totalRooms) * 100);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#27ae60" />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.centerContainer}>
        <Text>Property not found</Text>
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
        <Text style={styles.headerTitle}>Property Details</Text>
        <TouchableOpacity onPress={handleDeleteProperty} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Property Info Card */}
      <View style={styles.card}>
        <Text style={styles.propertyName}>{property.name}</Text>
        <Text style={styles.propertyCode}>Code: {property.code}</Text>
        {property.location && <Text style={styles.propertyLocation}>📍 {property.location}</Text>}
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{tenants.length}</Text>
          <Text style={styles.statLabel}>Total Rooms</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{tenants.filter(t => t.status === 'active').length}</Text>
          <Text style={styles.statLabel}>Occupied</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{getOccupancyRate()}%</Text>
          <Text style={styles.statLabel}>Occupancy</Text>
        </View>
      </View>

      {/* Financial Summary */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>💰 Financial Summary</Text>
        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>Total Monthly Rent:</Text>
          <Text style={styles.financialValue}>{formatCurrency(getTotalMonthlyRent())}</Text>
        </View>
        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>Total Arrears:</Text>
          <Text style={[styles.financialValue, styles.arrears]}>{formatCurrency(getTotalArrears())}</Text>
        </View>
      </View>

      {/* Tenants List */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>👥 Tenants ({tenants.length})</Text>
        {tenants.length === 0 ? (
          <Text style={styles.emptyText}>No tenants in this property</Text>
        ) : (
          tenants.map((tenant) => (
            <TouchableOpacity
              key={tenant.id}
              style={styles.tenantItem}
              onPress={() => router.push(`/tenant-details?id=${tenant.id}`)}
            >
              <View style={styles.tenantInfo}>
                <Text style={styles.tenantName}>{tenant.name}</Text>
                <Text style={styles.tenantRoom}>Room: {tenant.room} ({tenant.roomCode})</Text>
                <Text style={styles.tenantRent}>Rent: {formatCurrency(tenant.monthlyRent)}</Text>
              </View>
              <View style={styles.tenantRight}>
                <Text style={[styles.tenantBalance, tenant.balance > 0 ? styles.balanceDue : styles.balancePaid]}>
                  {formatCurrency(Math.abs(tenant.balance))}
                </Text>
                <Text style={styles.tenantStatus}>
                  {tenant.status === 'active' ? '✅ Active' : '❌ Inactive'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// Styles remain unchanged – copy from your original property-details.tsx.

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  deleteButton: {
    padding: 5,
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#e74c3c',
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    margin: 15,
    marginTop: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  propertyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  propertyCode: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  propertyLocation: {
    fontSize: 14,
    color: '#3498db',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  statLabel: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 15,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  financialLabel: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  financialValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  arrears: {
    color: '#e74c3c',
  },
  tenantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
  },
  tenantRoom: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  tenantRent: {
    fontSize: 12,
    color: '#27ae60',
    marginTop: 2,
  },
  tenantRight: {
    alignItems: 'flex-end',
  },
  tenantBalance: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  balanceDue: {
    color: '#e74c3c',
  },
  balancePaid: {
    color: '#27ae60',
  },
  tenantStatus: {
    fontSize: 11,
    color: '#95a5a6',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#95a5a6',
    padding: 20,
  },
});
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function ReportsScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();
  const [loading, setLoading] = useState(false);

  const generateCSV = async (type: 'arrears' | 'payments' | 'complaints') => {
    if (!landlordId) return;
    setLoading(true);
    try {
      let data: any[] = [];
      let headers: string[] = [];
      let fileName = '';

      if (type === 'arrears') {
        const q = query(collection(db, 'tenants'), where('landlordId', '==', landlordId));
        const snap = await getDocs(q);
        data = snap.docs.map(doc => {
          const d = doc.data();
          return {
            Name: d.name || 'Unknown',
            Room: d.roomCode || 'N/A',
            Balance: d.balance || 0,
            Rent: d.monthlyRent || 0,
            Phone: d.phone || '',
            Status: d.status || 'active',      // ✅ added status
          };
        }).filter(t => t.Balance > 0);  // Only arrears
        headers = ['Name', 'Room', 'Balance', 'Rent', 'Phone', 'Status'];
        fileName = 'arrears_report.csv';
      } 
      else if (type === 'payments') {
        const q = query(collection(db, 'payments'), where('landlordId', '==', landlordId));
        const snap = await getDocs(q);
        data = snap.docs.map(doc => {
          const d = doc.data();
          return {
            Tenant: d.tenantName || 'Unknown',
            Room: d.roomCode || 'N/A',
            Amount: d.amount || 0,
            Date: d.date?.toDate?.()?.toLocaleDateString() || 'Unknown',
            Source: d.source || 'manual',
          };
        });
        headers = ['Tenant', 'Room', 'Amount', 'Date', 'Source'];
        fileName = 'payments_report.csv';
      } 
      else if (type === 'complaints') {
        const q = query(collection(db, 'complaints'), where('landlordId', '==', landlordId));
        const snap = await getDocs(q);
        data = snap.docs.map(doc => {
          const d = doc.data();
          return {
            Tenant: d.tenantName || 'Unknown',
            Room: d.roomCode || 'N/A',
            Message: d.message || '',
            Status: d.status || 'open',
            Date: d.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown',
          };
        });
        headers = ['Tenant', 'Room', 'Message', 'Status', 'Date'];
        fileName = 'complaints_report.csv';
      }

      if (data.length === 0) {
        Alert.alert('No Data', 'No records to export.');
        return;
      }

      // Build CSV
      const csvRows = [];
      csvRows.push(headers.join(','));
      for (const row of data) {
        const values = headers.map(header => {
          let val = row[header] ?? '';
          // Convert numbers/booleans to string
          if (typeof val === 'number') val = val.toString();
          // Escape double quotes
          val = String(val).replace(/"/g, '""');
          // Wrap in quotes if contains comma
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = `"${val}"`;
          }
          return val;
        });
        csvRows.push(values.join(','));
      }
      const csvString = csvRows.join('\n');
      
      // Use legacy API to avoid deprecation warnings
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csvString);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing not available on this device');
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate report: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Export Reports (CSV)</Text>
        <TouchableOpacity style={styles.button} onPress={() => generateCSV('arrears')} disabled={loading}>
          <Text style={styles.buttonText}>💰 Arrears List</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => generateCSV('payments')} disabled={loading}>
          <Text style={styles.buttonText}>💳 Payment History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => generateCSV('complaints')} disabled={loading}>
          <Text style={styles.buttonText}>💬 Complaints Report</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator size="large" color="#27ae60" style={{ marginTop: 20 }} />}
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
  card: { backgroundColor: 'white', borderRadius: 12, margin: 15, padding: 20, alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 20, color: '#2c3e50' },
  button: { backgroundColor: '#27ae60', padding: 14, borderRadius: 8, marginBottom: 12, width: '100%', alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
});
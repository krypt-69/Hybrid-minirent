import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, landlordId, isLoading } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await auth.signOut();
              router.replace('/login');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoggingOut(false);
            }
          }
        }
      ]
    );
  };

  if (isLoading) return <ActivityIndicator size="large" color="#27ae60" style={{ marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Account Email</Text>
        <Text style={styles.value}>{user?.email || 'Not logged in'}</Text>

        <Text style={styles.label}>Landlord ID (UID)</Text>
        <Text style={styles.mono}>{landlordId || 'N/A'}</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
        <Text style={styles.logoutText}>{loggingOut ? 'Logging out...' : '🚪 Logout'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  card: { backgroundColor: 'white', borderRadius: 12, margin: 15, padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#7f8c8d', marginTop: 16, marginBottom: 4 },
  value: { fontSize: 16, color: '#2c3e50' },
  mono: { fontSize: 14, fontFamily: 'monospace', color: '#2c3e50', backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6 },
  logoutButton: { backgroundColor: '#e74c3c', margin: 15, padding: 14, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
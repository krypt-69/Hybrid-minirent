import { Tabs } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { View, Text, ActivityIndicator } from 'react-native';

export default function TabLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#27ae60" />
      </View>
    );
  }

  // Optional: if user not authenticated, you could redirect to login, but your root layout already handles that.
  // For tabs, we assume user is authenticated.

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#27ae60',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🖥️</Text>,
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          title: 'Properties',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏢</Text>,
        }}
      />
      <Tabs.Screen
        name="tenants"
        options={{
          title: 'Tenants',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text>,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💳</Text>,
        }}
      />
      <Tabs.Screen
        name="arrears"
        options={{
          title: 'Arrears',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🚫</Text>,
        }}
      />
      <Tabs.Screen
        name="complaints"
        options={{
          title: 'Complaints',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💬</Text>,
        }}
      />
      {/* ✅ NEW: Caretakers Tab */}
      <Tabs.Screen
        name="caretakers"
        options={{
          title: 'Caretakers',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔑</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
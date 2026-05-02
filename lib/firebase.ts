import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getStorage } from 'firebase/storage';

// NEW Firebase configuration for the new account
const firebaseConfig = {
  apiKey: "AIzaSyB9oJujZRT3TCVFeinr-VuQsA6YmJoEOzk",
  authDomain: "minirent-landlord.firebaseapp.com",
  projectId: "minirent-landlord",
  storageBucket: "minirent-landlord.firebasestorage.app",
  messagingSenderId: "853147470002",
  appId: "1:853147470002:web:5caf8b46d4f635576e21ab",
  measurementId: "G-N185W1VQ4Y"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with React Native persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

// Firestore and Storage
export const db = getFirestore(app);
export const storage = getStorage(app);

// Collection references (same names as before)
export const tenantsCollection = collection(db, 'tenants');
export const propertiesCollection = collection(db, 'properties');
export const paymentsCollection = collection(db, 'payments');
export const complaintsCollection = collection(db, 'complaints');
export const unmatchedPaymentsCollection = collection(db, 'unmatchedPayments');

// Helper (optional)
export const getTenantByPhone = (phone: string) => doc(db, 'tenants', phone);

export { auth };
export default app;
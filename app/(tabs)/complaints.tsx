import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { db, complaintsCollection } from '../../lib/firebase';
import { collection, getDocs, query, where, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';

type Complaint = {
  id: string;
  tenantId: string;
  tenantName: string;
  roomCode: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
  landlordId: string;
  propertyId: string;
};

export default function ComplaintsScreen() {
  const router = useRouter();
  const { landlordId } = useAuth();   // ✅ use landlordId
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (landlordId) {
      loadComplaints();
    }
  }, [landlordId]);

  const loadComplaints = async () => {
    if (!landlordId) return;
    
    try {
      // Load complaints for this landlord
      const q = query(
        complaintsCollection,
        where('landlordId', '==', landlordId)
      );
      const querySnapshot = await getDocs(q);
      const complaintsList: Complaint[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        complaintsList.push({
          id: doc.id,
          tenantId: data.tenantId,
          tenantName: data.tenantName,
          roomCode: data.roomCode,
          message: data.message,
          status: data.status,
          createdAt: data.createdAt?.toDate() || new Date(),
          resolvedAt: data.resolvedAt?.toDate(),
          landlordId: data.landlordId,
          propertyId: data.propertyId,
        });
      });
      // Sort newest first
      complaintsList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setComplaints(complaintsList);
    } catch (error) {
      console.error('Error loading complaints:', error);
      Alert.alert('Error', 'Failed to load complaints');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    if (!landlordId) return;
    setRefreshing(true);
    loadComplaints();
  }, [landlordId]);

  const handleResolveComplaint = async (complaint: Complaint) => {
    Alert.alert(
      'Resolve Complaint',
      `Mark "${complaint.tenantName}'s complaint as resolved?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            try {
              const complaintRef = doc(db, 'complaints', complaint.id);
              await updateDoc(complaintRef, {
                status: 'resolved',
                resolvedAt: Timestamp.now(),
                resolvedBy: 'landlord',
              });
              loadComplaints();
              Alert.alert('Success', 'Complaint marked as resolved');
            } catch (error) {
              console.error('Error resolving complaint:', error);
              Alert.alert('Error', 'Failed to resolve complaint');
            }
          }
        }
      ]
    );
  };

  const handleReopenComplaint = async (complaint: Complaint) => {
    Alert.alert(
      'Reopen Complaint',
      `Reopen "${complaint.tenantName}'s complaint?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: async () => {
            try {
              const complaintRef = doc(db, 'complaints', complaint.id);
              await updateDoc(complaintRef, {
                status: 'open',
                resolvedAt: null,
              });
              loadComplaints();
              Alert.alert('Success', 'Complaint reopened');
            } catch (error) {
              console.error('Error reopening complaint:', error);
              Alert.alert('Error', 'Failed to reopen complaint');
            }
          }
        }
      ]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-KE', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    if (status === 'open') {
      return <View style={[styles.badge, styles.openBadge]}><Text style={styles.badgeText}>🟡 Open</Text></View>;
    }
    return <View style={[styles.badge, styles.resolvedBadge]}><Text style={styles.badgeText}>🟢 Resolved</Text></View>;
  };

  const renderComplaintItem = ({ item }: { item: Complaint }) => (
    <TouchableOpacity 
      style={styles.complaintCard}
      onPress={() => {
        setSelectedComplaint(item);
        setModalVisible(true);
      }}
    >
      <View style={styles.complaintHeader}>
        <View>
          <Text style={styles.tenantName}>{item.tenantName}</Text>
          <Text style={styles.roomCode}>Room: {item.roomCode}</Text>
        </View>
        {getStatusBadge(item.status)}
      </View>
      
      <Text style={styles.complaintMessage} numberOfLines={2}>
        {item.message}
      </Text>
      
      <View style={styles.complaintFooter}>
        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        {item.status === 'open' ? (
          <TouchableOpacity 
            style={styles.resolveButton}
            onPress={() => handleResolveComplaint(item)}
          >
            <Text style={styles.resolveButtonText}>Mark Resolved</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.reopenButton}
            onPress={() => handleReopenComplaint(item)}
          >
            <Text style={styles.reopenButtonText}>Reopen</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const getOpenComplaintsCount = () => {
    return complaints.filter(c => c.status === 'open').length;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tenant Complaints</Text>
        {getOpenComplaintsCount() > 0 && (
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{getOpenComplaintsCount()}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          ⚠️ You have {getOpenComplaintsCount()} open complaint(s). Tap on any complaint to view details.
        </Text>
      </View>

      {isLoading && !refreshing ? (
        <Text style={styles.loading}>Loading complaints...</Text>
      ) : complaints.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyText}>No complaints</Text>
          <Text style={styles.emptySubtext}>All complaints from tenants will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={complaints}
          renderItem={renderComplaintItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Complaint Detail Modal (same as before) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complaint Details</Text>
            
            {selectedComplaint && (
              <>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Tenant:</Text>
                  <Text style={styles.detailValue}>{selectedComplaint.tenantName}</Text>
                  
                  <Text style={styles.detailLabel}>Room:</Text>
                  <Text style={styles.detailValue}>{selectedComplaint.roomCode}</Text>
                  
                  <Text style={styles.detailLabel}>Date:</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedComplaint.createdAt)}</Text>
                  
                  <Text style={styles.detailLabel}>Status:</Text>
                  <View style={styles.statusContainer}>
                    {getStatusBadge(selectedComplaint.status)}
                  </View>
                  
                  <Text style={styles.detailLabel}>Complaint:</Text>
                  <View style={styles.messageBox}>
                    <Text style={styles.messageText}>{selectedComplaint.message}</Text>
                  </View>
                </View>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.closeModalButton]} 
                    onPress={() => {
                      setModalVisible(false);
                      setSelectedComplaint(null);
                    }}
                  >
                    <Text style={styles.closeModalButtonText}>Close</Text>
                  </TouchableOpacity>
                  {selectedComplaint.status === 'open' ? (
                    <TouchableOpacity 
                      style={[styles.modalButton, styles.resolveModalButton]} 
                      onPress={() => {
                        handleResolveComplaint(selectedComplaint);
                        setModalVisible(false);
                      }}
                    >
                      <Text style={styles.resolveModalButtonText}>Mark Resolved</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={[styles.modalButton, styles.reopenModalButton]} 
                      onPress={() => {
                        handleReopenComplaint(selectedComplaint);
                        setModalVisible(false);
                      }}
                    >
                      <Text style={styles.reopenModalButtonText}>Reopen</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Styles are the same as your original file – please keep your existing styles.
// If you need them, copy from your original complaints.tsx.


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  badgeCount: {
    backgroundColor: '#e74c3c',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeCountText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  infoBanner: {
    backgroundColor: '#fff3e0',
    margin: 15,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  infoText: {
    fontSize: 13,
    color: '#7f8c8d',
    lineHeight: 18,
  },
  list: {
    padding: 15,
  },
  complaintCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  complaintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  roomCode: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  openBadge: {
    backgroundColor: '#fff3e0',
  },
  resolvedBadge: {
    backgroundColor: '#e8f5e9',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  complaintMessage: {
    fontSize: 14,
    color: '#34495e',
    marginBottom: 12,
    lineHeight: 20,
  },
  complaintFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 11,
    color: '#95a5a6',
  },
  resolveButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resolveButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  reopenButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reopenButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  loading: {
    textAlign: 'center',
    marginTop: 50,
    color: '#95a5a6',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#95a5a6',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bdc3c7',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7f8c8d',
    marginTop: 10,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#2c3e50',
  },
  statusContainer: {
    marginTop: 4,
  },
  messageBox: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  messageText: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeModalButton: {
    backgroundColor: '#ecf0f1',
  },
  closeModalButtonText: {
    color: '#7f8c8d',
    fontWeight: '600',
  },
  resolveModalButton: {
    backgroundColor: '#27ae60',
  },
  resolveModalButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  reopenModalButton: {
    backgroundColor: '#3498db',
  },
  reopenModalButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
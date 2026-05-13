import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Snackbar from 'react-native-snackbar';
import serverUrl from '../config';

const RequestEsealsList = () => {
  const navigation = useNavigation();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchRequests = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token');

      const response = await axios.get(`${serverUrl}/rru-inventory/replenishment/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('API Response:', response.data); // Debug log

      if (response.data && Array.isArray(response.data)) {
        setRequests(response.data);
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Fetch requests error:', error);
      Snackbar.show({
        text: error.response?.data?.message || 'Failed to load requests',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const getStatusStyle = (status) => {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return { bg: '#FFF3E0', text: '#FF9800', icon: 'pending', label: 'Pending' };
      case 'FULFILLED':
        return { bg: '#E8F5E9', text: '#4CAF50', icon: 'check-circle', label: 'Fulfilled' };
      case 'REJECTED':
        return { bg: '#FFEBEE', text: '#F44336', icon: 'cancel', label: 'Rejected' };
      case 'APPROVED':
        return { bg: '#E3F2FD', text: '#2196F3', icon: 'thumb-up', label: 'Approved' };
      default:
        return { bg: '#F5F5F5', text: '#9E9E9E', icon: 'help', label: status || 'Unknown' };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not available';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getTimeAgo = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      return formatDate(dateString);
    } catch (error) {
      return '';
    }
  };

  const renderItem = ({ item }) => {
    const statusStyle = getStatusStyle(item.status);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          setSelectedRequest(item);
          setModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Icon name={statusStyle.icon} size={14} color={statusStyle.text} />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
          <View style={styles.dateContainer}>
            <Icon name="access-time" size={12} color="#888" />
            <Text style={styles.date}>{getTimeAgo(item.createdAt)}</Text>
          </View>
        </View>

        {/* Request ID */}
        <Text style={styles.requestId}>Request #{item.id}</Text>

        {/* Quantity with icon */}
        <View style={styles.quantityContainer}>
          <Icon name="inventory" size={20} color="#FFA500" />
          <Text style={styles.quantity}>
            {item.quantityRequested} E-Seal{item.quantityRequested !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Reason */}
        <View style={styles.reasonContainer}>
          <Icon name="description" size={16} color="#666" />
          <Text style={styles.reasonLabel}>Reason:</Text>
        </View>
        <Text style={styles.reason}>
          {item.reason || 'No reason provided'}
        </Text>

        {/* Additional Info */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Icon name="person" size={14} color="#888" />
            <Text style={styles.infoLabel}>Requested by:</Text>
            <Text style={styles.infoValue}>{item.rruName || 'Unknown'}</Text>
          </View>

          {item.approvedByName && (
            <View style={styles.infoItem}>
              <Icon name="verified-user" size={14} color="#4CAF50" />
              <Text style={styles.infoLabel}>Approved by:</Text>
              <Text style={styles.infoValue}>{item.approvedByName}</Text>
            </View>
          )}

          {item.approvedAt && (
            <View style={styles.infoItem}>
              <Icon name="event" size={14} color="#888" />
              <Text style={styles.infoLabel}>Approved on:</Text>
              <Text style={styles.infoValue}>{formatDate(item.approvedAt)}</Text>
            </View>
          )}
        </View>

        {/* Rejection reason if any */}
        {item.status === 'REJECTED' && item.rejectionReason && (
          <View style={styles.rejectionRow}>
            <Icon name="error-outline" size={16} color="#F44336" />
            <Text style={styles.rejectionLabel}>Rejection reason:</Text>
            <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
          </View>
        )}

        {/* Separator line before footer */}
        <View style={styles.footerSeparator} />

        {/* Footer with tap hint */}
        <View style={styles.cardFooter}>
          <Icon name="touch-app" size={14} color="#BBB" />
          <Text style={styles.tapHint}>Tap for details</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#FFA500" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My E-Seal Requests</Text>
          <Text style={styles.headerSubtitle}>
            Total: {requests.length} request{requests.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statsContainer}>
          <View style={styles.statBadge}>
            <Text style={styles.statText}>
              Pending: {requests.filter(r => r.status === 'PENDING').length}
            </Text>
          </View>
        </View>
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="inventory" size={64} color="#CCCCCC" />
          <Text style={styles.emptyText}>No requests found</Text>
          <Text style={styles.emptySubtext}>
            Tap the + button to request e-seals
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FFA500']} />
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('RequestEsealsForm')}
        activeOpacity={0.8}
      >
        <Icon name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {selectedRequest && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Request ID</Text>
                  <Text style={styles.detailValue}>#{selectedRequest.id}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.detailStatusBadge, { backgroundColor: getStatusStyle(selectedRequest.status).bg }]}>
                    <Icon name={getStatusStyle(selectedRequest.status).icon} size={16} color={getStatusStyle(selectedRequest.status).text} />
                    <Text style={[styles.detailStatusText, { color: getStatusStyle(selectedRequest.status).text }]}>
                      {getStatusStyle(selectedRequest.status).label}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Quantity</Text>
                  <Text style={styles.detailValue}>{selectedRequest.quantityRequested} E-Seal{selectedRequest.quantityRequested !== 1 ? 's' : ''}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>{selectedRequest.reason || 'No reason provided'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Requested By</Text>
                  <Text style={styles.detailValue}>{selectedRequest.rruName || 'Unknown'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Requested On</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedRequest.createdAt)}</Text>
                </View>

                {selectedRequest.approvedByName && (
                  <>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Approved By</Text>
                      <Text style={styles.detailValue}>{selectedRequest.approvedByName}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Approved On</Text>
                      <Text style={styles.detailValue}>{formatDate(selectedRequest.approvedAt)}</Text>
                    </View>
                  </>
                )}

                {selectedRequest.rejectionReason && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Rejection Reason</Text>
                    <Text style={[styles.detailValue, styles.rejectionTextValue]}>
                      {selectedRequest.rejectionReason}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
  },
  statBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: 11,
    color: '#888',
  },
  requestId: {
    fontSize: 13,
    color: '#FFA500',
    fontWeight: '600',
    marginBottom: 8,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  quantity: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  reasonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  reason: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
    paddingLeft: 20,
  },
  infoGrid: {
    marginTop: 8,
    gap: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  rejectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#FFEBEE',
    backgroundColor: '#FFF5F5',
    padding: 10,
    borderRadius: 8,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F44336',
  },
  rejectionText: {
    fontSize: 12,
    color: '#F44336',
    flex: 1,
  },
  footerSeparator: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginTop: 12,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tapHint: {
    fontSize: 11,
    color: '#BBB',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#BBB',
    textAlign: 'center',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#FFA500',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  detailStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  detailStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  rejectionTextValue: {
    color: '#F44336',
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 8,
  },
});

export default RequestEsealsList;
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Snackbar from 'react-native-snackbar';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const serverUrl = 'https://demo2.bsl.co.ke/api/v1';

// ✅ Helper function to get language header
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

// ✅ FIXED: Helper function to make authenticated axios request with retry on 401
const authenticatedAxios = async (method, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    // Create a new axios instance for each request
    const axiosInstance = axios.create();

    const response = await axiosInstance({
      method: method, // 'get', 'post', 'put', 'delete', etc.
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    return response;
  } catch (error) {
    console.error('❌ API Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    if (error.response?.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedAxios(method, config, i18n, 1);
      }
    }
    throw error;
  }
};

const EsealsReplacement = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    ticketId: '',
    newSealNumber: '',
    reason: '',
    oldDeviceConditionId: '',
  });

  // ✅ Listen for token refresh events
  React.useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in EsealsReplacement');
    });
    return () => removeListener();
  }, []);

  const fetchRequests = async () => {
    try {
      // ✅ FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/tickets/seal-replacement/my-requests`,
        },
        i18n
      );

      const data = response.data;
      if (data && Array.isArray(data.content)) {
        setRequests(data.content);
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Fetch seal replacement error:', error);
      Snackbar.show({
        text: error.response?.data?.message || t('eseals_replacement.errors.load_failed', { defaultValue: 'Failed to load requests' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      setRequests([]);
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

  const handleSubmitRequest = async () => {
    // Validation
    if (!formData.ticketId || isNaN(parseInt(formData.ticketId))) {
      Snackbar.show({ text: t('eseals_replacement.errors.valid_ticket_id', { defaultValue: 'Valid Ticket ID is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!formData.newSealNumber.trim()) {
      Snackbar.show({ text: t('eseals_replacement.errors.new_seal_required', { defaultValue: 'New seal number is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!formData.reason.trim()) {
      Snackbar.show({ text: t('eseals_replacement.errors.reason_required', { defaultValue: 'Please provide a reason' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!formData.oldDeviceConditionId || isNaN(parseInt(formData.oldDeviceConditionId))) {
      Snackbar.show({ text: t('eseals_replacement.errors.condition_id_required', { defaultValue: 'Valid old device condition ID is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }

    setSubmitting(true);
    try {
      const ticketId = parseInt(formData.ticketId);
      const payload = {
        ticketId: ticketId,
        newSealNumber: formData.newSealNumber.trim(),
        reason: formData.reason.trim(),
        oldDeviceConditionId: parseInt(formData.oldDeviceConditionId),
      };

      // ✅ FIXED: Changed from axios.post to 'post' string method
      const response = await authenticatedAxios(
        'post',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/tickets/${ticketId}/seal-replacement/request`,
          data: payload,
          headers: { 'Content-Type': 'application/json' },
        },
        i18n
      );

      if (response.status === 200 || response.status === 201) {
        Snackbar.show({
          text: t('eseals_replacement.success.submitted', { defaultValue: 'Seal replacement request submitted!' }),
          duration: 3000,
          backgroundColor: '#4CAF50',
        });
        // Close modal and reset form
        setModalVisible(false);
        setFormData({ ticketId: '', newSealNumber: '', reason: '', oldDeviceConditionId: '' });
        // Refresh list
        fetchRequests();
      } else {
        throw new Error('Unexpected response');
      }
    } catch (error) {
      console.error('Submit error:', error);
      Snackbar.show({
        text: error.response?.data?.message || t('eseals_replacement.errors.submit_failed', { defaultValue: 'Failed to submit request' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status) => {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return { bg: '#FFF3E0', text: '#FF9800', icon: 'pending', label: t('eseals_replacement.status.pending', { defaultValue: 'PENDING' }) };
      case 'APPROVED':
        return { bg: '#E8F5E9', text: '#4CAF50', icon: 'check-circle', label: t('eseals_replacement.status.approved', { defaultValue: 'APPROVED' }) };
      case 'REJECTED':
        return { bg: '#FFEBEE', text: '#F44336', icon: 'cancel', label: t('eseals_replacement.status.rejected', { defaultValue: 'REJECTED' }) };
      case 'IN_PROGRESS':
        return { bg: '#E3F2FD', text: '#2196F3', icon: 'autorenew', label: t('eseals_replacement.status.in_progress', { defaultValue: 'IN_PROGRESS' }) };
      default:
        return { bg: '#F5F5F5', text: '#9E9E9E', icon: 'help', label: status || t('eseals_replacement.status.unknown', { defaultValue: 'UNKNOWN' }) };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }) => {
    const statusStyle = getStatusStyle(item.status);

    // Extract seal replacement reason from comments
    const getSealReplacementReason = (ticket) => {
      if (!ticket.comments || ticket.comments.length === 0) return null;

      // Find the comment that contains seal replacement request
      const sealComment = ticket.comments.find(comment =>
        comment.content && comment.content.includes('Seal replacement requested')
      );

      if (sealComment && sealComment.content) {
        // Extract reason using regex
        const reasonMatch = sealComment.content.match(/Reason:\s*(.+?)(?:\n|$)/);
        if (reasonMatch && reasonMatch[1]) {
          return reasonMatch[1];
        }
        // Fallback: return the whole message if regex fails
        return sealComment.content;
      }
      return null;
    };

    const sealReason = getSealReplacementReason(item);
    const newSealNumber = item.newSealNumber;
    const isSealRequested = item.sealReplacementRequested;
    const isApproved = item.sealReplacementApproved;
    const isRejected = item.sealReplacementRejected;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Icon name={statusStyle.icon} size={14} color={statusStyle.text} />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* Ticket Info */}
        <Text style={styles.ticketNumber}>{item.ticketNumber}</Text>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>

        {/* Device and Truck Info */}
        <View style={styles.infoRow}>
          <Icon name="devices" size={14} color="#888" />
          <Text style={styles.infoText}>{t('eseals_replacement.device_label', { defaultValue: 'Device' })}: {item.deviceSerialNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Icon name="local-shipping" size={14} color="#888" />
          <Text style={styles.infoText}>{t('eseals_replacement.truck_label', { defaultValue: 'Truck' })}: {item.truckRegistrationNumber}</Text>
        </View>

        {/* Seal Replacement Info */}
        {isSealRequested && (
          <View style={styles.sealRequestContainer}>
            <View style={styles.sealBadge}>
              <Icon name="enhanced-encryption" size={14} color="#FF9800" />
              <Text style={styles.sealBadgeText}>{t('eseals_replacement.seal_requested', { defaultValue: 'Seal Replacement Requested' })}</Text>
            </View>

            {newSealNumber && (
              <View style={styles.infoRow}>
                <Icon name="vpn-key" size={14} color="#4CAF50" />
                <Text style={styles.infoText}>{t('eseals_replacement.new_seal_label', { defaultValue: 'New Seal' })}: {newSealNumber}</Text>
              </View>
            )}

            {sealReason && (
              <View style={styles.reasonContainer}>
                <Text style={styles.reasonLabel}>{t('eseals_replacement.reason_label', { defaultValue: 'Reason' })}:</Text>
                <Text style={styles.reasonText}>{sealReason}</Text>
              </View>
            )}

            {isApproved && (
              <View style={styles.approvedRow}>
                <Icon name="verified-user" size={16} color="#4CAF50" />
                <Text style={styles.approvedText}>{t('eseals_replacement.approved_label', { defaultValue: 'Approved' })}</Text>
              </View>
            )}

            {isRejected && (
              <View style={styles.rejectionRow}>
                <Icon name="error-outline" size={16} color="#F44336" />
                <Text style={styles.rejectionText}>{t('eseals_replacement.rejected_label', { defaultValue: 'Rejected' })}</Text>
              </View>
            )}
          </View>
        )}
      </View>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('eseals_replacement.title', { defaultValue: 'Seal Replacement Requests' })}</Text>
        <View style={{ width: 40 }} />
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="inventory" size={64} color="#CCCCCC" />
          <Text style={styles.emptyText}>{t('eseals_replacement.empty.title', { defaultValue: 'No replacement requests' })}</Text>
          <Text style={styles.emptySubtext}>{t('eseals_replacement.empty.subtext', { defaultValue: 'Tap + to request a seal replacement' })}</Text>
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

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
        <Icon name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Modal Form */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('eseals_replacement.modal.title', { defaultValue: 'New Seal Replacement' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('eseals_replacement.form.ticket_id', { defaultValue: 'Ticket ID' })} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('eseals_replacement.placeholders.ticket_id', { defaultValue: 'Enter ticket ID' })}
                  keyboardType="numeric"
                  value={formData.ticketId}
                  onChangeText={(text) => setFormData({ ...formData, ticketId: text })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('eseals_replacement.form.new_seal_number', { defaultValue: 'New Seal Number' })} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('eseals_replacement.placeholders.new_seal_number', { defaultValue: 'Enter new seal number' })}
                  value={formData.newSealNumber}
                  onChangeText={(text) => setFormData({ ...formData, newSealNumber: text })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('eseals_replacement.form.reason', { defaultValue: 'Reason' })} *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('eseals_replacement.placeholders.reason', { defaultValue: 'Explain the reason for replacement' })}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={formData.reason}
                  onChangeText={(text) => setFormData({ ...formData, reason: text })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('eseals_replacement.form.condition_id', { defaultValue: 'Old Device Condition ID' })} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('eseals_replacement.placeholders.condition_id', { defaultValue: 'Enter condition ID (e.g., 1 for damaged)' })}
                  keyboardType="numeric"
                  value={formData.oldDeviceConditionId}
                  onChangeText={(text) => setFormData({ ...formData, oldDeviceConditionId: text })}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.disabledButton]}
                onPress={handleSubmitRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('eseals_replacement.buttons.submit', { defaultValue: 'Submit Request' })}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A1A' },
  listContent: { padding: 16, paddingBottom: 80 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  date: { fontSize: 12, color: '#888' },
  quantity: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  reason: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
  approvedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  approvedText: { fontSize: 12, color: '#4CAF50' },
  rejectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  rejectionText: { fontSize: 12, color: '#F44336', flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#999', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#BBB', textAlign: 'center', marginTop: 8 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  ticketNumber: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFA500',
      marginBottom: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1A1A1A',
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    infoText: {
      fontSize: 13,
      color: '#666',
      flex: 1,
    },
    sealRequestContainer: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#F0F0F0',
    },
    sealBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#FFF3E0',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginBottom: 10,
    },
    sealBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FF9800',
    },
    reasonContainer: {
      backgroundColor: '#F8F9FA',
      padding: 10,
      borderRadius: 8,
      marginTop: 8,
    },
    reasonLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#666',
      marginBottom: 4,
    },
    reasonText: {
      fontSize: 13,
      color: '#333',
      lineHeight: 18,
    },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  disabledButton: { backgroundColor: '#CCCCCC' },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

export default EsealsReplacement;
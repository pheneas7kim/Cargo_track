import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const RequestEsealsForm = () => {
  const navigation = useNavigation();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ========== OFFLINE MODE INITIALIZATION ==========
  React.useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Request Eseals Form');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            // Sync pending requests when coming online
            syncPendingRequests();
          }
          if (!online) {
            Snackbar.show({
              text: 'Offline mode - Requests will be saved locally',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      // Cleanup
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Save request offline ==========
  const saveRequestOffline = async (qty, reqReason) => {
    try {
      const offlineRequest = {
        id: Date.now().toString(),
        quantity: qty,
        reason: reqReason,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'QUEUED',
        retryCount: 0
      };

      const existingRequests = await OfflineDatabaseService.getUserData('pending_eseal_requests') || [];
      existingRequests.push(offlineRequest);
      await OfflineDatabaseService.saveUserData('pending_eseal_requests', existingRequests);

      // Also add to sync queue
      await OfflineDatabaseService.addToSyncQueue('ESEAL_REQUEST', '/rru-inventory/replenishment/request', {
        quantity: qty,
        reason: reqReason
      });

      // Save to request history
      const requestHistory = await OfflineDatabaseService.getUserData('eseal_request_history') || [];
      requestHistory.unshift({
        id: offlineRequest.id,
        quantity: qty,
        reason: reqReason,
        timestamp: offlineRequest.timestamp,
        status: 'QUEUED'
      });
      await OfflineDatabaseService.saveUserData('eseal_request_history', requestHistory.slice(0, 50)); // Keep last 50

      console.log(`📦 E-seal request for ${qty} units saved offline`);
      return true;
    } catch (error) {
      console.error('Error saving request offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE REQUEST ==========

  // ========== OFFLINE: Sync pending requests ==========
  const syncPendingRequests = async () => {
    if (!isOnline) return;

    const pendingRequests = await OfflineDatabaseService.getUserData('pending_eseal_requests');
    if (!pendingRequests || pendingRequests.length === 0) return;

    console.log(`🔄 Processing ${pendingRequests.length} pending e-seal requests...`);
    let successCount = 0;
    let failCount = 0;

    for (const request of pendingRequests) {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        if (!token) throw new Error('No token');

        const payload = { quantity: request.quantity, reason: request.reason };
        const response = await axios.post(
          `${serverUrl}/rru-inventory/replenishment/request`,
          payload,
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        if (response.status === 200 || response.status === 201) {
          successCount++;
          console.log(`✅ Synced request for ${request.quantity} e-seals`);
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Error syncing request for ${request.quantity} e-seals:`, error);
        failCount++;
      }
    }

    // Clear processed requests
    await OfflineDatabaseService.saveUserData('pending_eseal_requests', []);

    if (successCount > 0) {
      Snackbar.show({
        text: `Synced ${successCount} e-seal request(s) to server`,
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    }
  };
  // ========== END OFFLINE SYNC REQUESTS ==========

  // ========== OFFLINE: Manual sync for pending requests ==========
  const manualSyncRequests = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot sync while offline',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setLoading(true);
    try {
      await syncPendingRequests();
      Snackbar.show({
        text: 'Requests synchronized!',
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: 'Sync failed',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  // Disable hardware back button if needed, or keep default (go back)
  // We'll keep default behaviour – user can press back without confirmation
  // If you want to prevent accidental exit while loading, add a confirmation.

  const handleSubmit = async () => {
    const qty = parseInt(quantity, 10);
    if (!quantity || isNaN(qty) || qty <= 0) {
      Snackbar.show({
        text: 'Please enter a valid quantity (greater than 0)',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }
    if (!reason.trim()) {
      Snackbar.show({
        text: 'Please provide a reason for the request',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setLoading(true);

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      console.log('📴 Offline - saving e-seal request for later sync');
      const saved = await saveRequestOffline(qty, reason.trim());
      if (saved) {
        Snackbar.show({
          text: 'Request saved offline. Will sync when online.',
          duration: 4000,
          backgroundColor: '#FF9800',
        });
        // Reset form
        setQuantity('');
        setReason('');
        setLoading(false);
        // Navigate back to list
        navigation.goBack();
      } else {
        Snackbar.show({
          text: 'Failed to save request offline. Please try again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        setLoading(false);
      }
      return;
    }
    // ========== END OFFLINE CHECK ==========

    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token');

      const payload = { quantity: qty, reason: reason.trim() };
      const response = await axios.post(
        `${serverUrl}/rru-inventory/replenishment/request`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );

      if (response.status === 200 || response.status === 201) {
        Snackbar.show({
          text: 'Request submitted successfully!',
          duration: 3000,
          backgroundColor: '#4CAF50',
        });
        // Navigate back to list (which will auto-refresh on focus)
        navigation.goBack();
      } else {
        throw new Error('Unexpected response status');
      }
    } catch (error) {
      console.error('Request error:', error);

      // ========== OFFLINE: Save request offline on error ==========
      if (error.response?.status === 500 || error.response?.status === 503 || error.message === 'Network Error') {
        const saved = await saveRequestOffline(qty, reason.trim());
        if (saved) {
          Snackbar.show({
            text: 'Server error. Request saved offline. Will sync when online.',
            duration: 4000,
            backgroundColor: '#FF9800',
          });
          setQuantity('');
          setReason('');
          navigation.goBack();
        } else {
          Snackbar.show({
            text: error.response?.data?.message || 'Failed to submit request. Please try again.',
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      } else {
        Snackbar.show({
          text: error.response?.data?.message || 'Failed to submit request. Please try again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      // ========== END OFFLINE SAVE ==========
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Icon name="wifi-off" size={16} color="#FFF" />
          <Text style={styles.offlineBannerText}>Offline Mode - Requests will be saved locally</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Request E-Seals</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <View style={styles.iconContainer}>
              <Icon name="inventory" size={48} color="#FFA500" />
            </View>
            <Text style={styles.subtitle}>
              Submit a replenishment request for additional eSeals.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter number of eSeals"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Reason *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Explain why you need additional eSeals"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={reason}
                onChangeText={setReason}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Request</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Icon name="info-outline" size={20} color="#FFA500" />
            <Text style={styles.infoText}>
              Your request will be reviewed by the administrator.
              You will be notified once approved or rejected.
            </Text>
          </View>

          {/* ========== OFFLINE: Sync button when online ========== */}
          {isOnline && (
            <TouchableOpacity style={styles.syncButton} onPress={manualSyncRequests}>
              <Icon name="sync" size={20} color="#FFA500" />
              <Text style={styles.syncButtonText}>Sync Pending Requests</Text>
            </TouchableOpacity>
          )}
          {/* ========== END OFFLINE SYNC BUTTON ========== */}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 30 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
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
  formCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  iconContainer: { alignItems: 'center', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
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
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  submitButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: { backgroundColor: '#CCCCCC', shadowOpacity: 0 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0A3',
    gap: 10,
  },
  infoText: { flex: 1, fontSize: 12, color: '#B76E00', lineHeight: 16 },
  // ========== OFFLINE STYLES ==========
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9E6',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFA500',
    gap: 8,
  },
  syncButtonText: {
    color: '#FFA500',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RequestEsealsForm;
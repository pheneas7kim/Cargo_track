// ConfirmReceived.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  TextInput,
  Modal
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera } from 'react-native-camera-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

// ✅ Import serverUrl from config (Points to 'https://demo2.bsl.co.ke/api/v1/')
import serverUrl from '../config';

// Helper function to get language header
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

// Helper function to make authenticated axios request with retry on 401
const authenticatedAxios = async (method, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    // ✅ Combines base url ('.../api/v1/') perfectly with endpoint ('customs/confirm-arrival-v2')
    let url = config.url;
    if (url && !url.startsWith('http')) {
      // If url starts with /, remove it to avoid double slashes
      if (url.startsWith('/')) {
        url = url.substring(1);
      }
      url = `${serverUrl}/${url}`;
    }

    const axiosInstance = axios.create();

    const response = await axiosInstance({
      method: method,
      ...config,
      url: url,
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

const ConfirmReceived = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();

  // State for tracking scanned devices
  const [devicesList, setDevicesList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Scanner states
  const [showScanner, setShowScanner] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Remarks Modal states
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [pendingSerialNumber, setPendingSerialNumber] = useState(null);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingReceives, setPendingReceives] = useState([]);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ CONSTANT: Hardcoded inspectionStatusId = 3 (Available)
  const INSPECTION_STATUS_ID = 3;

  // Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in ConfirmReceived');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Confirm Received Screen');

        NetworkMonitorService.init();
        await OfflineSyncService.startAutoSync();

        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('confirm_received.back_online', { defaultValue: 'Back online! Syncing data...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            processPendingReceives();
          } else {
            Snackbar.show({
              text: t('confirm_received.offline_mode', { defaultValue: 'Offline mode - Devices will be saved locally' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        await loadPendingReceives();
      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      OfflineSyncService.stopAutoSync();
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Save receive batch offline ==========
  const saveReceiveOffline = async (devices) => {
    try {
      const offlineReceive = {
        id: Date.now(),
        devices: devices,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'PENDING'
      };

      const existingReceives = await OfflineDatabaseService.getUserData('pending_device_receives') || [];
      existingReceives.push(offlineReceive);
      await OfflineDatabaseService.saveUserData('pending_device_receives', existingReceives);
      setPendingReceives(existingReceives);

      // Queue each device individually inside the standard database sync table
      for (const device of devices) {
        // ✅ Normalized endpoint: relies on config's /api/v1/ prefix
        await OfflineDatabaseService.addToSyncQueue('CONFIRM_ARRIVAL', 'customs/confirm-arrival-v2', {
          deviceSerialNumber: device.deviceSerialNumber,
          inspectionStatusId: INSPECTION_STATUS_ID,
          remarks: device.remarks || 'Arrival confirmed'
        });
      }

      console.log(`📦 Device confirmations saved offline (${devices.length} items)`);
      return true;
    } catch (error) {
      console.error('Error saving receive batch offline:', error);
      return false;
    }
  };

  // ========== OFFLINE: Load pending receives ==========
  const loadPendingReceives = async () => {
    try {
      const pending = await OfflineDatabaseService.getUserData('pending_device_receives');
      if (pending && pending.length > 0) {
        setPendingReceives(pending);
      }
    } catch (error) {
      console.error('Error loading pending receives:', error);
    }
  };

  // ========== OFFLINE: Process pending receives ==========
  const processPendingReceives = async () => {
    if (!isOnline) return;

    const pending = await OfflineDatabaseService.getUserData('pending_device_receives');
    if (!pending || pending.length === 0) return;

    console.log(`🔄 Processing ${pending.length} pending batches...`);
    let successCount = 0;
    let failCount = 0;

    for (const receive of pending) {
      for (const device of receive.devices) {
        try {
          // ✅ Normalized endpoint: relies on config's /api/v1/ prefix
          const response = await authenticatedAxios(
            'post',
            {
              url: 'customs/confirm-arrival-v2',
              data: {
                deviceSerialNumber: device.deviceSerialNumber,
                inspectionStatusId: INSPECTION_STATUS_ID,
                remarks: device.remarks || 'Arrival confirmed'
              },
              headers: { 'Content-Type': 'application/json' },
            },
            i18n
          );

          if (response.status === 200 || response.status === 201) {
            successCount++;
            console.log(`✅ Device ${device.deviceSerialNumber} synced successfully`);
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
          console.error(`❌ Error syncing device ${device.deviceSerialNumber}:`, error.message);
        }
      }
    }

    await OfflineDatabaseService.saveUserData('pending_device_receives', []);
    setPendingReceives([]);

    if (successCount > 0) {
      Snackbar.show({
        text: `✅ Synced ${successCount} item(s) successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        duration: 3000,
        backgroundColor: failCount > 0 ? '#FF9800' : '#4CAF50',
      });
    }
  };

  // ========== OFFLINE: Manual sync function ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('confirm_received.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await processPendingReceives();
      Snackbar.show({
        text: t('confirm_received.sync_complete', { defaultValue: 'Sync completed successfully!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const extractSerialNumber = (scannedValue) => {
    if (scannedValue && scannedValue.includes('&')) {
      const parts = scannedValue.split('&');
      return parts[parts.length - 1];
    }
    return scannedValue;
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value || isLoading) return;

    const deviceCode = value.trim();
    const serialNumber = extractSerialNumber(deviceCode);

    if (!/^\d+$/.test(serialNumber)) {
      Snackbar.show({
        text: t('confirm_received.errors.invalid_barcode', { defaultValue: 'Invalid barcode: Serial number must contain only numbers' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (devicesList.some(device => device.deviceSerialNumber === serialNumber)) {
      Snackbar.show({
        text: t('confirm_received.errors.duplicate_serial', { defaultValue: 'Serial number {{serialNumber}} is already in the list', serialNumber: serialNumber }).replace('{{serialNumber}}', serialNumber),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    // Capture serial number and trigger input remarks layout window
    setPendingSerialNumber(serialNumber);
    setRemarks('');
    setShowRemarksModal(true);
    setShowScanner(false);
  };

  const confirmAddDevice = () => {
    // ✅ Exact payload signature matching backend specs with hardcoded inspection status id
    const newDevice = {
      deviceSerialNumber: pendingSerialNumber,
      inspectionStatusId: INSPECTION_STATUS_ID,
      remarks: remarks.trim() || 'Arrival confirmed'
    };

    setDevicesList([...devicesList, newDevice]);

    Snackbar.show({
      text: `✅ Added ${pendingSerialNumber} to list`,
      duration: 2000,
      backgroundColor: '#4CAF50',
    });

    setShowRemarksModal(false);
    setPendingSerialNumber(null);
    setRemarks('');
    setShowScanner(true);
  };

  const cancelAddDevice = () => {
    setShowRemarksModal(false);
    setPendingSerialNumber(null);
    setRemarks('');
    setShowScanner(true);
  };

  const removeDevice = (index) => {
    Alert.alert(
      t('confirm_received.remove_device.title', { defaultValue: 'Remove Item' }),
      t('confirm_received.remove_device.message', { defaultValue: 'Are you sure you want to remove this item?' }),
      [
        { text: t('confirm_received.remove_device.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('confirm_received.remove_device.confirm', { defaultValue: 'Remove' }),
          style: 'destructive',
          onPress: () => {
            const newList = [...devicesList];
            newList.splice(index, 1);
            setDevicesList(newList);
          }
        }
      ]
    );
  };

  const clearAllDevices = () => {
    if (devicesList.length === 0) return;

    Alert.alert(
      t('confirm_received.clear_all.title', { defaultValue: 'Clear All' }),
      t('confirm_received.clear_all.message', { defaultValue: 'Are you sure you want to remove all items?' }),
      [
        { text: t('confirm_received.clear_all.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('confirm_received.clear_all.confirm', { defaultValue: 'Clear All' }), style: 'destructive', onPress: () => setDevicesList([]) }
      ]
    );
  };

  const submitDevices = async () => {
    if (devicesList.length === 0) {
      Snackbar.show({
        text: t('confirm_received.errors.no_devices', { defaultValue: 'Please add at least one item' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setSubmitting(true);
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      const saved = await saveReceiveOffline(devicesList);
      if (saved) {
        Snackbar.show({
          text: `✅ Saved offline. ${devicesList.length} device(s) will sync when online.`,
          duration: 4000,
          backgroundColor: '#FF9800',
        });
        setDevicesList([]);
      }
      setSubmitting(false);
      return;
    }

    // Keep an up-to-date mutable copy of current entries to handle unexpected runtime drops safely
    let currentActiveList = [...devicesList];
    let successCount = 0;
    let failCount = 0;

    try {
      for (const device of devicesList) {
        try {
          console.log('📤 Confirming device:', JSON.stringify(device, null, 2));

          // ✅ Normalized endpoint: relies on config's /api/v1/ prefix
          const response = await authenticatedAxios(
            'post',
            {
              url: 'customs/confirm-arrival-v2',
              data: device,
              headers: { 'Content-Type': 'application/json' },
            },
            i18n
          );

          if (response.status === 200 || response.status === 201) {
            successCount++;
            // Dynamically remove the item from local state list track snapshot
            currentActiveList = currentActiveList.filter(
              item => item.deviceSerialNumber !== device.deviceSerialNumber
            );
            console.log(`✅ Device ${device.deviceSerialNumber} confirmed successfully`);
          } else {
            failCount++;
            console.log(`❌ Device ${device.deviceSerialNumber} failed:`, response.data);
          }
        } catch (error) {
          failCount++;
          console.error(`❌ Error confirming device ${device.deviceSerialNumber}:`, error.response?.data || error.message);
        }
      }

      // Sync down screen items state layout to strictly show items that encountered problems
      setDevicesList(currentActiveList);

      if (successCount > 0 && failCount === 0) {
        Snackbar.show({
          text: `✅ All ${successCount} device(s) confirmed successfully!`,
          duration: 4000,
          backgroundColor: '#4CAF50',
        });
      } else if (successCount > 0 && failCount > 0) {
        Snackbar.show({
          text: `⚠️ ${successCount} confirmed, ${failCount} failed. Remainder kept in queue list.`,
          duration: 4000,
          backgroundColor: '#FF9800',
        });
      } else {
        Snackbar.show({
          text: `❌ All ${failCount} device(s) failed to confirm on server response.`,
          duration: 4000,
          backgroundColor: '#FF6B6B',
        });
      }

    } catch (error) {
      console.error('Error confirming arrival:', error);
      Snackbar.show({
        text: 'Failed to submit data. Please try again.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderDeviceItem = ({ item, index }) => (
    <Animatable.View animation="fadeInLeft" delay={index * 50} style={styles.deviceCard}>
      <View style={styles.deviceInfo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceSerial}>{item.deviceSerialNumber}</Text>
          {item.remarks ? (
            <Text style={styles.remarksText} numberOfLines={1}>
              📝 {item.remarks}
            </Text>
          ) : null}
        </View>
        <View style={styles.conditionBadge}>
          <Text style={styles.conditionText}>Available</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => removeDevice(index)} style={styles.removeButton}>
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </Animatable.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0C10" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Confirm Arrival</Text>
        </View>
        <View style={styles.headerRight}>
          {isSyncing ? (
            <ActivityIndicator size="small" color="#FFD700" style={styles.syncIndicator} />
          ) : (
            <TouchableOpacity onPress={manualSync} style={styles.syncButton}>
              <Text style={styles.syncButtonText}>↻</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Saving entries locally</Text>
        </View>
      )}

      {pendingReceives.length > 0 && isOnline && (
        <TouchableOpacity style={styles.pendingBanner} onPress={processPendingReceives}>
          <Text style={styles.pendingBannerText}>
            ⏳ {pendingReceives.length} unsynced batch(es) found. Tap to sync now.
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.scannerContainer}>
        <Text style={styles.scannerTitle}>Scan QR Code / Barcode</Text>
        <Text style={styles.scannerSubtitle}>Align code inside the frame</Text>

        <View style={styles.cameraWrapper}>
          <View style={styles.cameraFrame}>
            {showScanner && (
              <Camera
                style={styles.camera}
                scanBarcode={true}
                onReadCode={onReadCode}
                showFrame={false}
              />
            )}
            <View style={styles.scanBorder} />
          </View>
        </View>

        <Text style={styles.scannerNote}>
          Both QR codes and barcodes supported
        </Text>
      </View>

      {devicesList.length > 0 && (
        <View style={styles.devicesSection}>
          <View style={styles.devicesHeader}>
            <Text style={styles.devicesTitle}>Scanned Summary ({devicesList.length})</Text>
            <TouchableOpacity onPress={clearAllDevices} disabled={submitting}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={devicesList}
            keyExtractor={(item, index) => `${item.deviceSerialNumber}-${index}`}
            renderItem={renderDeviceItem}
            contentContainerStyle={styles.devicesList}
          />
        </View>
      )}

      {devicesList.length > 0 && (
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={submitDevices}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isOnline ? 'Confirm Arrival' : 'Save Locally (Offline)'} ({devicesList.length})
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Remarks Entry View Modal Overlay Layer */}
      <Modal
        visible={showRemarksModal}
        transparent={true}
        animationType="slide"
        onRequestClose={cancelAddDevice}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Remarks</Text>
            <Text style={styles.modalSubtitle}>Serial: {pendingSerialNumber}</Text>

            <Text style={styles.inputLabelText}>Remarks:</Text>
            <TextInput
              style={styles.remarksInput}
              placeholder="Enter remarks (optional)"
              placeholderTextColor="#777"
              multiline={true}
              numberOfLines={3}
              value={remarks}
              onChangeText={setRemarks}
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelModalButton} onPress={cancelAddDevice}>
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalButton}
                onPress={confirmAddDevice}
              >
                <Text style={styles.confirmModalButtonText}>Add Device</Text>
              </TouchableOpacity>
            </View>
          </Animatable.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C10',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    backgroundColor: '#0B0C10',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1E22',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFD700',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
    alignItems: 'center',
  },
  syncButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButtonText: {
    fontSize: 24,
    color: '#FFD700',
  },
  syncIndicator: {
    width: 40,
    height: 40,
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  pendingBanner: {
    backgroundColor: '#FFF3E0',
    padding: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  pendingBannerText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '500',
  },
  scannerContainer: {
    flex: 1,
    alignItems: 'center',
    marginTop: 20,
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  scannerSubtitle: {
    color: '#A4A6AD',
    fontSize: 14,
    marginBottom: 20,
  },
  cameraWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFrame: {
    width: SCAN_SIZE + 20,
    height: SCAN_SIZE + 20,
    borderRadius: 25,
    backgroundColor: '#1C1E22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scanBorder: {
    position: 'absolute',
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderColor: '#FFD700',
    borderWidth: 2,
    borderRadius: 20,
  },
  scannerNote: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 20,
    fontStyle: 'italic',
  },
  devicesSection: {
    backgroundColor: '#1C1E22',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    maxHeight: 250,
  },
  devicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  devicesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  clearAllText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  devicesList: {
    gap: 8,
  },
  deviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0C10',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  deviceInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceSerial: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  remarksText: {
    fontSize: 11,
    color: '#A4A6AD',
    marginTop: 2,
    fontStyle: 'italic',
  },
  conditionBadge: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  conditionText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 18,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#FFD700',
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#555',
  },
  submitButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '50%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 15,
  },
  inputLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    marginTop: 8,
    marginBottom: 6,
  },
  remarksInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    color: '#000000',
    padding: 10,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    fontSize: 14,
    height: 80,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 5,
  },
  cancelModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    alignItems: 'center',
  },
  cancelModalButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FFD700',
    alignItems: 'center',
  },
  confirmModalButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '700',
  },
});

export default ConfirmReceived;
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverURL from '../config';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

// Inspection Status Options
const INSPECTION_STATUSES = [
  { id: 1, label: '✅ Passed', color: '#4CAF50', description: 'Device in good condition' },
  { id: 2, label: '⚠️ Damaged', color: '#FF9800', description: 'Physical damage detected' },
  { id: 3, label: '🔧 Missing Parts', color: '#FF6B6B', description: 'Accessories or components missing' },
  { id: 4, label: '📦 Wrong Device', color: '#F44336', description: 'Incorrect device received' },
  { id: 5, label: '🔄 Return to Sender', color: '#9E9E9E', description: 'Reject and return' },
];

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

// ✅ Helper function to make authenticated axios request with retry on 401
const authenticatedAxios = async (method, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    const axiosInstance = axios.create();

    const response = await axiosInstance({
      method: method,
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
        'Content-Type': 'application/json',
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

// Extract serial number from various barcode formats
const extractSerialNumber = (scannedValue) => {
  if (!scannedValue) return null;

  let cleaned = scannedValue.trim();

  console.log('🔍 Extracting serial from:', cleaned.substring(0, 100));

  // Case 1: Format "DEVICE:11223344" - extract after DEVICE:
  if (cleaned.includes('DEVICE:')) {
    const match = cleaned.match(/DEVICE:(\d+)/);
    if (match && match[1]) {
      console.log('📋 Extracted from DEVICE: field:', match[1]);
      return match[1];
    }
  }

  // Case 2: Format contains '&' separator
  if (cleaned.includes('&')) {
    const parts = cleaned.split('&');
    const serial = parts[parts.length - 1];
    if (/^\d+$/.test(serial)) {
      console.log('📋 Extracted from & separator:', serial);
      return serial;
    }
  }

  // Case 3: Try to find any 8-15 digit number in the string
  const numericMatch = cleaned.match(/\b\d{8,15}\b/);
  if (numericMatch && numericMatch[0]) {
    console.log('📋 Extracted numeric pattern:', numericMatch[0]);
    return numericMatch[0];
  }

  // Case 4: If it's already a pure number
  if (/^\d+$/.test(cleaned)) {
    return cleaned;
  }

  console.log('⚠️ Could not extract serial number from:', cleaned);
  return cleaned;
};

const ScanConfirmArrival = () => {
  const { t, i18n } = useTranslation();
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [isSuccess, setIsSuccess] = useState(null);

  // Confirmation form states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in ScanConfirmArrival');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Confirm Arrival');

        NetworkMonitorService.init();

        await OfflineSyncService.startAutoSync();

        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('confirm_arrival.back_online', { defaultValue: 'Back online! Syncing pending confirmations...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            syncPendingConfirmations();
          } else {
            Snackbar.show({
              text: t('confirm_arrival.offline_mode', { defaultValue: 'Offline mode - Confirmations will be queued' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        await loadPendingConfirmations();

      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // Load pending confirmations from offline storage
  const loadPendingConfirmations = async () => {
    try {
      const pending = await OfflineDatabaseService.getUserData('pending_confirmations') || [];
      setPendingConfirmations(pending);
      console.log(`📦 Loaded ${pending.length} pending confirmations`);
    } catch (error) {
      console.error('Error loading pending confirmations:', error);
    }
  };

  // Save confirmation offline
  const saveConfirmationOffline = async (serialNumber, statusId, remarksText) => {
    try {
      const offlineConfirmation = {
        id: Date.now().toString(),
        deviceSerialNumber: serialNumber,
        inspectionStatusId: statusId,
        remarks: remarksText,
        timestamp: new Date().toISOString(),
        syncStatus: 'PENDING'
      };

      const existingConfirmations = await OfflineDatabaseService.getUserData('pending_confirmations') || [];
      existingConfirmations.push(offlineConfirmation);
      await OfflineDatabaseService.saveUserData('pending_confirmations', existingConfirmations);

      // Add to sync queue
      await OfflineDatabaseService.addToSyncQueue(
        'CONFIRM_ARRIVAL',
        '/api/v1/customs/confirm-arrival-v2',
        {
          deviceSerialNumber: serialNumber,
          inspectionStatusId: statusId,
          remarks: remarksText
        }
      );

      setPendingConfirmations(existingConfirmations);

      console.log(`📦 Confirmation for device ${serialNumber} saved offline`);
      return true;
    } catch (error) {
      console.error('Error saving confirmation offline:', error);
      return false;
    }
  };

  // Sync pending confirmations to server
  const syncPendingConfirmations = async () => {
    if (!isOnline) return;

    const pending = await OfflineDatabaseService.getUserData('pending_confirmations');
    if (!pending || pending.length === 0) return;

    console.log(`🔄 Syncing ${pending.length} pending confirmations...`);
    let successCount = 0;
    let failCount = 0;

    for (const confirmation of pending) {
      try {
        const response = await authenticatedAxios('post', {
          url: `${serverURL}/api/v1/customs/confirm-arrival-v2`,
          data: {
            inspectionStatusId: confirmation.inspectionStatusId,
            remarks: confirmation.remarks,
            deviceSerialNumber: confirmation.deviceSerialNumber,
          },
        }, i18n);

        if (response.status === 200 || response.status === 201) {
          successCount++;
          console.log(`✅ Synced confirmation for ${confirmation.deviceSerialNumber}`);
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Error syncing confirmation for ${confirmation.deviceSerialNumber}:`, error);
        failCount++;
      }
    }

    // Clear processed confirmations
    await OfflineDatabaseService.saveUserData('pending_confirmations', []);
    setPendingConfirmations([]);

    if (successCount > 0) {
      Snackbar.show({
        text: t('confirm_arrival.synced', { defaultValue: `Synced ${successCount} confirmation(s) to server` }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    }
  };

  // Submit confirmation to API
  const submitConfirmation = async (serialNumber, statusId, remarksText) => {
    try {
      // Check if online
      if (!isOnline) {
        console.log('📴 Offline - saving confirmation for later sync');
        await saveConfirmationOffline(serialNumber, statusId, remarksText);
        return {
          success: true,
          message: t('confirm_arrival.offline_queued', { defaultValue: 'Arrival confirmation queued - Will sync when online' })
        };
      }

      const url = `${serverURL}/api/v1/customs/confirm-arrival-v2`;
      const requestBody = {
        inspectionStatusId: statusId,
        remarks: remarksText || '',
        deviceSerialNumber: serialNumber,
      };

      console.log('==============================');
      console.log('🚀 CONFIRMING ARRIVAL');
      console.log('Device SN:', serialNumber);
      console.log('Status ID:', statusId);
      console.log('Remarks:', remarksText);
      console.log('URL:', url);
      console.log('Request Body:', requestBody);
      console.log('==============================');

      const response = await authenticatedAxios('post', {
        url: url,
        data: requestBody,
      }, i18n);

      console.log('📡 Response Status:', response.status);
      console.log('📦 Response Data:', response.data);
      console.log('==============================');

      if (response.status === 200 || response.status === 201) {
        return {
          success: true,
          message: response.data?.message || t('confirm_arrival.success.confirmed', { defaultValue: 'Arrival confirmed successfully' })
        };
      } else {
        return {
          success: false,
          message: response.data?.message || t('confirm_arrival.errors.confirmation_failed', { defaultValue: 'Failed to confirm arrival' })
        };
      }
    } catch (error) {
      console.log('❌ CONFIRMATION REQUEST FAILED:', error);

      // Save offline on error
      await saveConfirmationOffline(serialNumber, statusId, remarksText);

      if (error.response?.status === 401) {
        return {
          success: false,
          message: t('confirm_arrival.errors.session_expired', { defaultValue: 'Session expired. Please login again.' })
        };
      }

      return {
        success: false,
        message: error.response?.data?.message || error.message || t('confirm_arrival.errors.network_error', { defaultValue: 'Network error - Saved offline' })
      };
    }
  };

  // Handle barcode scan
  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    console.log('📷 SCANNED VALUE:', value);
    console.log('📷 LENGTH:', value?.length);

    if (!value || isLoading) return;

    const serialNumber = extractSerialNumber(value.trim());

    if (!serialNumber) {
      Snackbar.show({
        text: t('confirm_arrival.errors.invalid_barcode', { defaultValue: 'Invalid barcode. Could not extract serial number.' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setScannedData(value);
    setDeviceSerial(serialNumber);
    setSelectedStatus(null);
    setRemarks('');
    setShowConfirmModal(true);
  };

  // Handle confirmation submission
  const handleConfirm = async () => {
    if (!selectedStatus) {
      Snackbar.show({
        text: t('confirm_arrival.errors.select_status', { defaultValue: 'Please select inspection status' }),
        duration: 2000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setShowConfirmModal(false);
    setIsLoading(true);
    setResultMessage(null);
    setIsSuccess(null);

    try {
      const response = await submitConfirmation(deviceSerial, selectedStatus.id, remarks);

      if (response.success) {
        console.log('✅ CONFIRMATION SUCCESSFUL');
        setResultMessage(response.message);
        setIsSuccess(true);
        Snackbar.show({
          text: response.message,
          duration: 3000,
          backgroundColor: '#4ECDC4',
        });
      } else {
        console.log('❌ CONFIRMATION FAILED');
        setResultMessage(response.message);
        setIsSuccess(false);
        Snackbar.show({
          text: response.message,
          duration: 4000,
          backgroundColor: '#FF6B6B',
        });
      }
    } catch (error) {
      console.log('❌ PROCESSING FAILED:', error);
      setResultMessage(t('confirm_arrival.errors.processing_failed', { defaultValue: 'Failed to process confirmation' }));
      setIsSuccess(false);
      Snackbar.show({
        text: t('confirm_arrival.errors.processing_failed', { defaultValue: 'Failed to process confirmation' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset scanner and try again
  const resetScanner = () => {
    console.log('🔄 RESET SCANNER');
    setScannedData(null);
    setResultMessage(null);
    setIsLoading(false);
    setIsSuccess(null);
    setDeviceSerial('');
  };

  // Manual sync for pending confirmations
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('confirm_arrival.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);
    try {
      await syncPendingConfirmations();
      Snackbar.show({
        text: t('confirm_arrival.sync_complete', { defaultValue: 'Confirmations synchronized!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('confirm_arrival.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#0B0C10" />

      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Confirmations will be queued</Text>
        </View>
      )}

      {!scannedData ? (
        <>
          <Text style={styles.title}>{t('confirm_arrival.title', { defaultValue: 'Scan to Confirm Arrival' })}</Text>
          <Text style={styles.subtitle}>{t('confirm_arrival.subtitle', { defaultValue: 'Scan Device QR Code or Barcode' })}</Text>

          <View style={styles.cameraWrapper}>
            <View style={styles.cameraFrame}>
              <Camera
                style={styles.camera}
                scanBarcode={true}
                onReadCode={onReadCode}
                showFrame={false}
              />
              <View style={styles.scanBorder} />
            </View>
          </View>

          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionText}>
              {t('confirm_arrival.instructions.align', { defaultValue: 'Align QR code or barcode inside the frame' })}
            </Text>
            <Text style={styles.noteText}>
              {t('confirm_arrival.instructions.supported', { defaultValue: 'Both QR codes and barcodes supported' })}
            </Text>

            {/* Pending confirmations indicator */}
            {pendingConfirmations.length > 0 && (
              <TouchableOpacity
                style={[styles.syncButton, !isOnline && styles.syncButtonDisabled]}
                onPress={manualSync}
                disabled={!isOnline}
              >
                <Text style={styles.syncButtonText}>
                  📋 {pendingConfirmations.length} Pending {pendingConfirmations.length === 1 ? 'Confirmation' : 'Confirmations'}
                  {isOnline && ' - Tap to Sync'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : isLoading ? (
        <View style={styles.resultContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>
            {t('confirm_arrival.loading.confirming', { defaultValue: 'Confirming arrival...' })}
          </Text>
        </View>
      ) : (
        <View style={styles.resultContainer}>
          <Text style={isSuccess ? styles.successIcon : styles.errorIcon}>
            {isSuccess ? '✓' : '✗'}
          </Text>
          <Text style={styles.resultTitle}>
            {isSuccess
              ? t('confirm_arrival.result.success', { defaultValue: 'Arrival Confirmed!' })
              : t('confirm_arrival.result.failed', { defaultValue: 'Confirmation Failed' })}
          </Text>

          {resultMessage && (
            <Text style={isSuccess ? styles.successText : styles.errorText}>
              {resultMessage}
            </Text>
          )}

          <Text style={styles.deviceInfoText}>
            {t('confirm_arrival.result.device_id', { defaultValue: 'Device Serial' })}: {deviceSerial}
          </Text>

          <TouchableOpacity
            style={styles.rescanButton}
            onPress={resetScanner}
          >
            <Text style={styles.rescanText}>
              {t('confirm_arrival.buttons.scan_again', { defaultValue: 'Scan Another Device' })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Confirm Arrival</Text>

            <View style={styles.modalDeviceInfo}>
              <Text style={styles.modalDeviceLabel}>Device Serial Number</Text>
              <Text style={styles.modalDeviceValue}>{deviceSerial}</Text>
            </View>

            <Text style={styles.modalSectionTitle}>Inspection Status *</Text>
            <ScrollView style={styles.statusList} showsVerticalScrollIndicator={false}>
              {INSPECTION_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status.id}
                  style={[
                    styles.statusOption,
                    selectedStatus?.id === status.id && styles.statusOptionSelected,
                  ]}
                  onPress={() => setSelectedStatus(status)}
                >
                  <View style={styles.statusOptionContent}>
                    <Text style={styles.statusLabel}>{status.label}</Text>
                    <Text style={styles.statusDescription}>{status.description}</Text>
                  </View>
                  {selectedStatus?.id === status.id && (
                    <Text style={styles.statusCheckmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalSectionTitle}>Remarks (Optional)</Text>
            <TextInput
              style={styles.remarksInput}
              placeholder="Enter any additional notes..."
              placeholderTextColor="#666"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              maxLength={200}
            />
            <Text style={styles.remarksCounter}>{remarks.length}/200</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>Confirm Arrival</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C10',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#A4A6AD',
    fontSize: 14,
    marginBottom: 25,
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
  instructionsContainer: {
    marginTop: 25,
    alignItems: 'center',
  },
  instructionText: {
    color: '#C5C6CA',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 15,
  },
  noteText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  resultContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1E22',
    borderRadius: 20,
    padding: 30,
    width: '85%',
  },
  successIcon: {
    fontSize: 50,
    color: '#4ECDC4',
    marginBottom: 15,
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 50,
    color: '#FF6B6B',
    marginBottom: 15,
    fontWeight: 'bold',
  },
  resultTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 10,
  },
  successText: {
    fontSize: 14,
    color: '#4ECDC4',
    textAlign: 'center',
    marginBottom: 15,
  },
  errorText: {
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 15,
  },
  deviceInfoText: {
    fontSize: 13,
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 15,
    textAlign: 'center',
  },
  rescanButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 30,
  },
  rescanText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  syncButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginTop: 15,
  },
  syncButtonDisabled: {
    backgroundColor: '#666',
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#1C1E22',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalDeviceInfo: {
    backgroundColor: '#0B0C10',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  modalDeviceLabel: {
    color: '#A4A6AD',
    fontSize: 12,
    marginBottom: 4,
  },
  modalDeviceValue: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 10,
  },
  statusList: {
    maxHeight: 250,
    marginBottom: 15,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B0C10',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2E36',
  },
  statusOptionSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#1A2C1A',
  },
  statusOptionContent: {
    flex: 1,
  },
  statusLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusDescription: {
    color: '#A4A6AD',
    fontSize: 11,
  },
  statusCheckmark: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: 'bold',
  },
  remarksInput: {
    backgroundColor: '#0B0C10',
    borderRadius: 10,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#2C2E36',
  },
  remarksCounter: {
    color: '#A4A6AD',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2C2E36',
  },
  cancelButtonText: {
    color: '#A4A6AD',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ScanConfirmArrival;
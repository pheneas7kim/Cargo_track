import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverURL from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
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
  { id: 1, label: 'Passed', color: '#4CAF50' },
  { id: 2, label: 'Failed', color: '#FF6B6B' },
  { id: 3, label: 'Pending', color: '#FFA500' },
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

// Helper: Extract device SN from various barcode formats (same as QrPaymentScanner)
const extractDeviceSerialNumber = (scannedValue) => {
  if (!scannedValue) return null;

  let cleaned = scannedValue.trim();

  console.log('🔍 Extracting serial from:', cleaned.substring(0, 100));

  // Case 1: Format "DEVICE:11474665 IMEI-1:..." - extract after DEVICE:
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
    const deviceSN = parts[parts.length - 1];
    if (/^\d+$/.test(deviceSN)) {
      console.log('📋 Extracted from & separator:', deviceSN);
      return deviceSN;
    }
  }

  // Case 3: Try to find any 8-10 digit number in the string
  const numericMatch = cleaned.match(/\b\d{8,10}\b/);
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

const ConfirmArrivalScreen = () => {
  const { t, i18n } = useTranslation();

  // Form state
  const [deviceSerialNumber, setDeviceSerialNumber] = useState('');
  const [t1Number, setT1Number] = useState('');
  const [remarks, setRemarks] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [isCommandSuccess, setIsCommandSuccess] = useState(null);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events
  React.useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in ConfirmArrivalScreen');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  React.useEffect(() => {
    const initOfflineMode = async () => {
      try {
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Confirm Arrival Screen');

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
            processPendingConfirmations();
          } else {
            Snackbar.show({
              text: t('confirm_arrival.offline_mode', { defaultValue: 'Offline mode - Confirmations will be saved locally' }),
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

  // ========== OFFLINE: Load pending confirmations ==========
  const loadPendingConfirmations = async () => {
    try {
      const pending = await OfflineDatabaseService.getUserData('pending_arrival_confirmations');
      if (pending && pending.length > 0) {
        setPendingConfirmations(pending);
        console.log(`📦 Found ${pending.length} pending confirmations`);
      }
    } catch (error) {
      console.error('Error loading pending confirmations:', error);
    }
  };
  // ========== END OFFLINE LOAD PENDING ==========

  // ========== OFFLINE: Save confirmation offline ==========
  const saveConfirmationOffline = async (data) => {
    try {
      const offlineConfirmation = {
        id: Date.now(),
        ...data,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'PENDING'
      };

      const existing = await OfflineDatabaseService.getUserData('pending_arrival_confirmations') || [];
      existing.push(offlineConfirmation);
      await OfflineDatabaseService.saveUserData('pending_arrival_confirmations', existing);
      setPendingConfirmations(existing);

      await OfflineDatabaseService.addToSyncQueue('CONFIRM_ARRIVAL', '/customs/confirm-arrival-v2', data);

      console.log('📦 Arrival confirmation saved offline');
      return true;
    } catch (error) {
      console.error('Error saving confirmation offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE CONFIRMATION ==========

  // ========== OFFLINE: Process pending confirmations ==========
  const processPendingConfirmations = async () => {
    if (!isOnline) return;

    const pending = await OfflineDatabaseService.getUserData('pending_arrival_confirmations');
    if (!pending || pending.length === 0) return;

    console.log(`🔄 Processing ${pending.length} pending confirmations...`);
    let successCount = 0;
    let failCount = 0;

    for (const confirmation of pending) {
      try {
        const response = await authenticatedAxios(
          'post',
          {
            url: `${serverURL}customs/confirm-arrival-v2`,
            data: {
              inspectionStatusId: confirmation.inspectionStatusId,
              remarks: confirmation.remarks || '',
              deviceSerialNumber: confirmation.deviceSerialNumber,
              t1Number: confirmation.t1Number || undefined,
            },
            headers: { 'Content-Type': 'application/json' },
          },
          i18n
        );

        if (response.status === 200 || response.status === 201) {
          successCount++;
          console.log(`✅ Synced confirmation for device ${confirmation.deviceSerialNumber}`);
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Failed to sync confirmation:`, error);
        failCount++;
      }
    }

    await OfflineDatabaseService.saveUserData('pending_arrival_confirmations', []);
    setPendingConfirmations([]);

    if (successCount > 0) {
      Snackbar.show({
        text: t('confirm_arrival.synced', { defaultValue: 'Synced {{count}} confirmation(s)', count: successCount }).replace('{{count}}', successCount.toString()),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    }
  };
  // ========== END OFFLINE PROCESS PENDING ==========

  // ========== OFFLINE: Manual sync ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('confirm_arrival.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await processPendingConfirmations();
      Snackbar.show({
        text: t('confirm_arrival.sync_complete', { defaultValue: 'Sync completed!' }),
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
      setIsSubmitting(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  // Switch language
  const switchLanguage = async (lang) => {
    i18n.changeLanguage(lang);
    try {
      await AsyncStorage.setItem('userLanguage', lang);
      console.log('💾 Language changed and saved:', lang);
    } catch (error) {
      console.log('❌ Error saving language preference:', error);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!deviceSerialNumber.trim()) {
      Snackbar.show({
        text: t('confirm_arrival.errors.device_required', { defaultValue: 'Device serial number is required' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!selectedStatus) {
      Snackbar.show({
        text: t('confirm_arrival.errors.status_required', { defaultValue: 'Please select inspection status' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSubmitting(true);
    setResultMessage(null);
    setIsCommandSuccess(null);

    try {
      const payload = {
        inspectionStatusId: selectedStatus.id,
        remarks: remarks.trim() || 'Confirmed via mobile app',
        deviceSerialNumber: deviceSerialNumber.trim(),
      };

      if (t1Number.trim()) {
        payload.t1Number = t1Number.trim();
      }

      console.log('📤 Submitting arrival confirmation:', payload);

      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        const saved = await saveConfirmationOffline(payload);
        if (saved) {
          setResultMessage(t('confirm_arrival.success.saved_offline', { defaultValue: 'Confirmation saved offline. Will sync when online.' }));
          setIsCommandSuccess(true);
          resetForm();
          Snackbar.show({
            text: t('confirm_arrival.success.saved_offline', { defaultValue: 'Confirmation saved offline' }),
            duration: 3000,
            backgroundColor: '#FF9800',
          });
        } else {
          setResultMessage(t('confirm_arrival.errors.save_failed', { defaultValue: 'Failed to save confirmation offline' }));
          setIsCommandSuccess(false);
        }
        setIsSubmitting(false);
        return;
      }
      // ========== END OFFLINE CHECK ==========

      const response = await authenticatedAxios(
        'post',
        {
          url: `${serverURL}customs/confirm-arrival-v2`,
          data: payload,
          headers: { 'Content-Type': 'application/json' },
        },
        i18n
      );

      console.log('📡 Response:', response.status, response.data);

      if (response.status === 200 || response.status === 201) {
        setResultMessage(t('confirm_arrival.success.submitted', { defaultValue: 'Arrival confirmed successfully!' }));
        setIsCommandSuccess(true);
        resetForm();
        Snackbar.show({
          text: t('confirm_arrival.success.submitted', { defaultValue: 'Arrival confirmed!' }),
          duration: 3000,
          backgroundColor: '#4CAF50',
        });
      } else {
        throw new Error(response.data?.message || 'Submission failed');
      }
    } catch (error) {
      console.error('❌ Submission error:', error);

      let errorMessage = error.response?.data?.message || error.message || t('confirm_arrival.errors.submit_failed', { defaultValue: 'Failed to confirm arrival' });

      // French error message handling
      if (errorMessage.includes('Aucun T1 actif trouvé')) {
        errorMessage = t('confirm_arrival.errors.no_active_t1', { defaultValue: 'No active T1 found for this device. Please check the device or provide T1 number.' });
      }

      // ========== OFFLINE: Offer to save offline on error ==========
      const isNetworkError = error.message?.includes('network') ||
                            error.message?.includes('offline') ||
                            error.code === 'ERR_NETWORK';

      if (isNetworkError && !isOnline) {
        const saved = await saveConfirmationOffline({
          inspectionStatusId: selectedStatus.id,
          remarks: remarks.trim() || 'Confirmed via mobile app',
          deviceSerialNumber: deviceSerialNumber.trim(),
          t1Number: t1Number.trim() || undefined,
        });

        if (saved) {
          setResultMessage(t('confirm_arrival.success.saved_offline', { defaultValue: 'Confirmation saved offline. Will sync when online.' }));
          setIsCommandSuccess(true);
          resetForm();
        } else {
          setResultMessage(errorMessage);
          setIsCommandSuccess(false);
        }
      } else {
        setResultMessage(errorMessage);
        setIsCommandSuccess(false);
      }
      // ========== END OFFLINE OFFER ==========

      Snackbar.show({
        text: errorMessage,
        duration: 4000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setDeviceSerialNumber('');
    setT1Number('');
    setRemarks('');
    setSelectedStatus(null);
    setScannedData(null);
    setShowScanner(false);
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    console.log('📷 SCANNED VALUE:', value);
    console.log('📷 LENGTH:', value?.length);
    console.log('📷 TYPE:', event?.nativeEvent?.codeType || 'barcode');

    if (!value || isSubmitting) return;

    const deviceCode = value.trim();
    setScannedData(deviceCode);
    const serialNumber = extractDeviceSerialNumber(deviceCode);

    if (serialNumber && /^\d+$/.test(serialNumber)) {
      setDeviceSerialNumber(serialNumber);
      Snackbar.show({
        text: t('confirm_arrival.success.device_scanned', { defaultValue: '✓ Device scanned: {{serial}}', serial: serialNumber }).replace('{{serial}}', serialNumber),
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
    } else {
      Snackbar.show({
        text: t('confirm_arrival.errors.invalid_qr', { defaultValue: 'Invalid QR code. Could not extract device serial number.' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    }

    setShowScanner(false);
  };

  const renderStatusSelector = () => (
    <View style={styles.statusContainer}>
      <Text style={styles.inputLabel}>{t('confirm_arrival.labels.inspection_status', { defaultValue: 'Inspection Status' })} *</Text>
      <View style={styles.statusRow}>
        {INSPECTION_STATUSES.map((status) => (
          <TouchableOpacity
            key={status.id}
            style={[
              styles.statusOption,
              selectedStatus?.id === status.id && { borderColor: status.color, backgroundColor: status.color + '20' }
            ]}
            onPress={() => setSelectedStatus(status)}
          >
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusOptionText, selectedStatus?.id === status.id && { color: status.color, fontWeight: '700' }]}>
              {status.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#0B0C10" />

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Confirmations will be saved locally</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      {/* ========== OFFLINE: Pending confirmations banner ========== */}
      {pendingConfirmations.length > 0 && isOnline && (
        <TouchableOpacity style={styles.pendingBanner} onPress={processPendingConfirmations}>
          <Text style={styles.pendingBannerText}>
            ⏳ {pendingConfirmations.reduce((sum, c) => sum + 1, 0)} pending confirmation(s) to sync. Tap to sync now.
          </Text>
        </TouchableOpacity>
      )}
      {/* ========== END OFFLINE PENDING BANNER ========== */}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language Switcher - Same as QrPaymentScanner */}
        <View style={styles.langSwitcher}>
          <TouchableOpacity
            onPress={() => switchLanguage('en')}
            style={[styles.langBtn, i18n.language === 'en' && styles.langBtnActive]}
          >
            <Text style={[styles.langText, i18n.language === 'en' && styles.langTextActive]}>EN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => switchLanguage('fr')}
            style={[styles.langBtn, i18n.language === 'fr' && styles.langBtnActive]}
          >
            <Text style={[styles.langText, i18n.language === 'fr' && styles.langTextActive]}>FR</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{t('confirm_arrival.title', { defaultValue: 'Confirm Arrival' })}</Text>
        <Text style={styles.subtitle}>{t('confirm_arrival.subtitle', { defaultValue: 'Scan to confirm vehicle arrival' })}</Text>

        {/* Device Serial Number Input with Scan Button - Same as QrPaymentScanner */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('confirm_arrival.labels.device_serial', { defaultValue: 'Device Serial Number' })} *</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputWithButton]}
              placeholder={t('confirm_arrival.placeholders.device_serial', { defaultValue: 'Enter or scan device serial number' })}
              placeholderTextColor="#A4A6AD"
              value={deviceSerialNumber}
              onChangeText={setDeviceSerialNumber}
              editable={!isSubmitting}
            />
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setShowScanner(true)}
              disabled={isSubmitting}
            >
              <Text style={styles.scanButtonText}>📷 Scan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* T1 Number (Optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('confirm_arrival.labels.t1_number', { defaultValue: 'T1 Number (Optional)' })}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('confirm_arrival.placeholders.t1_number', { defaultValue: 'Enter T1 number if known' })}
            placeholderTextColor="#A4A6AD"
            value={t1Number}
            onChangeText={setT1Number}
            editable={!isSubmitting}
          />
          <Text style={styles.inputHint}>{t('confirm_arrival.hints.t1_number', { defaultValue: 'Required only if device has multiple T1 assignments' })}</Text>
        </View>

        {/* Inspection Status Selector */}
        {renderStatusSelector()}

        {/* Remarks */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('confirm_arrival.labels.remarks', { defaultValue: 'Remarks' })}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('confirm_arrival.placeholders.remarks', { defaultValue: 'Additional notes about the inspection...' })}
            placeholderTextColor="#A4A6AD"
            value={remarks}
            onChangeText={setRemarks}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isSubmitting}
          />
        </View>

        {/* ========== OFFLINE: Sync button ========== */}
        {isOnline && pendingConfirmations.length > 0 && (
          <TouchableOpacity style={styles.syncButton} onPress={manualSync}>
            <Text style={styles.syncButtonText}>🔄 Sync Pending Confirmations</Text>
          </TouchableOpacity>
        )}
        {/* ========== END OFFLINE SYNC BUTTON ========== */}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.submitButtonText}>
              {!isOnline ? t('confirm_arrival.buttons.save_offline', { defaultValue: 'Save Offline' }) : t('confirm_arrival.buttons.confirm', { defaultValue: 'Confirm Arrival' })}
            </Text>
          )}
        </TouchableOpacity>

        {/* Result Display - Same as QrPaymentScanner */}
        {resultMessage && (
          <View style={[styles.resultContainer, isCommandSuccess ? styles.successResult : styles.errorResult]}>
            <Text style={isCommandSuccess ? styles.successText : styles.errorText}>
              {isCommandSuccess ? '✓' : '✗'} {resultMessage}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Camera Modal for Scanning - Same as QrPaymentScanner */}
      {showScanner && (
        <View style={styles.cameraModal}>
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraTitle}>{t('confirm_arrival.scan_title', { defaultValue: 'Scan Device QR Code' })}</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
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
          <View style={styles.cameraInstructions}>
            <Text style={styles.instructionText}>
              {t('confirm_arrival.instructions.align', { defaultValue: 'Align QR code inside the frame' })}
            </Text>
            <View style={styles.deviceTypesContainer}>
              <View style={styles.deviceTypeBadge}>
                <Text style={styles.deviceTypeIcon}>📱</Text>
                <Text style={styles.deviceTypeText}>Telematics (8 digits)</Text>
              </View>
              <View style={styles.deviceTypeBadge}>
                <Text style={styles.deviceTypeIcon}>📊</Text>
                <Text style={styles.deviceTypeText}>Joint Tech (10 digits)</Text>
              </View>
              <View style={styles.deviceTypeBadge}>
                <Text style={styles.deviceTypeIcon}>🔲</Text>
                <Text style={styles.deviceTypeText}>QR Codes supported</Text>
              </View>
            </View>
            <Text style={styles.noteText}>
              {t('confirm_arrival.instructions.saved_locally', { defaultValue: '✓ Saved locally even if offline' })}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default ConfirmArrivalScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C10',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  // Language Switcher Styles - Same as QrPaymentScanner
  langSwitcher: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
    gap: 8,
  },
  langBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  langBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  langText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  langTextActive: {
    color: '#000',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#A4A6AD',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputHint: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    backgroundColor: '#1C1E22',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    flex: 1,
  },
  inputWithButton: {
    flex: 1,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  scanButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  statusContainer: {
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1E22',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusOptionText: {
    color: '#A4A6AD',
    fontSize: 14,
    fontWeight: '500',
  },
  syncButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#555',
  },
  submitButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  resultContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  successResult: {
    backgroundColor: '#4CAF5020',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  errorResult: {
    backgroundColor: '#FF6B6B20',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  successText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  // Camera Modal Styles - Same as QrPaymentScanner
  cameraModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B0C10',
    zIndex: 100,
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#0B0C10',
  },
  cameraTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1E22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#A4A6AD',
    fontSize: 20,
    fontWeight: '300',
  },
  cameraWrapper: {
    flex: 1,
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
  cameraInstructions: {
    padding: 30,
    alignItems: 'center',
  },
  instructionText: {
    color: '#C5C6CA',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  deviceTypesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  deviceTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1E22',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  deviceTypeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  deviceTypeText: {
    color: '#A4A6AD',
    fontSize: 12,
    fontWeight: '600',
  },
  noteText: {
    color: '#4CAF50',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  // ========== OFFLINE STYLES ==========
  offlineBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  pendingBanner: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  pendingBannerText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '500',
  },
  // ========== END OFFLINE STYLES ==========
});
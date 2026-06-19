import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Animated,
  ScrollView,
  Platform,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverURL from '../config';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.72;

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
      data: error.response?.data,
    });

    if (error.response?.status === 401 && retryCount === 0) {
      const newToken = await refreshAccessToken();
      if (newToken) {
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

  if (cleaned.includes('DEVICE:')) {
    const match = cleaned.match(/DEVICE:(\d{8})\b/);
    if (match && match[1]) return match[1];
  }

  if (cleaned.includes('&')) {
    const parts = cleaned.split('&');
    const serial = parts[parts.length - 1].trim();
    if (/^\d{8}$/.test(serial)) return serial;
  }

  const numericMatch = cleaned.match(/\b\d{8}\b/);
  if (numericMatch && numericMatch[0]) return numericMatch[0];

  if (/^\d{8}$/.test(cleaned)) return cleaned;

  return null;
};

const ScanConfirmArrival = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [isSuccess, setIsSuccess] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Form states
  const [remarks, setRemarks] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // HARDCODED STATUS 3
  const HARDCODED_INSPECTION_STATUS = 3;

  const fullEndpointURL = `${serverURL.replace(/\/$/, '')}/customs/confirm-arrival-v2`;

  useEffect(() => {
    const removeListener = addTokenRefreshListener(() => {});
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        await OfflineDatabaseService.initDatabase();
        NetworkMonitorService.init();
        await OfflineSyncService.startAutoSync();

        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('confirm_arrival.back_online', { defaultValue: 'Back online!' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
          }
        });
      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();
    return () => {
      NetworkMonitorService.cleanup();
    };
  }, []);

  // ========== OFFLINE: Manual sync function ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('confirm_arrival.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      Snackbar.show({
        text: t('confirm_arrival.sync_complete', { defaultValue: 'Sync completed successfully!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  const saveConfirmationOffline = async (serialNumber, remarksText) => {
    try {
      const offlineConfirmation = {
        id: Date.now().toString(),
        deviceSerialNumber: serialNumber,
        inspectionStatusId: HARDCODED_INSPECTION_STATUS,
        remarks: remarksText,
        timestamp: new Date().toISOString(),
        syncStatus: 'PENDING'
      };

      const existingConfirmations = await OfflineDatabaseService.getUserData('pending_confirmations') || [];
      existingConfirmations.push(offlineConfirmation);
      await OfflineDatabaseService.saveUserData('pending_confirmations', existingConfirmations);

      await OfflineDatabaseService.addToSyncQueue(
        'CONFIRM_ARRIVAL',
        fullEndpointURL,
        {
          deviceSerialNumber: serialNumber,
          inspectionStatusId: HARDCODED_INSPECTION_STATUS,
          remarks: remarksText
        }
      );

      return true;
    } catch (error) {
      return false;
    }
  };

  const submitConfirmation = async (serialNumber, remarksText) => {
    if (!isOnline) {
      await saveConfirmationOffline(serialNumber, remarksText);
      return {
        success: true,
        message: t('confirm_arrival.offline_queued', { defaultValue: 'Saved offline - Will sync when online' })
      };
    }

    const response = await authenticatedAxios('post', {
      url: fullEndpointURL,
      data: {
        inspectionStatusId: HARDCODED_INSPECTION_STATUS,
        remarks: remarksText || t('confirm_arrival.default_remarks', { defaultValue: 'Arrival confirmed' }),
        deviceSerialNumber: serialNumber,
      },
    }, i18n);

    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        message: response.data?.message || t('confirm_arrival.success.confirmed', { defaultValue: 'Arrival confirmed successfully' })
      };
    }
    return { success: false, message: t('confirm_arrival.errors.failed', { defaultValue: 'Failed to confirm arrival' }) };
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value || isLoading) return;

    const serialNumber = extractSerialNumber(value.trim());

    if (!serialNumber) {
      Snackbar.show({
        text: t('confirm_arrival.errors.invalid_barcode', { defaultValue: 'Invalid ID. Focus frame over 8-digit code.' }),
        duration: 2000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setScannedData(value);
    setDeviceSerial(serialNumber);
    setRemarks('');
  };

  const handleFinalSubmission = async () => {
    setIsLoading(true);
    setResultMessage(null);
    setIsSuccess(null);

    try {
      const response = await submitConfirmation(deviceSerial, remarks);
      setResultMessage(response.message);
      setIsSuccess(response.success);
    } catch (error) {
      console.error('📋 handleFinalSubmission Error Caught:', error);

      let serverErrorMessage = t('confirm_arrival.errors.processing', { defaultValue: 'Failed to process confirmation' });

      if (error.response) {
        serverErrorMessage = error.response.data?.message || `Server Error (${error.response.status})`;
      } else if (error.request) {
        serverErrorMessage = t('confirm_arrival.errors.no_response', { defaultValue: 'No response from Server. Check network.' });
      } else {
        serverErrorMessage = error.message;
      }

      if (!error.response) {
        await saveConfirmationOffline(deviceSerial, remarks);
        serverErrorMessage = t('confirm_arrival.errors.saved_offline', { defaultValue: 'Network issue - Saved offline' });
      }

      setResultMessage(serverErrorMessage);
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  const resetScanner = () => {
    setScannedData(null);
    setResultMessage(null);
    setIsLoading(false);
    setIsSuccess(null);
    setDeviceSerial('');
    setRemarks('');
  };

  const renderHeader = () => {
    return (
      <Animated.View style={[styles.header]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('confirm_arrival.title', { defaultValue: 'Confirm Arrival' })}</Text>
          <View style={styles.headerRight}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#FFA500" style={styles.syncIndicator} />
            ) : (
              <TouchableOpacity onPress={manualSync} style={styles.syncButton}>
                <Icon name="sync" size={20} color={isOnline ? "#4CAF50" : "#999"} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ========== OFFLINE: Network status banner ========== */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>📴 {t('confirm_arrival.offline_mode', { defaultValue: 'Offline Mode - Submissions will cache locally' })}</Text>
          </View>
        )}
        {/* ========== END OFFLINE BANNER ========== */}
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      {renderHeader()}

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Scanner Card */}
        {!scannedData && !isLoading && isSuccess === null && (
          <View style={styles.scannerCard}>
            <View style={styles.scannerHeader}>
              <Icon name="qr-code-scanner" size={28} color="#FFA500" />
              <Text style={styles.scannerTitle}>{t('confirm_arrival.scan_title', { defaultValue: 'Scan Device ID Code' })}</Text>
            </View>
            <Text style={styles.scannerSubtitle}>
              {t('confirm_arrival.scan_subtitle', { defaultValue: 'Align 8-digit identification barcode within brackets' })}
            </Text>

            <View style={styles.cameraWrapper}>
              <View style={styles.cameraFrame}>
                <Camera
                  style={StyleSheet.absoluteFillObject}
                  scanBarcode={true}
                  onReadCode={onReadCode}
                  showFrame={false}
                />
                {/* Custom Targeting Corner Vector Bracket Guides */}
                <View style={styles.overlayContainer}>
                  <View style={[styles.bracket, styles.topLeftBracket]} />
                  <View style={[styles.bracket, styles.topRightBracket]} />
                  <View style={[styles.bracket, styles.bottomLeftBracket]} />
                  <View style={[styles.bracket, styles.bottomRightBracket]} />
                </View>
              </View>
            </View>

            <Text style={styles.scannerNote}>
              {t('confirm_arrival.scan_note', { defaultValue: 'Focus on clear labels under sufficient lighting' })}
            </Text>
          </View>
        )}

        {/* Dynamic Workflow States Handler: Loading Indicator */}
        {isLoading && (
          <View style={styles.loaderFallbackLayout}>
            <ActivityIndicator size="large" color="#FFA500" />
            <Text style={styles.loadingText}>{t('confirm_arrival.loading', { defaultValue: 'Uploading tracking verification data...' })}</Text>
          </View>
        )}

        {/* Dynamic Workflow States Handler: Success/Failure Result Box */}
        {!isLoading && isSuccess !== null && (
          <View style={styles.responseContainerLayout}>
            <View style={[styles.statusIconRing, { backgroundColor: isSuccess ? '#E8F5E9' : '#FFEBEE' }]}>
              <Icon name={isSuccess ? 'check' : 'close'} size={36} color={isSuccess ? '#4CAF50' : '#FF6B6B'} />
            </View>
            <Text style={styles.resultTitle}>
              {isSuccess ? t('confirm_arrival.success.title', { defaultValue: 'Arrival Registered!' }) : t('confirm_arrival.errors.title', { defaultValue: 'Submission Failed' })}
            </Text>
            {resultMessage && (
              <Text style={isSuccess ? styles.successText : styles.errorText}>
                {resultMessage}
              </Text>
            )}

            <View style={styles.deviceMetaChip}>
              <Text style={styles.deviceInfoText}>{t('confirm_arrival.device_serial', { defaultValue: 'Device Serial' })}: {deviceSerial}</Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} style={styles.rescanButton} onPress={resetScanner}>
              <Text style={styles.rescanText}>{t('confirm_arrival.scan_next', { defaultValue: 'Scan Next Unit' })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Process Payload Interactive Input Form Card layout */}
        {scannedData && !isLoading && isSuccess === null && (
          <View style={styles.formCardLayout}>
            <View style={styles.formCardHeader}>
              <Icon name="assignment" size={22} color="#FFA500" />
              <Text style={styles.formHeading}>{t('confirm_arrival.details_title', { defaultValue: 'Confirmation Details' })}</Text>
            </View>

            <View style={styles.deviceDataBlock}>
              <Text style={styles.deviceBlockLabel}>{t('confirm_arrival.device_serial', { defaultValue: 'Device Serial No' })}</Text>
              <Text style={styles.deviceBlockValue}>{deviceSerial}</Text>
            </View>

            <Text style={styles.fieldTitle}>{t('confirm_arrival.remarks', { defaultValue: 'Remarks' })}</Text>
            <TextInput
              style={styles.formRemarksBox}
              placeholder={t('confirm_arrival.remarks_placeholder', { defaultValue: 'Enter remarks (optional)' })}
              placeholderTextColor="#A0A0A0"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              maxLength={200}
            />
            <Text style={styles.remarksCounter}>{remarks.length}/200</Text>

            <View style={styles.actionRowLayout}>
              <TouchableOpacity activeOpacity={0.7} style={styles.formCancelBtn} onPress={resetScanner}>
                <Text style={styles.cancelBtnTxt}>{t('confirm_arrival.discard', { defaultValue: 'Discard' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} style={styles.formConfirmBtn} onPress={handleFinalSubmission}>
                <Text style={styles.confirmBtnTxt}>{t('confirm_arrival.confirm', { defaultValue: 'Confirm Arrival' })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.3,
    flex: 1,
    marginLeft: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
  },
  syncIndicator: {
    width: 36,
    height: 36,
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  // Scanner Card
  scannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  scannerTitle: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
  },
  scannerSubtitle: {
    color: '#666666',
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  cameraWrapper: {
    marginVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    justifyContent: 'space-between',
  },
  bracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFA500',
  },
  topLeftBracket: {
    top: 16,
    left: 16,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderTopLeftRadius: 12,
  },
  topRightBracket: {
    top: 16,
    right: 16,
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderTopRightRadius: 12,
  },
  bottomLeftBracket: {
    bottom: 16,
    left: 16,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderBottomLeftRadius: 12,
  },
  bottomRightBracket: {
    bottom: 16,
    right: 16,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderBottomRightRadius: 12,
  },
  scannerNote: {
    color: '#888888',
    fontSize: 12,
    marginTop: 20,
    fontWeight: '500',
  },
  // Form Card
  formCardLayout: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  formCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
    paddingBottom: 12,
    width: '100%',
  },
  formHeading: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '700',
  },
  deviceDataBlock: {
    backgroundColor: '#FFF8F0',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFEAD2',
  },
  deviceBlockLabel: {
    color: '#C76A00',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  deviceBlockValue: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fieldTitle: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  formRemarksBox: {
    backgroundColor: '#F8F9FA',
    minHeight: 100,
    borderRadius: 12,
    padding: 14,
    color: '#1A1A1A',
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
  },
  remarksCounter: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 5,
  },
  actionRowLayout: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  formCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F3F5',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnTxt: {
    color: '#495057',
    fontWeight: '600',
    fontSize: 14,
  },
  formConfirmBtn: {
    flex: 1,
    backgroundColor: '#FFA500',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  confirmBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  // Loader
  loaderFallbackLayout: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  loadingText: {
    color: '#666666',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  // Response
  responseContainerLayout: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  statusIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  resultTitle: {
    fontSize: 19,
    color: '#1A1A1A',
    fontWeight: '700',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  deviceMetaChip: {
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  deviceInfoText: {
    fontSize: 13,
    color: '#495057',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  rescanButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  rescanText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ScanConfirmArrival;
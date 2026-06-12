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

// Command constants - FIXED: Removed parentheses for Joint Tech
const FIXED_COMMAND = '(P43,888888)'; // Joint Tech command
const TELEMATICS_COMMAND = '*269#8,888888'; // Telematics command

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

// Helper: Get stored authentication token (kept for backward compatibility)
const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    return token;
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

// Helper: Extract Telematics SN from various barcode formats
const extractTelematicsSN = (scannedValue) => {
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

  // Case 2: Format contains '&' separator (original logic for combined QR)
  if (cleaned.includes('&')) {
    const parts = cleaned.split('&');
    const telematicsSN = parts[parts.length - 1];
    if (/^\d+$/.test(telematicsSN)) {
      console.log('📋 Extracted from & separator:', telematicsSN);
      return telematicsSN;
    }
  }

  // Case 3: Try to find any 8-10 digit number in the string (most reliable)
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

const QrPaymentScanner = () => {
  const { t, i18n } = useTranslation();
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [deviceType, setDeviceType] = useState(null);
  const [isCommandSuccess, setIsCommandSuccess] = useState(null);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineCommandsAvailable, setOfflineCommandsAvailable] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events
  React.useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in QrPaymentScanner');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  React.useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for QR Payment Scanner');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('qr_scanner.back_online', { defaultValue: 'Back online! Syncing pending commands...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Sync pending commands when back online
            syncPendingCommands();
          } else {
            Snackbar.show({
              text: t('qr_scanner.offline_mode', { defaultValue: 'Offline mode - Commands will be queued' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load cached command history
        await loadCachedCommands();

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

  // ========== OFFLINE: Load cached commands from offline database ==========
  const loadCachedCommands = async () => {
    try {
      const cachedCommands = await OfflineDatabaseService.getUserData('cached_commands');
      if (cachedCommands && cachedCommands.commands && cachedCommands.commands.length > 0) {
        setOfflineCommandsAvailable(true);
        console.log(`📦 Loaded ${cachedCommands.commands.length} commands from offline cache`);
      }
    } catch (error) {
      console.error('Error loading cached commands:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED COMMANDS ==========

  // ========== OFFLINE: Save command to offline queue ==========
  const saveCommandOffline = async (deviceSn, deviceTypeParam, command, status, message) => {
    try {
      const offlineCommand = {
        id: Date.now().toString(),
        deviceSn: deviceSn,
        deviceType: deviceTypeParam,
        command: command,
        status: status,
        message: message,
        timestamp: new Date().toISOString(),
        syncStatus: 'PENDING'
      };

      const existingCommands = await OfflineDatabaseService.getUserData('pending_commands') || [];
      existingCommands.push(offlineCommand);
      await OfflineDatabaseService.saveUserData('pending_commands', existingCommands);

      // Also add to sync queue
      await OfflineDatabaseService.addToSyncQueue('DEVICE_COMMAND',
        deviceTypeParam === 'TELEMATICS' ? '/devices/command/set' : '/joint-tech/command',
        { deviceSn: deviceSn, command: command }
      );

      // Update command history
      const commandHistory = await OfflineDatabaseService.getUserData('command_history') || [];
      commandHistory.unshift({
        id: offlineCommand.id,
        deviceSn: deviceSn,
        deviceType: deviceTypeParam,
        timestamp: offlineCommand.timestamp,
        status: 'QUEUED'
      });
      await OfflineDatabaseService.saveUserData('command_history', commandHistory.slice(0, 100)); // Keep last 100

      console.log(`📦 Command for device ${deviceSn} saved offline for later sync`);
      return true;
    } catch (error) {
      console.error('Error saving command offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE COMMAND ==========

  // ========== OFFLINE: Sync pending commands ==========
  const syncPendingCommands = async () => {
    if (!isOnline) return;

    const pendingCommands = await OfflineDatabaseService.getUserData('pending_commands');
    if (!pendingCommands || pendingCommands.length === 0) return;

    console.log(`🔄 Processing ${pendingCommands.length} pending commands...`);
    let successCount = 0;
    let failCount = 0;

    for (const command of pendingCommands) {
      try {
        let response;
        if (command.deviceType === 'TELEMATICS') {
          const url = `${serverURL}devices/command/set`;
          const formJson = {
            deviceSn: command.deviceSn,
            command: command.command || TELEMATICS_COMMAND
          };
          response = await authenticatedAxios('post', {
            url: url,
            data: formJson,
            headers: { 'Content-Type': 'application/json' },
          }, i18n);

          if (response.status === 200 && response.data && response.data.status === 200) {
            successCount++;
            console.log(`✅ Synced Telematics command for ${command.deviceSn}`);
          } else {
            failCount++;
          }
        } else if (command.deviceType === 'JOINT_TECH') {
          const url = `${serverURL}joint-tech/command/${command.deviceSn}?command=${FIXED_COMMAND}`;
          response = await authenticatedAxios('get', { url: url }, i18n);

          if (response.status === 200) {
            successCount++;
            console.log(`✅ Synced Joint Tech command for ${command.deviceSn}`);
          } else {
            failCount++;
          }
        }
      } catch (error) {
        console.error(`Error syncing command for ${command.deviceSn}:`, error);
        failCount++;
      }
    }

    // Clear processed commands
    await OfflineDatabaseService.saveUserData('pending_commands', []);

    if (successCount > 0) {
      Snackbar.show({
        text: t('qr_scanner.synced_commands', { defaultValue: 'Synced {{count}} command(s) to server', count: successCount }).replace('{{count}}', successCount.toString()),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    }
  };
  // ========== END OFFLINE SYNC COMMANDS ==========

  // Send command to Telematics device (8 digits - POST request)
  const sendTelematicsCommand = async (deviceSn, command) => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log('📴 Offline - saving Telematics command for later sync');
        await saveCommandOffline(deviceSn, 'TELEMATICS', command || TELEMATICS_COMMAND, 'PENDING', 'Command queued for offline sync');
        return {
          success: true,
          message: t('qr_scanner.offline_queued', { defaultValue: 'Command queued - Will execute when online' })
        };
      }
      // ========== END OFFLINE CHECK ==========

      const url = `${serverURL}devices/command/set`;
      const formJson = {
        deviceSn: deviceSn,
        command: command || TELEMATICS_COMMAND
      };

      console.log('==============================');
      console.log('🚀 SENDING TELEMATICS COMMAND (8 digits)');
      console.log('Device SN:', deviceSn);
      console.log('Command:', command || TELEMATICS_COMMAND);
      console.log('URL:', url);
      console.log('Request Body:', formJson);
      console.log('==============================');

      const response = await authenticatedAxios(
        'post',
        {
          url: url,
          data: formJson,
          headers: { 'Content-Type': 'application/json' },
        },
        i18n
      );

      console.log('📡 Response Status:', response.status);
      console.log('📦 Response Data:', response.data);
      console.log('==============================');

      if (response.status === 200 && response.data && response.data.status === 200) {
        return {
          success: true,
          message: response.data.message || t('qr_scanner.success.command_sent', { defaultValue: 'Command sent successfully' })
        };
      } else {
        await saveCommandOffline(deviceSn, 'TELEMATICS', command || TELEMATICS_COMMAND, 'FAILED', response.data?.message || 'Command failed');

        return {
          success: false,
          message: response.data?.message || t('qr_scanner.errors.command_failed', { defaultValue: 'Failed to send command' })
        };
      }
    } catch (error) {
      console.log('❌ TELEMATICS REQUEST FAILED:', error);

      await saveCommandOffline(deviceSn, 'TELEMATICS', command || TELEMATICS_COMMAND, 'ERROR', error.message);

      if (error.response?.status === 401) {
        return {
          success: false,
          message: t('qr_scanner.errors.session_expired', { defaultValue: 'Session expired. Please login again.' })
        };
      }

      return {
        success: false,
        message: error.response?.data?.message || error.message || t('qr_scanner.errors.network_error', { defaultValue: 'Network error' })
      };
    }
  };

  // Send command to Joint Tech device (10 digits - GET request)
  const sendJointTechCommand = async (deviceSn) => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log('📴 Offline - saving Joint Tech command for later sync');
        await saveCommandOffline(deviceSn, 'JOINT_TECH', FIXED_COMMAND, 'PENDING', 'Command queued for offline sync');
        return {
          success: true,
          message: t('qr_scanner.offline_queued', { defaultValue: 'Command queued - Will execute when online' })
        };
      }
      // ========== END OFFLINE CHECK ==========

      const url = `${serverURL}joint-tech/command/${deviceSn}?command=${FIXED_COMMAND}`;

      console.log('==============================');
      console.log('🚀 SENDING JOINT TECH COMMAND (10 digits)');
      console.log('Device SN:', deviceSn);
      console.log('Command:', FIXED_COMMAND);
      console.log('URL:', url);
      console.log('==============================');

      const response = await authenticatedAxios(
        'get',
        {
          url: url,
        },
        i18n
      );

      console.log('📡 Response Status:', response.status);
      console.log('📦 Response Data:', response.data);
      console.log('==============================');

      if (response.status === 200 && response.data && (response.data.status === 200 || response.data.message)) {
        return {
          success: true,
          message: response.data.message || t('qr_scanner.success.command_sent', { defaultValue: 'Command sent successfully' })
        };
      } else {
        await saveCommandOffline(deviceSn, 'JOINT_TECH', FIXED_COMMAND, 'FAILED', response.data?.message || 'Command failed');

        return {
          success: false,
          message: response.data?.message || t('qr_scanner.errors.command_failed_status', { defaultValue: 'Failed to send command' }) + ` (Status: ${response.status})`
        };
      }
    } catch (error) {
      console.log('❌ JOINT TECH REQUEST FAILED:', error);

      await saveCommandOffline(deviceSn, 'JOINT_TECH', FIXED_COMMAND, 'ERROR', error.message);

      if (error.response?.status === 401) {
        return {
          success: false,
          message: t('qr_scanner.errors.session_expired', { defaultValue: 'Session expired. Please login again.' })
        };
      }

      return {
        success: false,
        message: error.response?.data?.message || error.message || t('qr_scanner.errors.network_error', { defaultValue: 'Network error' })
      };
    }
  };

  // ========== OFFLINE: Manual sync for pending commands ==========
  const manualSyncCommands = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('qr_scanner.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);
    try {
      await syncPendingCommands();
      Snackbar.show({
        text: t('qr_scanner.sync_complete', { defaultValue: 'Commands synchronized!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('qr_scanner.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  // Process device based on barcode length
  const processDevice = async (rawDeviceSn) => {
    setIsLoading(true);
    setResultMessage(null);
    setIsCommandSuccess(null);

    try {
      const deviceSn = extractTelematicsSN(rawDeviceSn);

      console.log('🔍 Extracted Device SN:', deviceSn);
      console.log('📏 Length:', deviceSn?.length);

      // Validate we got a proper serial number
      if (!deviceSn || !/^\d+$/.test(deviceSn)) {
        console.log('❌ Invalid: Extracted SN contains non-numeric characters');
        const errorMsg = t('qr_scanner.errors.invalid_format', {
          defaultValue: 'Invalid barcode format. Could not extract device serial number.'
        });
        Snackbar.show({
          text: errorMsg,
          duration: 4000,
          backgroundColor: '#FF6B6B',
        });
        setResultMessage(errorMsg);
        setIsCommandSuccess(false);
        setIsLoading(false);
        return;
      }

      // Telematics check - 8 digits
      if (deviceSn.length === 8) {
        setDeviceType('TELEMATICS');
        console.log('✅ Detected Telematics device (8 digits)');
        const response = await sendTelematicsCommand(deviceSn, TELEMATICS_COMMAND);

        if (response.success) {
          console.log('✅ COMMAND SUCCESSFUL');
          setResultMessage(response.message);
          setIsCommandSuccess(true);
          Snackbar.show({
            text: response.message,
            duration: 3000,
            backgroundColor: '#4ECDC4',
          });
        } else {
          console.log('❌ COMMAND FAILED');
          setResultMessage(response.message);
          setIsCommandSuccess(false);
          Snackbar.show({
            text: response.message,
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      }
      // Joint Tech check - 10 digits
      else if (deviceSn.length === 10) {
        setDeviceType('JOINT_TECH');
        console.log('✅ Detected Joint Tech device (10 digits)');
        const response = await sendJointTechCommand(deviceSn);

        if (response.success) {
          console.log('✅ COMMAND SUCCESSFUL');
          setResultMessage(response.message);
          setIsCommandSuccess(true);
          Snackbar.show({
            text: response.message,
            duration: 3000,
            backgroundColor: '#4ECDC4',
          });
        } else {
          console.log('❌ COMMAND FAILED');
          setResultMessage(response.message);
          setIsCommandSuccess(false);
          Snackbar.show({
            text: response.message,
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      }
      else {
        const errorMsg = t('qr_scanner.errors.invalid_barcode', {
          defaultValue: 'Invalid barcode: Got {{digits}} digits. (Expected 8 for Telematics or 10 for Joint Tech)',
          digits: deviceSn.length
        }).replace('{{digits}}', deviceSn.length.toString());

        console.log('❌ Invalid length:', deviceSn.length);
        Snackbar.show({
          text: errorMsg,
          duration: 4000,
          backgroundColor: '#FF6B6B',
        });
        setResultMessage(errorMsg);
        setIsCommandSuccess(false);
      }
    } catch (error) {
      console.log('❌ PROCESSING FAILED:', error);
      setResultMessage(t('qr_scanner.errors.command_execution_failed', { defaultValue: 'Failed to send command' }));
      setIsCommandSuccess(false);
      Snackbar.show({
        text: t('qr_scanner.errors.command_execution_failed', { defaultValue: 'Failed to execute command' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    console.log('📷 SCANNED VALUE:', value);
    console.log('📷 LENGTH:', value?.length);
    console.log('📷 TYPE:', event?.nativeEvent?.codeType || 'barcode');

    if (!value || isLoading) return;

    const deviceCode = value.trim();
    setScannedData(deviceCode);

    await processDevice(deviceCode);
  };

  const resetScanner = () => {
    console.log('🔄 RESET SCANNER');
    setScannedData(null);
    setResultMessage(null);
    setIsLoading(false);
    setDeviceType(null);
    setIsCommandSuccess(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#0B0C10" />

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Commands will be queued</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      {!scannedData ? (
        <>
          <Text style={styles.title}>{t('qr_scanner.title', { defaultValue: 'Scan To Unlock' })}</Text>
          <Text style={styles.subtitle}>{t('qr_scanner.subtitle', { defaultValue: 'Scan Device QR Code or Barcode' })}</Text>

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
              {t('qr_scanner.instructions.align', { defaultValue: 'Align QR code or barcode inside the frame' })}
            </Text>
            <View style={styles.deviceTypesContainer}>
              {/* Device type badges can be added here */}
            </View>
            <Text style={styles.noteText}>
              {t('qr_scanner.instructions.supported', { defaultValue: 'Both QR codes and barcodes supported' })}
            </Text>

            {/* ========== OFFLINE: Sync button when online ========== */}
            {isOnline && offlineCommandsAvailable && (
              <TouchableOpacity style={styles.syncButton} onPress={manualSyncCommands}>
                <Text style={styles.syncButtonText}>🔄 Sync Pending Commands</Text>
              </TouchableOpacity>
            )}
            {/* ========== END OFFLINE SYNC BUTTON ========== */}
          </View>
        </>
      ) : (
        <View style={styles.resultContainer}>
          {isLoading ? (
            <>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.loadingText}>
                {t('qr_scanner.loading.sending', { defaultValue: 'Sending command to device...' })}
              </Text>
            </>
          ) : (
            <>
              <Text style={isCommandSuccess ? styles.successIcon : styles.errorIcon}>
                {isCommandSuccess ? '✓' : '✗'}
              </Text>
              <Text style={styles.resultTitle}>
                {isCommandSuccess ? t('qr_scanner.result.success', { defaultValue: 'Success!' }) : t('qr_scanner.result.failed', { defaultValue: 'Failed!' })}
              </Text>

              {resultMessage && (
                <Text style={isCommandSuccess ? styles.successText : styles.errorText}>
                  {resultMessage}
                </Text>
              )}

              <Text style={styles.deviceInfoText}>
                {t('qr_scanner.result.device_type', { defaultValue: 'Device Type' })}: {deviceType === 'TELEMATICS' ? t('qr_scanner.device_types.telematics', { defaultValue: 'Telematics' }) : t('qr_scanner.device_types.joint_tech', { defaultValue: 'Joint Tech' })}
              </Text>
              <Text style={styles.deviceIdText}>
                {t('qr_scanner.result.device_id', { defaultValue: 'Device ID' })}: {extractTelematicsSN(scannedData)} ({extractTelematicsSN(scannedData).length} {t('qr_scanner.result.digits', { defaultValue: 'digits' })})
              </Text>

              <TouchableOpacity
                style={styles.rescanButton}
                onPress={resetScanner}
              >
                <Text style={styles.rescanText}>{t('qr_scanner.buttons.scan_again', { defaultValue: 'Scan Again' })}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

export default QrPaymentScanner;

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
  deviceTypesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    marginTop: 10,
    marginBottom: 10,
  },
  deviceTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1E22',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  deviceTypeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  deviceTypeText: {
    color: '#A4A6AD',
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 5,
    fontWeight: '600',
  },
  deviceIdText: {
    fontSize: 12,
    color: '#A4A6AD',
    textAlign: 'center',
    marginBottom: 20,
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
  // ========== OFFLINE STYLES ==========
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
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // ========== END OFFLINE STYLES ==========
});
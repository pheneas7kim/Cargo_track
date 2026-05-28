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
import serverURL from '../config';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

// Command constants - FIXED: Removed parentheses for Joint Tech
const FIXED_COMMAND = '(P43,888888)'; // Joint Tech command (NO parentheses - matches Postman)
const TELEMATICS_COMMAND = '*269#8,888888'; // Telematics command

// Helper: Get stored authentication token
const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    return token;
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

// Helper: Extract Telematics SN from combined QR code format (e.g., "021929980001&8052558332")
const extractTelematicsSN = (scannedValue) => {
  // Check if the value contains '&' separator
  if (scannedValue && scannedValue.includes('&')) {
    const parts = scannedValue.split('&');
    // Return the last part after & (should be the 10-digit Telematics SN)
    const telematicsSN = parts[parts.length - 1];
    console.log('📋 Extracted Telematics SN:', telematicsSN);
    return telematicsSN;
  }
  // If no separator, return the original value
  return scannedValue;
};

const QrPaymentScanner = () => {
  const { t } = useTranslation();
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [deviceType, setDeviceType] = useState(null);
  const [isCommandSuccess, setIsCommandSuccess] = useState(null);

  // Send command to Telematics device (10 digits - POST request)
  const sendTelematicsCommand = async (deviceSn, command) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { success: false, message: t('qr_scanner.errors.auth_required', { defaultValue: 'Authentication required. Please login again.' }) };
      }

      const url = `${serverURL}devices/command/set`;
      const formJson = {
        deviceSn: deviceSn,
        command: command || TELEMATICS_COMMAND
      };

      console.log('==============================');
      console.log('🚀 SENDING TELEMATICS COMMAND (10 digits)');
      console.log('Device SN:', deviceSn);
      console.log('Command:', command || TELEMATICS_COMMAND);
      console.log('URL:', url);
      console.log('Request Body:', formJson);
      console.log('==============================');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formJson),
      });

      console.log('📡 Response Status:', response.status);

      const data = await response.json();

      console.log('📦 Response Data:', data);
      console.log('==============================');

      if (response.status === 200 && data && data.status === 200) {
        return { success: true, message: data.message || t('qr_scanner.success.command_sent', { defaultValue: 'Command sent successfully' }) };
      } else if (response.status === 401) {
        return { success: false, message: t('qr_scanner.errors.session_expired', { defaultValue: 'Session expired. Please login again.' }) };
      } else {
        return { success: false, message: data?.message || t('qr_scanner.errors.command_failed', { defaultValue: 'Failed to send command' }) };
      }
    } catch (error) {
      console.log('❌ TELEMATICS REQUEST FAILED:', error);
      return { success: false, message: error.message || t('qr_scanner.errors.network_error', { defaultValue: 'Network error' }) };
    }
  };

  // Send command to Joint Tech device (10 digits - GET request)
  // FIXED: No encodeURIComponent needed for this format
  const sendJointTechCommand = async (deviceSn) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { success: false, message: t('qr_scanner.errors.auth_required', { defaultValue: 'Authentication required. Please login again.' }) };
      }

      // FIXED: Don't encode the command - send as plain text
      const url = `${serverURL}joint-tech/command/${deviceSn}?command=${FIXED_COMMAND}`;
      console.log('==============================');
      console.log('🚀 SENDING JOINT TECH COMMAND (10 digits)');
      console.log('Device SN:', deviceSn);
      console.log('Command:', FIXED_COMMAND);
      console.log('URL:', url);
      console.log('==============================');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('📡 Response Status:', response.status);

      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
        console.log('📦 Response JSON:', data);
      } else {
        const text = await response.text();
        console.log('📦 Response Text:', text);
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { message: text };
        }
      }

      console.log('==============================');

      if (response.status === 401) {
        return {
          success: false,
          message: t('qr_scanner.errors.session_expired', { defaultValue: 'Session expired. Please login again.' })
        };
      }

      if (response.status === 200 && data && (data.status === 200 || data.message)) {
        return {
          success: true,
          message: data.message || t('qr_scanner.success.command_sent', { defaultValue: 'Command sent successfully' })
        };
      } else {
        return {
          success: false,
          message: data?.message || t('qr_scanner.errors.command_failed_status', { defaultValue: 'Failed to send command' }) + ` (Status: ${response.status})`
        };
      }
    } catch (error) {
      console.log('❌ JOINT TECH REQUEST FAILED:', error);
      return { success: false, message: error.message || t('qr_scanner.errors.network_error', { defaultValue: 'Network error' }) };
    }
  };

  // Process device based on barcode length
  const processDevice = async (rawDeviceSn) => {
      setIsLoading(true);
      setResultMessage(null);
      setIsCommandSuccess(null);

      try {
        const deviceSn = extractTelematicsSN(rawDeviceSn);
        let response;

        // 1. Change Telematics check to 8 digits
        if (deviceSn.length === 8) {
          setDeviceType('TELEMATICS');
          console.log('✅ Detected Telematics device (8 digits)');
          response = await sendTelematicsCommand(deviceSn, TELEMATICS_COMMAND);
        }
        // 2. Change Joint Tech check to 10 digits
        else if (deviceSn.length === 10) {
          setDeviceType('JOINT_TECH');
          console.log('✅ Detected Joint Tech device (10 digits)');
          response = await sendJointTechCommand(deviceSn);
        }
        else {
          // Updated error message to reflect new requirements
          const errorMsg = t('qr_scanner.errors.invalid_barcode', { defaultValue: 'Invalid barcode: Got {{digits}} digits. (Expected 8 for Telematics or 10 for Joint Tech)', digits: deviceSn.length }).replace('{{digits}}', deviceSn.length.toString());
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

    // Extract the Telematics SN for validation
    const extractedSN = extractTelematicsSN(deviceCode);

    // Validate extracted SN is numeric (allow the combined format to pass through)
    if (!/^\d+$/.test(extractedSN)) {
      console.log('❌ Invalid: Extracted SN contains non-numeric characters');
      Snackbar.show({
        text: t('qr_scanner.errors.non_numeric', { defaultValue: 'Invalid barcode: Device SN must contain only numbers' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      setScannedData(null);
      return;
    }

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

            </View>
            <Text style={styles.noteText}>
              {t('qr_scanner.instructions.supported', { defaultValue: 'Both QR codes and barcodes supported' })}
            </Text>
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
});
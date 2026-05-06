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
import serverURL from '../config';

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

// Command constants
const FIXED_COMMAND = '(P43,888888)'; // Joint Tech command
const TELEMATICS_COMMAND = '*269#8,888888'; // Telematics default command

const QrPaymentScanner = () => {
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [deviceType, setDeviceType] = useState(null); // 'TELEMATICS' or 'JOINT_TECH'

  // Send command to Telematics device (8 digits - POST request)
  const sendTelematicsCommand = async (deviceSn, command) => {
    try {
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

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formJson),
      });

      console.log('📡 Response Status:', response.status);

      const data = await response.json();

      console.log('📦 Response Data:', data);
      console.log('==============================');

      if (response.status === 200 && data && data.status === 200) {
        return { success: true, message: data.message || 'Command sent successfully' };
      } else {
        return { success: false, message: data?.message || 'Failed to send command' };
      }
    } catch (error) {
      // console.log('❌ TELEMATICS REQUEST FAILED:', error);
      return { success: false, message: error.message || 'Network error' };
    }
  };

  // Send command to Joint Tech device (10 digits - GET request with fixed command)
  const sendJointTechCommand = async (deviceSn) => {
    try {
      const url = `${serverURL}joint-tech/command/${deviceSn}?command=${encodeURIComponent(
        FIXED_COMMAND
      )}`;

      console.log('==============================');
      console.log('🚀 SENDING JOINT TECH COMMAND (10 digits)');
      console.log('Device SN:', deviceSn);
      console.log('Command:', FIXED_COMMAND);
      console.log('URL:', url);
      console.log('==============================');

      const response = await fetch(url, {
        method: 'GET',
      });

      console.log('📡 Response Status:', response.status);

      const data = await response.text();

      console.log('📦 Raw Response Body:', data);
      console.log('==============================');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { success: true, message: `Command sent: ${FIXED_COMMAND}` };
    } catch (error) {
      // console.log('❌ JOINT TECH REQUEST FAILED:', error);
      return { success: false, message: error.message || 'Failed to send command' };
    }
  };

  // Process device based on barcode length
  const processDevice = async (deviceSn) => {
    setIsLoading(true);
    setResultMessage(null);

    try {
      let response;
      let detectedType = '';
      
      // Check barcode length to determine device type
      if (deviceSn.length === 8) {
        detectedType = 'TELEMATICS';
        setDeviceType('TELEMATICS');
        console.log('✅ Detected Telematics device (8 digits)');
        response = await sendTelematicsCommand(deviceSn, TELEMATICS_COMMAND);
      } 
      else if (deviceSn.length === 10) {
        detectedType = 'JOINT_TECH';
        setDeviceType('JOINT_TECH');
        console.log('✅ Detected Joint Tech device (10 digits)');
        response = await sendJointTechCommand(deviceSn);
      } 
      else {
        console.log('❌ Invalid barcode length:', deviceSn.length);
        Snackbar.show({
          text: `Invalid barcode length: ${deviceSn.length} digits. Expected 8 or 10 digits.`,
          duration: 4000,
          backgroundColor: '#FF6B6B',
        });
        setResultMessage(`Invalid barcode: ${deviceSn.length} digits (expected 8 or 10)`);
        setIsLoading(false);
        return;
      }

      if (response.success) {
        console.log('✅ COMMAND SUCCESSFUL');
        setResultMessage(response.message);
        
        Snackbar.show({
          text: response.message,
          duration: 3000,
          backgroundColor: '#4ECDC4',
        });
      } else {
        console.log('❌ COMMAND FAILED');
        setResultMessage(response.message);
        
        Snackbar.show({
          text: response.message,
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
    } catch (error) {
      // console.log('❌ PROCESSING FAILED:', error);
      // setResultMessage('Failed to send command');
      
      // Snackbar.show({
      //   text: 'Failed to execute command',
      //   duration: 3000,
      //   backgroundColor: '#FF6B6B',
      // });
    } finally {
      setIsLoading(false);
    }
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    console.log('📷 SCANNED BARCODE VALUE:', value);
    console.log('📷 BARCODE LENGTH:', value?.length);
    console.log('📷 SCAN TYPE:', event?.nativeEvent?.codeType || 'barcode');

    if (!value || isLoading) return;

    const deviceCode = value.trim();
    setScannedData(deviceCode);
    
    // Validate if it's numeric
    if (!/^\d+$/.test(deviceCode)) {
      console.log('❌ Invalid: Barcode contains non-numeric characters');
      Snackbar.show({
        text: 'Invalid barcode: Must contain only numbers',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      setScannedData(null);
      return;
    }
    
    // Process based on length
    await processDevice(deviceCode);
  };

  const resetScanner = () => {
    console.log('🔄 RESET SCANNER');
    setScannedData(null);
    setResultMessage(null);
    setIsLoading(false);
    setDeviceType(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0C10" />

      {!scannedData ? (
        <>
          <Text style={styles.title}>Device Scanner</Text>
          <Text style={styles.subtitle}>Scan Device Barcode</Text>

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
              Align barcode inside the frame
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
            </View>
            <Text style={styles.noteText}>
              Device will be automatically detected based on barcode length
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.resultContainer}>
          {isLoading ? (
            <>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.loadingText}>
                Sending command to {deviceType === 'TELEMATICS' ? 'Telematics' : 'Joint Tech'} device...
              </Text>
            </>
          ) : (
            <>
              <Text style={resultMessage?.toLowerCase().includes('success') ? styles.successIcon : styles.errorIcon}>
                {resultMessage?.toLowerCase().includes('success') ? '✓' : '✗'}
              </Text>
              <Text style={styles.resultTitle}>
                {resultMessage?.toLowerCase().includes('success') ? 'Success!' : 'Failed!'}
              </Text>

              {resultMessage && (
                <Text style={resultMessage?.toLowerCase().includes('success') ? styles.successText : styles.errorText}>
                  {resultMessage}
                </Text>
              )}

              <Text style={styles.deviceInfoText}>
                Device Type: {deviceType === 'TELEMATICS' ? 'Telematics' : 'Joint Tech'}
              </Text>
              <Text style={styles.deviceIdText}>
                Device ID: {scannedData} ({scannedData.length} digits)
              </Text>

              <TouchableOpacity
                style={styles.rescanButton}
                onPress={resetScanner}
              >
                <Text style={styles.rescanText}>Scan Again</Text>
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
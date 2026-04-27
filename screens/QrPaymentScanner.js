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

const QrPaymentScanner = () => {
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);

  const FIXED_COMMAND = '(P43,888888)';

  const sendCommand = async (deviceSn) => {
    try {
      const url = `${serverURL}joint-tech/command/${deviceSn}?command=${encodeURIComponent(
        FIXED_COMMAND
      )}`;

      console.log('==============================');
      console.log('🚀 SENDING COMMAND REQUEST');
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

      return data;
    } catch (error) {
      console.log('❌ REQUEST FAILED:', error);
      throw error;
    }
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    console.log('📷 SCANNED RAW VALUE:', value);

    if (!value || isLoading) return;

    const deviceSn = value.trim();

    console.log('🔎 PARSED DEVICE SN:', deviceSn);

    if (!/^\d+$/.test(deviceSn)) {
      console.log('⚠️ INVALID BARCODE');
      Snackbar.show({
        text: 'Invalid barcode detected',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setScannedData(deviceSn);
    setIsLoading(true);
    setResultMessage(null);

    try {
      await sendCommand(deviceSn);

      console.log('✅ COMMAND SUCCESSFUL');

      setResultMessage(`Command sent: ${FIXED_COMMAND}`);

      Snackbar.show({
        text: 'Command executed successfully',
        duration: 3000,
        backgroundColor: '#4ECDC4',
      });
    } catch (error) {
      console.log('❌ COMMAND FAILED');

      setResultMessage('Failed to send command');

      Snackbar.show({
        text: 'Failed to execute command',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetScanner = () => {
    console.log('🔄 RESET SCANNER');
    setScannedData(null);
    setResultMessage(null);
    setIsLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0C10" />

      {!scannedData ? (
        <>
          <Text style={styles.title}>Device Scanner</Text>
          <Text style={styles.subtitle}>Scan barcode to send command</Text>

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

          <Text style={styles.instructionText}>
            Align barcode inside the frame
          </Text>
        </>
      ) : (
        <View style={styles.resultContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#FFD700" />
          ) : (
            <>
              <Text style={styles.successIcon}>OK</Text>
              <Text style={styles.resultTitle}>Scan Complete</Text>

              {resultMessage && (
                <Text style={styles.resultText}>{resultMessage}</Text>
              )}

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

  instructionText: {
    color: '#C5C6CA',
    fontSize: 15,
    marginTop: 25,
    textAlign: 'center',
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
    fontSize: 40,
    color: '#4ECDC4',
    marginBottom: 15,
  },

  resultTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 10,
  },

  resultText: {
    fontSize: 14,
    color: '#A4FBA6',
    textAlign: 'center',
    marginBottom: 20,
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
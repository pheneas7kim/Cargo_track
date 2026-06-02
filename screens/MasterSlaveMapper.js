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
  FlatList,
  Platform,
  Alert,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Snackbar from 'react-native-snackbar';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import serverURL from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const { width, height } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

// Command constants
const JOINT_TECH_FIXED_COMMAND = '(P43,888888)';
const TELEMATICS_COMMAND = '*269#8,888888';

// Helper: Get stored authentication token
const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    console.log('🔑 Auth token retrieved:', token ? 'Yes (length: ' + token.length + ')' : 'No');
    return token;
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

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

// ✅ Helper function to make authenticated fetch with retry on 401
const authenticatedFetch = async (url, options, i18n, retryCount = 0) => {
  try {
    let token = await getAuthToken();
    const language = await getLanguageHeader(i18n);

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    if (response.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedFetch(url, options, i18n, 1);
      }
    }

    return response;
  } catch (error) {
    console.error('❌ Authenticated fetch error:', error);
    throw error;
  }
};

const MasterSlaveMapper = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  // Current session state
  const [master, setMaster] = useState(null);
  const [masterType, setMasterType] = useState(null); // 'JOINT_TECH' or 'TELEMATICS'
  const [masterRaw, setMasterRaw] = useState(null);
  const [slaves, setSlaves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Persistence state for multiple trucks
  const [allMappings, setAllMappings] = useState([]);

  // Navigation state
  const [viewMode, setViewMode] = useState('DASHBOARD'); // DASHBOARD, SCANNER, SUMMARY
  const [scanType, setScanType] = useState(null);

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in MasterSlaveMapper');
    });
    return () => removeListener();
  }, []);

  console.log('--- COMPONENT RENDERED ---');

  // Extract device ID from scanned text - PRESERVES alphanumeric characters for slaves
  const extractDeviceId = (scannedText, preserveAlphanumeric = false) => {
    if (!scannedText) return null;

    console.log('Extracting ID from:', scannedText);

    // Pattern 1: Look for "ID:xxxxx" or "ID: xxxxx" format
    const idPattern1 = /ID:\s*([A-Za-z0-9]+)/i;
    const match1 = scannedText.match(idPattern1);
    if (match1) {
      console.log('Found ID via ID: pattern:', match1[1]);
      return match1[1];
    }

    // Pattern 2: Look for alphanumeric pattern (for slaves with letters)
    if (preserveAlphanumeric) {
      const alphaNumPattern = /\b([A-Za-z0-9]{5,15})\b/;
      const matchAlpha = scannedText.match(alphaNumPattern);
      if (matchAlpha) {
        console.log('Found alphanumeric ID:', matchAlpha[1]);
        return matchAlpha[1];
      }
    }

    // Pattern 3: Look for standalone number (8 or 10 digits for master)
    const numberPattern = /\b(\d{8,10})\b/;
    const match2 = scannedText.match(numberPattern);
    if (match2) {
      console.log('Found device ID via number pattern:', match2[1]);
      return match2[1];
    }

    // Pattern 4: Look for "ID" followed by alphanumeric without colon
    const idPattern3 = /ID\s*([A-Za-z0-9]+)/i;
    const match3 = scannedText.match(idPattern3);
    if (match3) {
      console.log('Found ID via ID pattern:', match3[1]);
      return match3[1];
    }

    console.log('No device ID found in scanned text');
    return null;
  };

  // Parse multi-line barcode/QR content
  const parseScannedContent = (scannedText, preserveAlphanumeric = false) => {
    // If it contains multiple lines or multiple codes in one string
    const lines = scannedText.split(/\r?\n/);

    for (const line of lines) {
      const deviceId = extractDeviceId(line, preserveAlphanumeric);
      if (deviceId) {
        return { deviceId, raw: scannedText };
      }
    }

    // If no line-by-line match, try the whole text
    const deviceId = extractDeviceId(scannedText, preserveAlphanumeric);
    if (deviceId) {
      return { deviceId, raw: scannedText };
    }

    return null;
  };

  // Detect device type based on ID length (only for master devices)
  const detectDeviceType = (deviceId) => {
    if (deviceId.length === 8) {
      return 'TELEMATICS';
    } else if (deviceId.length === 10 && /^\d+$/.test(deviceId)) {
      return 'JOINT_TECH';
    }
    return null;
  };

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
      console.log('==============================');

      const response = await authenticatedFetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formJson),
        },
        i18n
      );

      const data = await response.json();

      console.log('📦 Response Data:', data);

      if (response.status === 200 && data && data.status === 200) {
        return { success: true, message: data.message || t('master_slave.success.command_sent', { defaultValue: 'Command sent successfully' }) };
      } else if (response.status === 401) {
        return { success: false, message: t('master_slave.errors.session_expired', { defaultValue: 'Session expired. Please login again.' }) };
      } else {
        return { success: false, message: data?.message || t('master_slave.errors.command_failed', { defaultValue: 'Failed to send command' }) };
      }
    } catch (error) {
      console.error('❌ TELEMATICS REQUEST FAILED:', error);
      return { success: false, message: error.message || t('master_slave.errors.network_error', { defaultValue: 'Network error' }) };
    }
  };

  // Send command to Joint Tech device (10 digits - GET request with fixed command)
  const sendJointTechCommand = async (deviceSn) => {
    try {
      const url = `${serverURL}joint-tech/command/${deviceSn}?command=${encodeURIComponent(
        JOINT_TECH_FIXED_COMMAND
      )}`;

      console.log('==============================');
      console.log('🚀 SENDING JOINT TECH COMMAND (10 digits)');
      console.log('Device SN:', deviceSn);
      console.log('Command:', JOINT_TECH_FIXED_COMMAND);
      console.log('URL:', url);
      console.log('==============================');

      const response = await authenticatedFetch(
        url,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        },
        i18n
      );

      const data = await response.text();

      console.log('📦 Raw Response Body:', data);

      if (response.status === 401) {
        return { success: false, message: t('master_slave.errors.session_expired', { defaultValue: 'Session expired. Please login again.' }) };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { success: true, message: t('master_slave.success.command_sent_format', { defaultValue: 'Command sent: {{command}}', command: JOINT_TECH_FIXED_COMMAND }).replace('{{command}}', JOINT_TECH_FIXED_COMMAND) };
    } catch (error) {
      console.error('❌ JOINT TECH REQUEST FAILED:', error);
      return { success: false, message: error.message || t('master_slave.errors.command_failed', { defaultValue: 'Failed to send command' }) };
    }
  };

  // Clean slave ID - PRESERVES alphanumeric characters
  const cleanSlaveId = (value) => {
    if (!value) return null;
    // Remove leading zeros but preserve letters and numbers
    let cleaned = value.replace(/^0+/, '').trim();
    // Extract alphanumeric pattern (keep letters and numbers)
    const match = cleaned.match(/[A-Za-z0-9]+/);
    if (match) {
      cleaned = match[0];
    }
    console.log('CLEANING SLAVE ID: Input=', value, 'Output=', cleaned);
    return cleaned;
  };

  // Save master to AsyncStorage
  const saveMasterToStorage = async (masterSN, slavesList) => {
    try {
      // Get existing masters
      const existingMastersJSON = await AsyncStorage.getItem('masters');
      let masters = existingMastersJSON ? JSON.parse(existingMastersJSON) : [];

      // Check if master already exists
      const existingIndex = masters.findIndex(m => m.masterSN === masterSN);

      if (existingIndex !== -1) {
        // Update existing master's slaves
        masters[existingIndex].slaves = slavesList;
        masters[existingIndex].lastUpdated = new Date().toISOString();
      } else {
        // Add new master
        masters.push({
          masterSN: masterSN,
          slaves: slavesList,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        });
      }

      // Save back to AsyncStorage
      await AsyncStorage.setItem('masters', JSON.stringify(masters));
      console.log('✅ Master saved to storage:', masterSN);
    } catch (error) {
      console.error('Error saving master:', error);
    }
  };

  // Send mapping with proper command format and authentication
  const sendMapping = async (slaveList) => {
    console.log('--- INITIATING SEND MAPPING ---');
    console.log('Master SN:', master);
    console.log('Slaves to map:', slaveList);

    try {
      // Clean slave IDs (remove leading zeros)
      const cleanedSlaves = slaveList.map(slave => {
        // Remove leading zeros from slave IDs
        let cleaned = slave.replace(/^0+/, '');
        console.log(`Cleaning slave: ${slave} -> ${cleaned}`);
        return cleaned;
      });

      const sanitizedSlaves = cleanedSlaves.map(s => s.trim());
      const count = sanitizedSlaves.length;
      // Join slaves with commas - NO extra spaces
      const slaveString = sanitizedSlaves.join(',');

      // Command format: (master_sn,1,001,WLNET,1,1,count,slave1,slave2,...)
      // Example: (8052558332,1,001,WLNET,1,1,2,E170BG789,E03B5904FF)
      const command = `(${master},1,001,WLNET,1,1,${count},${slaveString})`;

      // Build URL without encoding the command (or encode properly)
      const url = `${serverURL}joint-tech/command/${master}?command=${encodeURIComponent(command)}`;

      console.log('==============================');
      console.log('🚀 SENDING MAPPING COMMAND');
      console.log('Master SN:', master);
      console.log('Slave Count:', count);
      console.log('Cleaned Slaves:', slaveString);
      console.log('Command:', command);
      console.log('URL:', url);
      console.log('==============================');

      const response = await authenticatedFetch(
        url,
        {
          method: 'GET',
          headers: {},
        },
        i18n
      );

      const responseText = await response.text();

      console.log('📦 Mapping Response Status:', response.status);
      console.log('📦 Mapping Response Body:', responseText);

      if (response.status === 401) {
        throw new Error(t('master_slave.errors.session_expired', { defaultValue: 'Session expired. Please login again.' }));
      }

      if (!response.ok) {
        throw new Error(t('master_slave.errors.server_error', { defaultValue: 'Server responded with status {{status}}', status: response.status }).replace('{{status}}', response.status.toString()));
      }

      return responseText;
    } catch (error) {
      console.error('--- MAPPING FETCH ERROR ---', error);
      throw error;
    }
  };

  // Remove mapping function - just clears the current session without API call
  const handleRemoveMapping = async () => {
    if (!master) {
      Snackbar.show({
        text: t('master_slave.errors.no_master', { defaultValue: 'No master set to remove' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    Alert.alert(
      t('master_slave.remove_mapping.title', { defaultValue: 'Remove Mapping' }),
      t('master_slave.remove_mapping.message', { defaultValue: 'Are you sure you want to remove the mapping for master {{master}}?', master: master }).replace('{{master}}', master),
      [
        { text: t('master_slave.remove_mapping.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('master_slave.remove_mapping.confirm', { defaultValue: 'Remove' }),
          style: 'destructive',
          onPress: () => {
            // Just reset the current session without making API call
            resetCurrentSession();
            Snackbar.show({
              text: t('master_slave.remove_mapping.success', { defaultValue: '✓ Mapping cleared from form' }),
              duration: 3000,
              backgroundColor: '#4CAF50',
            });
          }
        }
      ]
    );
  };

  // Send device-specific command (for testing/validation)
  const sendDeviceCommand = async () => {
    if (!master || !masterType) {
      Snackbar.show({ text: t('master_slave.errors.no_master_device', { defaultValue: 'No master device scanned' }), backgroundColor: '#FF6B6B' });
      return;
    }

    setIsLoading(true);
    try {
      let response;
      if (masterType === 'TELEMATICS') {
        response = await sendTelematicsCommand(master, TELEMATICS_COMMAND);
      } else {
        response = await sendJointTechCommand(master);
      }

      if (response.success) {
        Snackbar.show({
          text: t('master_slave.success.command_sent_to_device', { defaultValue: 'Command sent to {{deviceType}} device', deviceType: masterType === 'TELEMATICS' ? 'Telematics' : 'Joint Tech' }).replace('{{deviceType}}', masterType === 'TELEMATICS' ? 'Telematics' : 'Joint Tech'),
          duration: 3000,
          backgroundColor: '#4CAF50',
        });
      } else {
        Snackbar.show({
          text: response.message,
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
    } catch (error) {
      Snackbar.show({ text: t('master_slave.errors.command_failed', { defaultValue: 'Failed to send command' }), backgroundColor: '#FF6B6B' });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle scanned codes for both master and slaves
  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value || isLoading) return;

    if (scanType === 'MASTER') {
      // Parse the scanned content to extract the device ID (numeric only for master)
      const parsedResult = parseScannedContent(value, false);

      let masterValue = parsedResult?.deviceId || value.trim();

      // For master, remove any non-numeric characters (master should be numeric only)
      masterValue = masterValue.replace(/[^\d]/g, '');

      if (!masterValue) {
        Alert.alert(
          t('master_slave.errors.invalid_scan.title', { defaultValue: 'Invalid Scan' }),
          t('master_slave.errors.invalid_scan.message', { defaultValue: 'Could not find device ID in the scanned code. Please ensure you scan the device QR/barcode.' }),
          [{ text: 'OK', onPress: () => setViewMode('DASHBOARD') }]
        );
        setViewMode('DASHBOARD');
        return;
      }

      // Detect device type based on length
      const detectedType = detectDeviceType(masterValue);

      if (!detectedType) {
        Alert.alert(
          t('master_slave.errors.unknown_device.title', { defaultValue: 'Unknown Device' }),
          t('master_slave.errors.unknown_device.message', { defaultValue: 'Device ID "{{id}}" has {{digits}} digits.\n\nExpected:\n• Telematics: 8 digits\n• Joint Tech: 10 digits', id: masterValue, digits: masterValue.length }).replace('{{id}}', masterValue).replace('{{digits}}', masterValue.length.toString()),
          [{ text: 'OK', onPress: () => setViewMode('DASHBOARD') }]
        );
        setViewMode('DASHBOARD');
        return;
      }

      setMaster(masterValue);
      setMasterType(detectedType);
      setMasterRaw(value);
      setViewMode('DASHBOARD');

      Snackbar.show({
        text: t('master_slave.success.master_set', { defaultValue: '{{deviceType}} Master set: {{id}}', deviceType: detectedType === 'TELEMATICS' ? '📱 Telematics' : '📊 Joint Tech', id: masterValue }).replace('{{deviceType}}', detectedType === 'TELEMATICS' ? '📱 Telematics' : '📊 Joint Tech').replace('{{id}}', masterValue),
        backgroundColor: '#4CAF50',
        duration: 4000,
      });

      console.log('Extracted Master ID:', masterValue);
      console.log('Device Type:', detectedType);
      console.log('Raw scanned content:', value);

    } else if (scanType === 'SLAVE') {
      // For slaves, preserve alphanumeric characters
      const parsedResult = parseScannedContent(value, true);

      let slaveId = parsedResult?.deviceId || value.trim();

      // Don't strip letters from slave IDs - keep them as is
      // Just trim whitespace
      slaveId = slaveId.trim();

      if (!slaveId || slaveId.length < 3) {
        Snackbar.show({
          text: t('master_slave.errors.slave_too_short', { defaultValue: 'Invalid slave code - too short' }),
          backgroundColor: '#FF6B6B'
        });
        setViewMode('DASHBOARD');
        return;
      }

      if (slaves.includes(slaveId)) {
        Snackbar.show({
          text: t('master_slave.errors.slave_duplicate', { defaultValue: 'Slave already scanned' }),
          backgroundColor: '#FF9800'
        });
        setViewMode('DASHBOARD');
        return;
      }

      setSlaves([...slaves, slaveId]);
      setViewMode('DASHBOARD');
      Snackbar.show({ text: t('master_slave.success.slave_added', { defaultValue: '✓ Slave added: {{id}}', id: slaveId }).replace('{{id}}', slaveId), backgroundColor: '#4CAF50' });
      console.log('Added slave:', slaveId);
    }
  };

  const handleMapAll = async () => {
    if (!master || slaves.length === 0) {
      Snackbar.show({ text: t('master_slave.errors.missing_master_or_slaves', { defaultValue: 'Master or slaves missing' }), backgroundColor: '#FF6B6B' });
      return;
    }

    if (masterType !== 'JOINT_TECH') {
      Snackbar.show({
        text: t('master_slave.errors.joint_tech_only', { defaultValue: 'Mapping only available for Joint Tech master devices' }),
        backgroundColor: '#FF9800',
        duration: 4000,
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await sendMapping(slaves);

      // Save to AsyncStorage
      await saveMasterToStorage(master, slaves);

      // Save to global list for tracking
      const newMapping = {
        id: Date.now().toString(),
        master: master,
        masterType: masterType,
        slaves: [...slaves],
        timestamp: new Date().toLocaleString(),
        response: response,
      };
      setAllMappings(prev => [newMapping, ...prev]);

      Snackbar.show({ text: t('master_slave.success.mapping_complete', { defaultValue: '✓ Successfully mapped {{count}} slave(s) to master {{master}}', count: slaves.length, master: master }).replace('{{count}}', slaves.length.toString()).replace('{{master}}', master), backgroundColor: '#4CAF50', duration: 4000 });

      // Reset current fields for next truck
      resetCurrentSession();
    } catch (error) {
      console.error('Mapping failed:', error);
      Snackbar.show({ text: t('master_slave.errors.mapping_failed', { defaultValue: 'Mapping failed: {{message}}', message: error.message }).replace('{{message}}', error.message), backgroundColor: '#FF6B6B', duration: 4000 });
    } finally {
      setIsLoading(false);
    }
  };

  const resetCurrentSession = () => {
    setMaster(null);
    setMasterType(null);
    setMasterRaw(null);
    setSlaves([]);
    setViewMode('DASHBOARD');
  };

  const clearHistory = () => {
    setAllMappings([]);
    Snackbar.show({ text: t('master_slave.success.history_cleared', { defaultValue: 'History cleared' }), backgroundColor: '#7F8C8D' });
  };

  // --- RENDERING LOGIC ---

  if (viewMode === 'SUMMARY') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

        <View style={styles.customHeader}>
          <TouchableOpacity
            onPress={() => setViewMode('DASHBOARD')}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{t('master_slave.summary.title', { defaultValue: 'Truck Mapping History' })}</Text>
            <Text style={styles.headerSubtitle}>{t('master_slave.summary.total_trucks', { defaultValue: 'Total Trucks: {{count}}', count: allMappings.length }).replace('{{count}}', allMappings.length.toString())}</Text>
          </View>
        </View>

        <FlatList
          style={{ width: '100%', marginTop: 10 }}
          data={allMappings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <View style={styles.deviceTypeHeader}>
                  <Text style={item.masterType === 'TELEMATICS' ? styles.telematicsBadge : styles.jointTechBadge}>
                    {item.masterType === 'TELEMATICS' ? t('master_slave.device_types.telematics', { defaultValue: '📱 Telematics' }) : t('master_slave.device_types.joint_tech', { defaultValue: '📊 Joint Tech' })}
                  </Text>
                  <Text style={styles.summaryMaster}>{t('master_slave.summary.master_label', { defaultValue: 'Master' })}: {item.master}</Text>
                </View>
                <Text style={styles.timestamp}>{item.timestamp}</Text>
              </View>
              <Text style={styles.summarySlaves}>
                {t('master_slave.summary.slaves_label', { defaultValue: 'Slaves ({{count}})' }).replace('{{count}}', item.slaves.length.toString())}: {item.slaves.join(', ')}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={64} color="#CCCCCC" />
              <Text style={styles.emptyText}>{t('master_slave.summary.empty', { defaultValue: 'No mappings performed yet.' })}</Text>
            </View>
          }
        />

        <TouchableOpacity
          style={styles.backToScannerButton}
          onPress={() => setViewMode('DASHBOARD')}
        >
          <Text style={styles.backToScannerButtonText}>{t('master_slave.buttons.back_to_scanner', { defaultValue: 'BACK TO SCANNER' })}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dangerButton} onPress={clearHistory}>
          <Text style={styles.dangerButtonText}>{t('master_slave.buttons.clear_history', { defaultValue: 'Clear All History' })}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (viewMode === 'SCANNER') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

        <View style={styles.customHeader}>
          <TouchableOpacity
            onPress={() => setViewMode('DASHBOARD')}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>
              {scanType === 'MASTER'
                ? t('master_slave.scanner.master_title', { defaultValue: 'Scanning Master (QR/Barcode)' })
                : t('master_slave.scanner.slave_title', { defaultValue: 'Scanning Slaves' })}
            </Text>
            {scanType === 'MASTER' && (
              <Text style={styles.headerSubtitle}>
                {t('master_slave.scanner.master_subtitle', { defaultValue: 'Auto-detects Telematics (8 digits) or Joint Tech (10 digits)' })}
              </Text>
            )}
            {scanType === 'SLAVE' && (
              <Text style={styles.headerSubtitle}>
                {t('master_slave.scanner.slave_subtitle', { defaultValue: 'Scan slave/sensor barcodes (alphanumeric)' })}
              </Text>
            )}
          </View>
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

        {scanType === 'MASTER' && (
          <View style={styles.instructionContainer}>
            <Ionicons name="information-circle-outline" size={20} color="#FFA500" />
            <Text style={styles.instructionText}>
              {t('master_slave.scanner.master_instruction', { defaultValue: 'Scan device QR or barcode (8 digits for Telematics, 10 for Joint Tech)' })}
            </Text>
          </View>
        )}

        {scanType === 'SLAVE' && (
          <View style={styles.instructionContainer}>
            <Ionicons name="information-circle-outline" size={20} color="#4CAF50" />
            <Text style={styles.instructionText}>
              {t('master_slave.scanner.slave_instruction', { defaultValue: 'Scan slave/sensor barcode (alphanumeric like E170BG789)' })}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setViewMode('DASHBOARD')}
        >
          <Text style={styles.cancelButtonText}>{t('master_slave.buttons.cancel_scan', { defaultValue: 'CANCEL SCAN' })}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // DASHBOARD VIEW
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('master_slave.dashboard.title', { defaultValue: 'Master-Slave Mapper' })}</Text>
          <Text style={styles.headerSubtitle}>{t('master_slave.dashboard.subtitle', { defaultValue: 'Map sensors to master device' })}</Text>
        </View>
      </View>

      {/* Master Card */}
      <View style={styles.infoCard}>
        <View style={[
          styles.cardIconContainer,
          masterType === 'TELEMATICS' ? styles.telematicsIconBg : styles.jointTechIconBg
        ]}>
          <Ionicons
            name={masterType === 'TELEMATICS' ? "phone-portrait-outline" : "hardware-chip-outline"}
            size={24}
            color={masterType === 'TELEMATICS' ? "#4ECDC4" : "#FFA500"}
          />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardLabel}>{t('master_slave.dashboard.current_master', { defaultValue: 'Current Master' })}</Text>
          <Text style={styles.cardValue}>
            {master ? master : t('master_slave.dashboard.scan_master', { defaultValue: 'Scan a Master Device' })}
          </Text>
          {masterType && (
            <View style={styles.deviceTypeContainer}>
              <Text style={masterType === 'TELEMATICS' ? styles.telematicsTypeText : styles.jointTechTypeText}>
                {masterType === 'TELEMATICS'
                  ? t('master_slave.device_types.telematics_detail', { defaultValue: '📱 Telematics Device (8 digits)' })
                  : t('master_slave.device_types.joint_tech_detail', { defaultValue: '📊 Joint Tech Device (10 digits)' })}
              </Text>
            </View>
          )}
          {masterRaw && masterRaw.includes('\n') && (
            <Text style={styles.rawText} numberOfLines={1}>
              {t('master_slave.dashboard.extracted_from', { defaultValue: 'Extracted from' })}: {masterRaw.substring(0, 30)}...
            </Text>
          )}
        </View>
      </View>

      {/* Slaves Counter */}
      <View style={styles.statsContainer}>
        <Ionicons name="link-outline" size={20} color="#FFA500" />
        <Text style={styles.statsText}>{t('master_slave.dashboard.current_slaves', { defaultValue: 'Current Slaves: {{count}}', count: slaves.length }).replace('{{count}}', slaves.length.toString())}</Text>
      </View>

      {/* Action Buttons - Fixed width */}
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.masterButton]}
          onPress={() => {
            setScanType('MASTER');
            setViewMode('SCANNER');
          }}
        >
          <Ionicons name="qr-code-outline" size={20} color="#000" />
          <Text style={styles.actionButtonText}>{t('master_slave.buttons.scan_master', { defaultValue: 'Scan Master' })}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.slaveButton]}
          onPress={() => {
            setScanType('SLAVE');
            setViewMode('SCANNER');
          }}
        >
          <Ionicons name="scan-outline" size={20} color="#000" />
          <Text style={styles.actionButtonText}>{t('master_slave.buttons.scan_slaves', { defaultValue: 'Scan Slaves' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Slaves List */}
      {slaves.length > 0 && (
        <>
          <Text style={styles.listTitle}>{t('master_slave.dashboard.scanned_slaves', { defaultValue: 'Scanned Slaves' })}</Text>
          <FlatList
            style={{ width: '100%', flex: 1 }}
            data={slaves}
            keyExtractor={(item, index) => item + index}
            renderItem={({ item, index }) => (
              <View style={styles.slaveRow}>
                <Ionicons name="radio-button-on" size={16} color="#4CAF50" />
                <Text style={styles.slaveItem}>
                  {index + 1}. {item}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newSlaves = slaves.filter((_, i) => i !== index);
                    setSlaves(newSlaves);
                    Snackbar.show({ text: t('master_slave.success.slave_removed', { defaultValue: 'Removed {{id}}', id: item }).replace('{{id}}', item), backgroundColor: '#FF9800' });
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      {/* Footer Buttons */}
      <View style={styles.footer}>
        {master && masterType === 'JOINT_TECH' && slaves.length > 0 && (
          <TouchableOpacity
            style={styles.mapButton}
            onPress={handleMapAll}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.mapButtonText}>{t('master_slave.buttons.map_all', { defaultValue: '✓ MAP ALL SLAVES TO MASTER' })}</Text>
            )}
          </TouchableOpacity>
        )}

        {slaves.length > 0 && masterType === 'TELEMATICS' && (
          <View style={styles.warningContainer}>
            <Ionicons name="warning-outline" size={16} color="#FF9800" />
            <Text style={styles.warningText}>
              {t('master_slave.warnings.joint_tech_only', { defaultValue: 'Mapping only available for Joint Tech master devices' })}
            </Text>
          </View>
        )}

        <View style={styles.secondaryActions}>
          {master && (
            <TouchableOpacity
              style={styles.dangerButtonSmall}
              onPress={handleRemoveMapping}
              disabled={isLoading}
            >
              <Text style={styles.dangerButtonSmallText}>{t('master_slave.buttons.remove_mapping', { defaultValue: '🗑️ Remove Mapping' })}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.resetButtonSmall} onPress={resetCurrentSession}>
            <Text style={styles.resetButtonSmallText}>{t('master_slave.buttons.reset_form', { defaultValue: 'Reset Form' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  telematicsIconBg: {
    backgroundColor: '#E0F7FA',
  },
  jointTechIconBg: {
    backgroundColor: '#FFF3E0',
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  deviceTypeContainer: {
    marginTop: 6,
  },
  telematicsTypeText: {
    fontSize: 11,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  jointTechTypeText: {
    fontSize: 11,
    color: '#FFA500',
    fontWeight: '600',
  },
  rawText: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  statsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
    marginLeft: 8,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    flex: 1,
    elevation: 2,
    gap: 8,
  },
  masterButton: {
    backgroundColor: '#4CAF50',
  },
  slaveButton: {
    backgroundColor: '#FFD700',
  },
  actionButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  slaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    gap: 10,
  },
  slaveItem: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  mapButton: {
    backgroundColor: '#FFD700',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  mapButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    gap: 8,
  },
  warningText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '500',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    gap: 10,
  },
  dangerButtonSmall: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
  },
  dangerButtonSmallText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 13,
  },
  resetButtonSmall: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  resetButtonSmallText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 13,
  },
  dangerButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFEBEE',
  },
  dangerButtonText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 14,
  },
  backToScannerButton: {
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  backToScannerButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cameraWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: '#1C1E22',
  },
  camera: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
  },
  scanBorder: {
    position: 'absolute',
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderWidth: 2,
    borderColor: '#FFD700',
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 30,
  },
  cancelButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    gap: 8,
  },
  instructionText: {
    color: '#FF9800',
    fontSize: 12,
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  deviceTypeHeader: {
    flex: 1,
  },
  telematicsBadge: {
    fontSize: 11,
    color: '#4ECDC4',
    fontWeight: '700',
    marginBottom: 4,
  },
  jointTechBadge: {
    fontSize: 11,
    color: '#FFA500',
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryMaster: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timestamp: {
    color: '#888',
    fontSize: 11,
  },
  summarySlaves: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 16,
  },
});

export default MasterSlaveMapper;
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Vibration,
  RefreshControl,
  FlatList,
  SafeAreaView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as Animatable from 'react-native-animatable';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import serverURL from '../config';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;
const STORAGE_KEY = '@inventory_devices';

const InventoryScan = ({ navigation }) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [authToken, setAuthToken] = useState(null);

  // Save devices to AsyncStorage
  const saveDevicesToStorage = async (devicesList) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(devicesList));
      console.log('💾 Saved devices to storage:', devicesList.length);
    } catch (error) {
      console.error('❌ Failed to save devices:', error);
    }
  };

  // Load devices from AsyncStorage
  const loadDevicesFromStorage = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('📦 Loaded devices from storage:', parsed.length);
        return parsed;
      }
    } catch (error) {
      console.error('❌ Failed to load devices:', error);
    }
    return [];
  };

  // 🔐 Load auth token once on mount AND load stored devices
  useEffect(() => {
    const loadAuthAndDevices = async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        console.log('🔐 Token loaded:', token ? '✓ Exists' : '✗ Missing');
        setAuthToken(token);

        // Load persisted devices FIRST
        const storedDevices = await loadDevicesFromStorage();
        if (storedDevices.length > 0) {
          console.log(`📦 Loaded ${storedDevices.length} devices from storage`);
          setDevices(storedDevices);
        }

        // Then try to fetch from API (with valid token)
        if (token) {
          await fetchDevices(token);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('❌ Failed to load token:', e);
        setLoading(false);
      }
    };
    loadAuthAndDevices();
  }, []);

  // Fetch devices from API - accepts token param
  const fetchDevices = async (token) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const response = await fetch(`${serverURL}devices`, { headers });

      if (response.status === 401) {
        console.warn('⚠️ API 401 - token may be expired, using stored devices only');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const apiDevices = data.content || [];

      // Merge with stored devices (avoid duplicates by serialNo)
      setDevices(prevDevices => {
        const merged = [...prevDevices];
        apiDevices.forEach(apiDevice => {
          if (!merged.some(d => d.serialNo === apiDevice.serialNo)) {
            merged.push(apiDevice);
          }
        });
        // Save merged list to storage
        saveDevicesToStorage(merged);
        return merged;
      });
    } catch (error) {
      console.error('❌ Fetch error:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (authToken) {
      fetchDevices(authToken);
    } else {
      setRefreshing(false);
    }
  }, [authToken]);

  // 🔍 Extract clean serial number - strips prefixes like "Device_" and handles URLs
  const extractSerialNumber = (rawValue) => {
    if (!rawValue) return null;
    let cleaned = rawValue.trim();

    // Try to extract from URL if it's a web address
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      // Extract domain without TLD
      const domainMatch = cleaned.match(/:\/\/(?:www\.)?([^\/]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        // Remove .com, .co.ke, .org, .net etc and get the meaningful part
        const baseName = domain.replace(/\.(com|co\.ke|org|net|io)$/i, '');
        cleaned = baseName;
      }
    }

    // Remove common prefixes (case-insensitive)
    cleaned = cleaned.replace(/^(Device_|SN:|SERIAL:|ID:|QR:|CODE:|jointcontrols\.com\/)/i, '');

    // Look for alphanumeric sequence (at least 6 characters)
    const match = cleaned.match(/[A-Z0-9]{6,}/i);

    if (match) {
      return match[0].toUpperCase();
    }

    // If no match, check if cleaned is purely digits (for barcodes)
    if (/^\d+$/.test(cleaned) && cleaned.length >= 8) {
      return cleaned;
    }

    return null;
  };

  // 📷 Handle scanned code (barcode OR QR code)
  const onReadCode = async (event) => {
    const rawValue = event?.nativeEvent?.codeStringValue;
    console.log('📷 SCANNED RAW:', rawValue);

    if (!rawValue || scanned || isLoading) return;

    // Extract clean serial number
    const serialNo = extractSerialNumber(rawValue);
    console.log('✅ CLEAN SERIAL:', serialNo);

    if (!serialNo) {
      Snackbar.show({
        text: t('inventory_scan.errors.cannot_read', { defaultValue: 'Could not read code. Try again.' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setScanned(true);
    setScannedData(rawValue);
    Vibration.vibrate(100);

    // 🎯 Add to local list immediately (core requirement)
    await addDeviceToLocalList(serialNo);

    // 🌐 Try API sync in background (optional)
    await tryApiRegistration(serialNo);
  };

  // ✅ ALWAYS add to local list first
  const addDeviceToLocalList = async (serialNo) => {
    const isJointTech = serialNo.length === 10;

    const newDevice = {
      deviceId: Date.now() + Math.random(), // Unique temp ID
      name: serialNo,           // ✅ Clean serial, NO prefix
      serialNo: serialNo,       // ✅ Clean serial
      yearOfManufacture: new Date().getFullYear(),
      make: '',
      model: isJointTech ? 'JT701D' : 'AT10K', // Auto-guess model
      imei: '',
      sim1Number: '',
      sim2Number: '',
      warrantyNumber: '',
      warrantyPeriodMonths: 12,
      firmwareVersion: '',
      notes: 'Scanned via mobile app',
      password: '',
      manufacturerId: isJointTech ? 2 : 1,
      manufacturer: {
        id: isJointTech ? 2 : 1,
        name: isJointTech ? 'Joint Tech' : 'Telematics',
        code: isJointTech ? 'MF002' : 'MF001',
      },
      deviceTypeId: 1,
      deviceType: { id: 1, name: 'Master', code: 'DT01' },
      warrantyStartDate: new Date().toISOString().split('T')[0],
      warrantyStatus: 'VALID',
      isOnline: false,
      vehicle: null,
      activeT1Number: '',
      groupId: 1,
      groupName: 'Group A',
      conditionId: 1,
      conditionCode: 'G01',
      conditionName: 'Good',
      scannedAt: new Date().toISOString(), // Add timestamp for tracking
    };

    setDevices((prev) => {
      // Avoid duplicates
      if (prev.some((d) => d.serialNo === serialNo)) {
        console.log('⚠️ Device already in list:', serialNo);
        Snackbar.show({
          text: t('inventory_scan.errors.already_in_inventory', { defaultValue: '⚠️ {{serialNo}} already in inventory', serialNo: serialNo }).replace('{{serialNo}}', serialNo),
          duration: 1500,
          backgroundColor: '#FF9800',
        });
        return prev;
      }
      console.log('✅ Added to local list:', serialNo);
      const updatedList = [newDevice, ...prev];
      // Save to storage immediately
      saveDevicesToStorage(updatedList);
      return updatedList;
    });

    Snackbar.show({
      text: t('inventory_scan.success.added_to_inventory', { defaultValue: '✓ {{serialNo}} added to inventory', serialNo: serialNo }).replace('{{serialNo}}', serialNo),
      duration: 2000,
      backgroundColor: '#4CAF50',
    });
  };

  // 🌐 Try to sync with API (won't block user if it fails)
  const tryApiRegistration = async (serialNo) => {
    setIsLoading(true);
    setResultMessage(null);
    setErrorDetails(null);

    try {
      if (!authToken) {
        console.log('⚠️ No auth token - skipping API sync (local mode)');
        setResultMessage(t('inventory_scan.status.saved_locally_offline', { defaultValue: 'Saved locally (offline mode)' }));
        return;
      }

      const isJointTech = serialNo.length === 10;
      const deviceData = {
        name: serialNo,              // ✅ Clean serial, NO "Device_" prefix
        serialNo: serialNo,          // ✅ Clean serial
        yearOfManufacture: new Date().getFullYear(),
        make: '',
        model: '',
        imei: '',
        sim1Number: '',
        sim2Number: '',
        warrantyNumber: '',
        warrantyPeriodMonths: 12,
        firmwareVersion: '',
        notes: 'Auto-registered via mobile scanner',
        password: '',
        manufacturerId: isJointTech ? 2 : 1,
        deviceTypeId: 1,
        warrantyStartDate: new Date().toISOString().split('T')[0],
      };

      console.log('📤 API Payload:', { name: deviceData.name, serialNo: deviceData.serialNo });

      const response = await fetch(`${serverURL}devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`, // 🔐 Critical for auth
        },
        body: JSON.stringify(deviceData),
      });

      console.log('📡 API Response Status:', response.status);

      if (response.ok) {
        console.log('✅ API sync successful');
        setResultMessage(t('inventory_scan.status.synced_to_server', { defaultValue: 'Synced to server' }));
        if (authToken) {
          await fetchDevices(authToken); // Refresh list with real server data
        }
      } else if (response.status === 401) {
        console.warn('⚠️ API 401 - token expired');
        setResultMessage(t('inventory_scan.status.saved_locally_login_to_sync', { defaultValue: 'Saved locally (login to sync)' }));
      } else if (response.status === 409) {
        console.log('ℹ️ Device already exists on server');
        setResultMessage(t('inventory_scan.status.already_on_server', { defaultValue: 'Already on server' }));
      } else {
        const text = await response.text();
        console.warn('⚠️ API error:', response.status, text);
        setResultMessage(t('inventory_scan.status.saved_locally_server_error', { defaultValue: 'Saved locally (server error)' }));
      }
    } catch (error) {
      console.error('❌ API sync failed:', error.message);
      setResultMessage(t('inventory_scan.status.saved_locally_network_error', { defaultValue: 'Saved locally (network error)' }));
    } finally {
      setIsLoading(false);
      // Close scanner after brief delay regardless of API result
      setTimeout(() => {
        setScanModalVisible(false);
        resetScanner();
      }, 1200);
    }
  };

  const resetScanner = () => {
    setScannedData(null);
    setResultMessage(null);
    setErrorDetails(null);
    setIsLoading(false);
    setScanned(false);
  };

  const renderDeviceCard = ({ item, index }) => {
    const isJointTech = item.manufacturerId === 2 || item.serialNo?.length === 10;
    return (
      <Animatable.View animation="fadeInUp" delay={index * 100} style={styles.deviceCard}>
        <View style={styles.deviceHeader}>
          <Text style={styles.deviceName} numberOfLines={1}>
            {item.serialNo}
          </Text>
          <View
            style={[
              styles.warrantyBadge,
              {
                backgroundColor:
                  item.warrantyStatus === 'VALID' ? '#4CAF50' : '#FF9800',
              },
            ]}
          >
            <Text style={styles.warrantyBadgeText}>
              {item.warrantyStatus || t('inventory_scan.na', { defaultValue: 'N/A' })}
            </Text>
          </View>
        </View>
        <View style={styles.deviceDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="barcode-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{t('inventory_scan.sn_label', { defaultValue: 'SN' })}: {item.serialNo}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="hardware-chip-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {item.manufacturer?.name ||
                (isJointTech ? t('inventory_scan.manufacturers.joint_tech', { defaultValue: 'Joint Tech' }) : t('inventory_scan.manufacturers.telematics', { defaultValue: 'Telematics' }))}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="phone-portrait-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {t('inventory_scan.model_label', { defaultValue: 'Model' })}: {item.model || t('inventory_scan.na', { defaultValue: 'N/A' })}
            </Text>
          </View>
        </View>
      </Animatable.View>
    );
  };

  if (loading && devices.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FFA500" />
        <Text style={styles.loadingText}>{t('inventory_scan.loading', { defaultValue: 'Loading inventory...' })}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('inventory_scan.title', { defaultValue: 'Device Inventory' })}</Text>
        <Text style={styles.headerSubtitle}>
          {devices.length} {t('inventory_scan.devices_count', { defaultValue: 'devices' })} {!authToken && t('inventory_scan.local_mode', { defaultValue: '🔓 Local Mode' })}
        </Text>
      </View>

      {!scannedData ? (
        <>
          <FlatList
            data={devices}
            keyExtractor={(item) =>
              item.deviceId?.toString() ||
              item.serialNo ||
              Math.random().toString()
            }
            renderItem={renderDeviceCard}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#FFA500']}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="qr-code-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>{t('inventory_scan.empty.title', { defaultValue: 'No devices found' })}</Text>
                <Text style={styles.emptySubtext}>{t('inventory_scan.empty.subtext', { defaultValue: 'Tap + to scan barcode or QR code' })}</Text>
              </View>
            }
          />

          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              setScanModalVisible(true);
              resetScanner();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="scan" size={28} color="#fff" />
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.resultContainer}>
          {isLoading ? (
            <>
              <ActivityIndicator size="large" color="#FFA500" />
              <Text style={styles.loadingText}>{t('inventory_scan.syncing', { defaultValue: 'Syncing...' })}</Text>
            </>
          ) : (
            <>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.resultTitle}>{t('inventory_scan.added_to_list', { defaultValue: 'Added to List' })}</Text>
              <Text style={styles.successText}>
                {scannedData} → {extractSerialNumber(scannedData)}
              </Text>
              {resultMessage && (
                <Text style={styles.errorDetailsText}>{resultMessage}</Text>
              )}
              <TouchableOpacity style={styles.rescanButton} onPress={resetScanner}>
                <Text style={styles.rescanText}>{t('inventory_scan.scan_another', { defaultValue: 'Scan Another' })}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Camera Modal - Supports BOTH Barcodes & QR Codes */}
      <Modal
        visible={scanModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setScanModalVisible(false);
          resetScanner();
        }}
      >
        <SafeAreaView style={styles.cameraContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#0B0C10" />

          <View style={styles.cameraHeader}>
            <Text style={styles.cameraTitle}>{t('inventory_scan.scan_device', { defaultValue: 'Scan Device' })}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setScanModalVisible(false);
                resetScanner();
              }}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.cameraWrapper}>
            <View style={styles.cameraFrame}>
              <Camera
                style={styles.camera}
                scanBarcode={true} //
                onReadCode={onReadCode}
                showFrame={false}
              />
              <View style={styles.scanBorder} />
              {/* Animated scan line */}
              <Animatable.View
                animation="scanLine"
                iterationCount="infinite"
                duration={2000}
                style={styles.scanLine}
              />
            </View>
          </View>

          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionText}>
              {t('inventory_scan.instructions.align', { defaultValue: 'Align barcode or QR code inside the frame' })}
            </Text>
            <View style={styles.deviceTypesContainer}>
              <View style={styles.deviceTypeBadge}>
                <Text style={styles.deviceTypeIcon}>📱</Text>
                <Text style={styles.deviceTypeText}>{t('inventory_scan.device_types.telematics', { defaultValue: 'Telematics (8 digits)' })}</Text>
              </View>
              <View style={styles.deviceTypeBadge}>
                <Text style={styles.deviceTypeIcon}>📊</Text>
                <Text style={styles.deviceTypeText}>{t('inventory_scan.device_types.joint_tech', { defaultValue: 'Joint Tech (10 digits)' })}</Text>
              </View>
              <View style={styles.deviceTypeBadge}>
                <Text style={styles.deviceTypeIcon}>🔲</Text>
                <Text style={styles.deviceTypeText}>{t('inventory_scan.device_types.qr_codes', { defaultValue: 'QR Codes supported' })}</Text>
              </View>
            </View>
            <Text style={styles.noteText}>{t('inventory_scan.instructions.saved_locally', { defaultValue: '✓ Saved locally even if offline' })}</Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 20 : 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#1A1A1A' },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  listContainer: { padding: 16, paddingBottom: 80 },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  warrantyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  warrantyBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  deviceDetails: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailText: { fontSize: 13, color: '#666', marginLeft: 8, flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#FFA500',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: { fontSize: 16, color: '#999', marginTop: 16, fontWeight: '500' },
  emptySubtext: { fontSize: 13, color: '#bbb', marginTop: 8 },
  cameraContainer: { flex: 1, backgroundColor: '#0B0C10' },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0B0C10',
  },
  cameraTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  closeButton: { padding: 5 },
  cameraWrapper: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  cameraFrame: {
    width: SCAN_SIZE + 20,
    height: SCAN_SIZE + 20,
    borderRadius: 25,
    backgroundColor: '#1C1E22',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
  scanLine: {
    position: 'absolute',
    width: SCAN_SIZE - 4,
    height: 2,
    backgroundColor: '#FFD700',
    borderRadius: 1,
    top: 10,
  },
  instructionsContainer: { padding: 30, alignItems: 'center' },
  instructionText: {
    color: '#C5C6CA',
    fontSize: 15,
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
  deviceTypeIcon: { fontSize: 14, marginRight: 6 },
  deviceTypeText: { color: '#A4A6AD', fontSize: 12, fontWeight: '600' },
  noteText: {
    color: '#4CAF50',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1E22',
    borderRadius: 20,
    padding: 30,
    margin: 20,
  },
  successIcon: {
    fontSize: 50,
    color: '#4CAF50',
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
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 15,
  },
  errorDetailsText: {
    fontSize: 12,
    color: '#FFA500',
    textAlign: 'center',
    marginBottom: 15,
    fontStyle: 'italic',
  },
  rescanButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 30,
  },
  rescanText: { color: '#000', fontSize: 16, fontWeight: '700' },
});

// Register scan line animation
Animatable.initializeRegistryWithDefinitions({
  scanLine: {
    0: { top: 10, opacity: 1 },
    1: { top: SCAN_SIZE - 12, opacity: 0.5 },
  },
});

export default InventoryScan;
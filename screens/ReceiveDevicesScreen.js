import React, { useState, useEffect, useRef } from 'react';
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
  ScrollView,
  Platform,
  Modal,
  Dimensions
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera } from 'react-native-camera-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;
const API_BASE = 'https://demo2.bsl.co.ke';

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

// ✅ FIXED: Helper function to make authenticated axios request with retry on 401
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

const ReceiveDevicesScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();

  // State for form
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState(null);
  const [devicesList, setDevicesList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Scanner states
  const [showScanner, setShowScanner] = useState(true);
  const [scannedData, setScannedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Dropdown states
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [pendingSerialNumber, setPendingSerialNumber] = useState(null);

  // Device condition options
  const conditionOptions = [
    { id: 1, label: t('receive_devices.conditions.good', { defaultValue: 'Good' }) },
    { id: 2, label: t('receive_devices.conditions.faulty', { defaultValue: 'Faulty' }) },
    { id: 3, label: t('receive_devices.conditions.available', { defaultValue: 'Available' }) },
    { id: 4, label: t('receive_devices.conditions.in_use', { defaultValue: 'In Use' }) },
    { id: 5, label: t('receive_devices.conditions.in_return_transit', { defaultValue: 'In Return Transit' }) },
    { id: 6, label: t('receive_devices.conditions.awaiting_charging', { defaultValue: 'Awaiting Charging' }) },
    { id: 7, label: t('receive_devices.conditions.charging', { defaultValue: 'Charging' }) },
    { id: 8, label: t('receive_devices.conditions.under_repair', { defaultValue: 'Under Repair' }) },
    { id: 9, label: t('receive_devices.conditions.decommissioned', { defaultValue: 'Decommissioned' }) }
  ];

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in ReceiveDevicesScreen');
    });
    return () => removeListener();
  }, []);

  useEffect(() => {
    loadStoreData();
  }, []);

  const loadStoreData = async () => {
    try {
      const paramsStoreId = route.params?.storeId;
      const paramsStoreName = route.params?.storeName;

      if (paramsStoreId) {
        setStoreId(paramsStoreId.toString());
        if (paramsStoreName) {
          setStoreName(paramsStoreName);
        }
        console.log('Store received from navigation:', { storeId: paramsStoreId, storeName: paramsStoreName });
      } else {
        const storedStoreId = await AsyncStorage.getItem('storeId');
        const storedStoreName = await AsyncStorage.getItem('storeName');

        if (storedStoreId) {
          setStoreId(storedStoreId);
          setStoreName(storedStoreName || 'Store');
          console.log('Store loaded from storage:', { storeId: storedStoreId, storeName: storedStoreName });
        } else {
          console.warn('No store ID found!');
          Snackbar.show({
            text: t('receive_devices.errors.no_store', { defaultValue: 'No store assigned. Please contact admin.' }),
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      }
    } catch (error) {
      console.error('Error loading store data:', error);
    }
  };

  const extractSerialNumber = (scannedValue) => {
    if (scannedValue && scannedValue.includes('&')) {
      const parts = scannedValue.split('&');
      const serialNumber = parts[parts.length - 1];
      console.log('📋 Extracted Serial Number:', serialNumber);
      return serialNumber;
    }
    return scannedValue;
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    console.log('📷 SCANNED VALUE:', value);
    console.log('📷 LENGTH:', value?.length);

    if (!value || isLoading) return;

    const deviceCode = value.trim();
    const serialNumber = extractSerialNumber(deviceCode);

    if (!/^\d+$/.test(serialNumber)) {
      console.log('❌ Invalid: Serial number contains non-numeric characters');
      Snackbar.show({
        text: t('receive_devices.errors.invalid_barcode', { defaultValue: 'Invalid barcode: Serial number must contain only numbers' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (devicesList.some(device => device.serialNumber === serialNumber)) {
      Snackbar.show({
        text: t('receive_devices.errors.duplicate_serial', { defaultValue: 'Serial number {{serialNumber}} is already in the list', serialNumber: serialNumber }).replace('{{serialNumber}}', serialNumber),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setPendingSerialNumber(serialNumber);
    setShowDropdown(true);
    setShowScanner(false);
  };

  const handleConditionSelect = (condition) => {
    setSelectedCondition(condition);
  };

  const confirmAddDevice = () => {
    if (!selectedCondition) {
      Snackbar.show({
        text: t('receive_devices.errors.select_condition', { defaultValue: 'Please select a device condition' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    const newDevice = {
      serialNumber: pendingSerialNumber,
      deviceConditionId: selectedCondition.id
    };

    setDevicesList([...devicesList, newDevice]);

    Snackbar.show({
      text: t('receive_devices.success.device_added', { defaultValue: 'Device {{serialNumber}} added with condition: {{condition}}', serialNumber: pendingSerialNumber, condition: selectedCondition.label }).replace('{{serialNumber}}', pendingSerialNumber).replace('{{condition}}', selectedCondition.label),
      duration: 2000,
      backgroundColor: '#4CAF50',
    });

    setShowDropdown(false);
    setPendingSerialNumber(null);
    setSelectedCondition(null);
    setScannedData(null);
    setShowScanner(true);
  };

  const cancelAddDevice = () => {
    setShowDropdown(false);
    setPendingSerialNumber(null);
    setSelectedCondition(null);
    setShowScanner(true);
  };

  const removeDevice = (index) => {
    Alert.alert(
      t('receive_devices.remove_device.title', { defaultValue: 'Remove Device' }),
      t('receive_devices.remove_device.message', { defaultValue: 'Are you sure you want to remove this device?' }),
      [
        { text: t('receive_devices.remove_device.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('receive_devices.remove_device.confirm', { defaultValue: 'Remove' }),
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
      t('receive_devices.clear_all.title', { defaultValue: 'Clear All' }),
      t('receive_devices.clear_all.message', { defaultValue: 'Are you sure you want to remove all {{count}} devices?', count: devicesList.length }).replace('{{count}}', devicesList.length.toString()),
      [
        { text: t('receive_devices.clear_all.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('receive_devices.clear_all.confirm', { defaultValue: 'Clear All' }),
          style: 'destructive',
          onPress: () => setDevicesList([])
        }
      ]
    );
  };

  const submitDevices = async () => {
    if (!storeId) {
      Snackbar.show({
        text: t('receive_devices.errors.no_store', { defaultValue: 'No store assigned. Please contact admin.' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (devicesList.length === 0) {
      Snackbar.show({
        text: t('receive_devices.errors.no_devices', { defaultValue: 'Please add at least one device' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setSubmitting(true);

    try {
      const requestBody = {
        storeId: parseInt(storeId, 10),
        devices: devicesList
      };

      console.log('📤 Submitting devices:', JSON.stringify(requestBody, null, 2));

      // ✅ FIXED: Use authenticatedAxios instead of authenticatedFetch
      const response = await authenticatedAxios(
        'post',
        {
          url: `${API_BASE}/api/v1/store-stock/receive-devices`,
          data: requestBody,
          headers: {
            'Content-Type': 'application/json',
          },
        },
        i18n
      );

      const data = response.data;

      const successCount = data.successfulDeviceIds?.length || 0;
      const errorCount = data.errors?.length || 0;

      let message = t('receive_devices.success.submitted', { defaultValue: 'Successfully received {{count}} device(s)', count: successCount }).replace('{{count}}', successCount.toString());
      if (errorCount > 0) {
        message += t('receive_devices.success.with_errors', { defaultValue: ', {{count}} error(s) occurred', count: errorCount }).replace('{{count}}', errorCount.toString());
      }

      Snackbar.show({
        text: message,
        duration: 4000,
        backgroundColor: errorCount > 0 ? '#FF9800' : '#4CAF50',
      });

      if (data.errors && data.errors.length > 0) {
        console.error('Submission errors:', data.errors);
        Alert.alert(
          t('receive_devices.alert.partial_success', { defaultValue: 'Partial Success' }),
          t('receive_devices.alert.partial_success_message', { defaultValue: 'Some devices failed:\n{{errors}}', errors: data.errors.join('\n') }).replace('{{errors}}', data.errors.join('\n'))
        );
      }

      if (successCount > 0) {
        setDevicesList([]);
      }

    } catch (error) {
      console.error('Error submitting devices:', error);

      if (error.response?.status === 401) {
        Snackbar.show({
          text: t('receive_devices.errors.session_expired', { defaultValue: 'Session expired. Please log in again.' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        navigation.replace('Login');
        return;
      }

      Snackbar.show({
        text: error.response?.data?.message || error.message || t('receive_devices.errors.submit_failed', { defaultValue: 'Failed to submit devices. Please try again.' }),
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
        <Text style={styles.deviceSerial}>{item.serialNumber}</Text>
        <View style={styles.conditionBadge}>
          <Text style={styles.conditionText}>
            {conditionOptions.find(opt => opt.id === item.deviceConditionId)?.label || t('receive_devices.unknown', { defaultValue: 'Unknown' })}
          </Text>
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
          <Text style={styles.headerTitle}>{t('receive_devices.title', { defaultValue: 'Receive Devices' })}</Text>
          {storeName && (
            <Text style={styles.storeNameText}>{storeName}</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.scannerContainer}>
        <Text style={styles.scannerTitle}>{t('receive_devices.scan_title', { defaultValue: 'Scan Device QR Code' })}</Text>
        <Text style={styles.scannerSubtitle}>{t('receive_devices.scan_subtitle', { defaultValue: 'Align QR code inside the frame' })}</Text>

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

        <Text style={styles.scannerNote}>
          {t('receive_devices.scan_note', { defaultValue: 'Both QR codes and barcodes supported' })}
        </Text>
      </View>

      {devicesList.length > 0 && (
        <View style={styles.devicesSection}>
          <View style={styles.devicesHeader}>
            <Text style={styles.devicesTitle}>
              {t('receive_devices.devices_to_receive', { defaultValue: 'Devices to Receive' })} ({devicesList.length})
            </Text>
            <TouchableOpacity onPress={clearAllDevices} disabled={submitting}>
              <Text style={styles.clearAllText}>{t('receive_devices.clear_all', { defaultValue: 'Clear All' })}</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={devicesList}
            keyExtractor={(item, index) => `${item.serialNumber}-${index}`}
            renderItem={renderDeviceItem}
            scrollEnabled={false}
            contentContainerStyle={styles.devicesList}
          />
        </View>
      )}

      {devicesList.length > 0 && (
        <TouchableOpacity
          style={[
            styles.submitButton,
            (devicesList.length === 0 || !storeId || submitting) && styles.submitButtonDisabled
          ]}
          onPress={submitDevices}
          disabled={devicesList.length === 0 || !storeId || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.submitButtonText}>
              {t('receive_devices.submit_button', { defaultValue: 'Submit {{count}} Device', count: devicesList.length }).replace('{{count}}', devicesList.length.toString())}{devicesList.length !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>
      )}

      <Modal
        visible={showDropdown}
        transparent={true}
        animationType="slide"
        onRequestClose={cancelAddDevice}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('receive_devices.modal.title', { defaultValue: 'Select Device Condition' })}</Text>
            <Text style={styles.modalSubtitle}>
              {t('receive_devices.modal.serial_label', { defaultValue: 'Serial' })}: {pendingSerialNumber}
            </Text>

            <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
              {conditionOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.conditionOption,
                    selectedCondition?.id === option.id && styles.conditionOptionSelected
                  ]}
                  onPress={() => handleConditionSelect(option)}
                >
                  <Text style={[
                    styles.conditionOptionText,
                    selectedCondition?.id === option.id && styles.conditionOptionTextSelected
                  ]}>
                    {option.label}
                  </Text>
                  {selectedCondition?.id === option.id && (
                    <Text style={styles.checkMark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelModalButton} onPress={cancelAddDevice}>
                <Text style={styles.cancelModalButtonText}>{t('receive_devices.modal.cancel', { defaultValue: 'Cancel' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmModalButton,
                  !selectedCondition && styles.confirmModalButtonDisabled
                ]}
                onPress={confirmAddDevice}
                disabled={!selectedCondition}
              >
                <Text style={styles.confirmModalButtonText}>{t('receive_devices.modal.add_device', { defaultValue: 'Add Device' })}</Text>
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
  storeNameText: {
    fontSize: 12,
    color: '#FFD700',
    marginTop: 2,
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
    maxHeight: '70%',
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
    color: '#000000',
    textAlign: 'center',
    marginBottom: 20,
  },
  optionsContainer: {
    maxHeight: 300,
    color: '#000000'
  },
  conditionOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  conditionOptionSelected: {
    backgroundColor: '#FFD70020',
  },
  conditionOptionText: {
    fontSize: 16,
    color: '#000000',
  },
  conditionOptionTextSelected: {
    color: '#000000',
    fontWeight: '600',
  },
  checkMark: {
    fontSize: 18,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 10,
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
  confirmModalButtonDisabled: {
    backgroundColor: '#555',
  },
  confirmModalButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '700',
  },
});

export default ReceiveDevicesScreen;
import React, { useState, useEffect } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialIcons'; // ✅ FIXED: Integrated native vector arrows & icons for system consistency
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.70;
const API_BASE = 'https://demo2.bsl.co.ke';

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
  const [isLoading, setIsLoading] = useState(false);

  // Dropdown states
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [pendingSerialNumber, setPendingSerialNumber] = useState(null);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingReceives, setPendingReceives] = useState([]);

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

  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in ReceiveDevicesScreen');
    });
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
              text: t('receive_devices.back_online', { defaultValue: 'Back online! Syncing data...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            processPendingReceives();
          } else {
            Snackbar.show({
              text: t('receive_devices.offline_mode', { defaultValue: 'Offline mode - Devices will be saved locally' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        await loadPendingReceives();
      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      OfflineSyncService.stopAutoSync();
      NetworkMonitorService.cleanup();
    };
  }, []);

  const saveReceiveOffline = async (storeIdValue, devices) => {
    try {
      const offlineReceive = {
        id: Date.now(),
        storeId: storeIdValue,
        devices: devices,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'PENDING'
      };

      const existingReceives = await OfflineDatabaseService.getUserData('pending_device_receives') || [];
      existingReceives.push(offlineReceive);
      await OfflineDatabaseService.saveUserData('pending_device_receives', existingReceives);
      setPendingReceives(existingReceives);

      await OfflineDatabaseService.addToSyncQueue('RECEIVE_DEVICES', '/api/v1/store-stock/receive-devices', {
        storeId: storeIdValue,
        devices: devices
      });

      return true;
    } catch (error) {
      console.error('Error saving receive batch offline:', error);
      return false;
    }
  };

  const loadPendingReceives = async () => {
    try {
      const pending = await OfflineDatabaseService.getUserData('pending_device_receives');
      if (pending && pending.length > 0) {
        setPendingReceives(pending);
      }
    } catch (error) {
      console.error('Error loading pending receives:', error);
    }
  };

  const processPendingReceives = async () => {
    if (!isOnline) return;

    const pending = await OfflineDatabaseService.getUserData('pending_device_receives');
    if (!pending || pending.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    for (const receive of pending) {
      try {
        const requestBody = {
          storeId: receive.storeId,
          devices: receive.devices
        };

        const response = await authenticatedAxios(
          'post',
          {
            url: `${API_BASE}/api/v1/store-stock/receive-devices`,
            data: requestBody,
            headers: { 'Content-Type': 'application/json' },
          },
          i18n
        );

        if (response.status === 200 || response.status === 201) {
          successCount += response.data.successfulDeviceIds?.length || 0;
        } else {
          failCount += receive.devices.length;
        }
      } catch (error) {
        failCount += receive.devices.length;
      }
    }

    await OfflineDatabaseService.saveUserData('pending_device_receives', []);
    setPendingReceives([]);

    if (successCount > 0) {
      Snackbar.show({
        text: t('receive_devices.synced_receives', { defaultValue: 'Synced {{count}} device(s) successfully', count: successCount }).replace('{{count}}', successCount.toString()),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    }

    if (failCount > 0) {
      Snackbar.show({
        text: t('receive_devices.sync_partial_failed', { defaultValue: '{{count}} device(s) failed to sync', count: failCount }).replace('{{count}}', failCount.toString()),
        duration: 3000,
        backgroundColor: '#FF9800',
      });
    }
  };

  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('receive_devices.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await processPendingReceives();
      Snackbar.show({
        text: t('receive_devices.sync_complete', { defaultValue: 'Sync completed successfully!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('receive_devices.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadStoreData();
  }, []);

  const loadStoreData = async () => {
    try {
      const paramsStoreId = route.params?.storeId;
      const paramsStoreName = route.params?.storeName;

      if (paramsStoreId) {
        setStoreId(paramsStoreId.toString());
        if (paramsStoreName) setStoreName(paramsStoreName);
      } else {
        const storedStoreId = await AsyncStorage.getItem('storeId');
        const storedStoreName = await AsyncStorage.getItem('storeName');

        if (storedStoreId) {
          setStoreId(storedStoreId);
          setStoreName(storedStoreName || 'Store');
        } else {
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
      return parts[parts.length - 1];
    }
    return scannedValue;
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value || isLoading) return;

    const deviceCode = value.trim();
    const serialNumber = extractSerialNumber(deviceCode);

    if (!/^\d+$/.test(serialNumber)) {
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
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      const saved = await saveReceiveOffline(parseInt(storeId, 10), devicesList);
      if (saved) {
        Snackbar.show({
          text: t('receive_devices.success.saved_offline', { defaultValue: '{{count}} device(s) saved offline. Will submit when online.', count: devicesList.length }).replace('{{count}}', devicesList.length.toString()),
          duration: 4000,
          backgroundColor: '#FF9800',
        });
        setDevicesList([]);
      } else {
        Snackbar.show({
          text: t('receive_devices.errors.save_offline_failed', { defaultValue: 'Failed to save devices offline' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      setSubmitting(false);
      return;
    }

    try {
      const requestBody = {
        storeId: parseInt(storeId, 10),
        devices: devicesList
      };

      const response = await authenticatedAxios(
        'post',
        {
          url: `${API_BASE}/api/v1/store-stock/receive-devices`,
          data: requestBody,
          headers: { 'Content-Type': 'application/json' },
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
        Alert.alert(
          t('receive_devices.alert.partial_success', { defaultValue: 'Partial Success' }),
          t('receive_devices.alert.partial_success_message', { defaultValue: 'Some devices failed:\n{{errors}}', errors: data.errors.join('\n') }).replace('{{errors}}', data.errors.join('\n'))
        );
      }

      if (successCount > 0) setDevicesList([]);

    } catch (error) {
      console.error('Error submitting devices:', error);
      const isNetworkError = error.message?.includes('network') || error.message?.includes('offline') || error.code === 'ERR_NETWORK';

      if (isNetworkError && !online) {
        const saved = await saveReceiveOffline(parseInt(storeId, 10), devicesList);
        if (saved) {
          Snackbar.show({
            text: t('receive_devices.success.saved_offline', { defaultValue: '{{count}} device(s) saved offline. Will submit when online.', count: devicesList.length }).replace('{{count}}', devicesList.length.toString()),
            duration: 4000,
            backgroundColor: '#FF9800',
          });
          setDevicesList([]);
        }
      } else if (error.response?.status === 401) {
        Snackbar.show({
          text: t('receive_devices.errors.session_expired', { defaultValue: 'Session expired. Please log in again.' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        navigation.replace('Login');
        return;
      } else {
        Snackbar.show({
          text: error.response?.data?.message || error.message || t('receive_devices.errors.submit_failed', { defaultValue: 'Failed to submit devices. Please try again.' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderDeviceItem = ({ item, index }) => (
    <Animatable.View animation="fadeInLeft" delay={index * 50} style={styles.deviceCard}>
      <View style={styles.deviceCardLeft}>
        <View style={styles.deviceIconWrapper}>
          <Icon name="router" size={18} color="#FFA500" />
        </View>
        <View style={styles.deviceInfoTextContainer}>
          <Text style={styles.deviceSerial}>{item.serialNumber}</Text>
          <Text style={styles.conditionLabelText}>
            {conditionOptions.find(opt => opt.id === item.deviceConditionId)?.label || t('receive_devices.unknown', { defaultValue: 'Unknown' })}
          </Text>
        </View>
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={() => removeDevice(index)} style={styles.removeButton}>
        <Icon name="close" size={16} color="#FF6B6B" />
      </TouchableOpacity>
    </Animatable.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Styled App Header Section Component Group */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                      <Icon name="arrow-back" size={24} color="#1A1A1A" />
                    </TouchableOpacity>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>{t('receive_devices.title', { defaultValue: 'Receive Devices' })}</Text>
            {storeName && <Text style={styles.storeNameText}>{storeName}</Text>}
          </View>
          <View style={styles.headerRightActions}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#FFA500" />
            ) : (
              <TouchableOpacity activeOpacity={0.7} onPress={manualSync} style={styles.syncButton}>
                <Icon name="sync" size={22} color="#495057" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Offline Alert Context Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Devices will be saved locally</Text>
        </View>
      )}

      {/* Pending Batch Synchronization Action Box */}
      {pendingReceives.length > 0 && isOnline && (
        <TouchableOpacity activeOpacity={0.9} style={styles.pendingBanner} onPress={processPendingReceives}>
          <Text style={styles.pendingBannerText}>
            ⏳ {pendingReceives.reduce((sum, r) => sum + r.devices.length, 0)} pending device(s) to sync. Tap to sync now.
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {showScanner && (
          <View style={styles.scannerCard}>
            <Text style={styles.scannerTitle}>{t('receive_devices.scan_title', { defaultValue: 'Scan Device QR Code' })}</Text>
            <Text style={styles.scannerSubtitle}>{t('receive_devices.scan_subtitle', { defaultValue: 'Align QR code inside the frame' })}</Text>

            <View style={styles.cameraWrapper}>
              <View style={styles.cameraFrame}>
                <Camera
                  style={StyleSheet.absoluteFillObject}
                  scanBarcode={true}
                  onReadCode={onReadCode}
                  showFrame={false}
                />
                {/* Custom Vector Targeting Overlay Frame Brackets */}
                <View style={styles.overlayContainer}>
                  <View style={[styles.bracket, styles.topLeftBracket]} />
                  <View style={[styles.bracket, styles.topRightBracket]} />
                  <View style={[styles.bracket, styles.bottomLeftBracket]} />
                  <View style={[styles.bracket, styles.bottomRightBracket]} />
                </View>
              </View>
            </View>

            <Text style={styles.scannerNote}>
              {t('receive_devices.scan_note', { defaultValue: 'Both QR codes and barcodes supported' })}
            </Text>
          </View>
        )}

        {/* Dynamic Registered Items Stack Section */}
        {devicesList.length > 0 && (
          <View style={styles.devicesSection}>
            <View style={styles.devicesHeader}>
              <Text style={styles.devicesTitle}>
                {t('receive_devices.devices_to_receive', { defaultValue: 'Devices to Receive' })} ({devicesList.length})
              </Text>
              <TouchableOpacity activeOpacity={0.7} onPress={clearAllDevices} disabled={submitting}>
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
      </ScrollView>

      {/* Main Bottom Footer Allocation Submit Panel */}
      {devicesList.length > 0 && (
        <View style={styles.bottomFooterPanel}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.submitButton,
              (devicesList.length === 0 || !storeId || submitting) && styles.submitButtonDisabled
            ]}
            onPress={submitDevices}
            disabled={devicesList.length === 0 || !storeId || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {!isOnline ? t('receive_devices.save_offline_button', { defaultValue: 'Save {{count}} Device', count: devicesList.length }).replace('{{count}}', devicesList.length.toString()) :
                  t('receive_devices.submit_button', { defaultValue: 'Submit {{count}} Device', count: devicesList.length }).replace('{{count}}', devicesList.length.toString())}
                {devicesList.length !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Structural Input Verification Overlay Sheet */}
      <Modal
        visible={showDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelAddDevice}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={250} style={styles.modalContent}>
            <View style={styles.modalHeaderBlock}>
              <Text style={styles.modalTitle}>{t('receive_devices.modal.title', { defaultValue: 'Select Device Condition' })}</Text>
              <View style={styles.modalSerialChip}>
                <Icon name="tag" size={14} color="#666" style={{ marginRight: 4 }} />
                <Text style={styles.modalSubtitle}>
                  {t('receive_devices.modal.serial_label', { defaultValue: 'Serial' })}: {pendingSerialNumber}
                </Text>
              </View>
            </View>

            <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
              {conditionOptions.map((option) => (
                <TouchableOpacity
                  activeOpacity={0.7}
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
                    <Icon name="check-circle" size={20} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity activeOpacity={0.7} style={styles.cancelModalButton} onPress={cancelAddDevice}>
                <Text style={styles.cancelModalButtonText}>{t('receive_devices.modal.cancel', { defaultValue: 'Cancel' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
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
  headerTitleRow: {
     flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 50,
    paddingBottom: 12,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  storeNameText: {
    fontSize: 12,
    color: '#FFA500',
    marginTop: 3,
    fontWeight: '600',
  },
  headerRightActions: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButton: {
    padding: 6,
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  pendingBanner: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  pendingBannerText: {
    color: '#E65100',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
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
  scannerTitle: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  scannerSubtitle: {
    color: '#666666',
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
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
  devicesSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 12,
  },
  devicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  devicesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  clearAllText: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  devicesList: {
    gap: 10,
  },
  deviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  deviceCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceInfoTextContainer: {
    flex: 1,
  },
  deviceSerial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  conditionLabelText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
    fontWeight: '500',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFEEF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomFooterPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: '#EAEAEA',
  },
  submitButton: {
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
  submitButtonDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '80%',
  },
  modalHeaderBlock: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  modalSerialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#495057',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  optionsContainer: {
    marginVertical: 10,
  },
  conditionOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  conditionOptionSelected: {
    backgroundColor: '#E8F5E8',
    borderColor: '#C8E6C9',
  },
  conditionOptionText: {
    fontSize: 15,
    color: '#495057',
    fontWeight: '500',
  },
  conditionOptionTextSelected: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelModalButton: {
    flex: 1,
    backgroundColor: '#F1F3F5',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelModalButtonText: {
    color: '#495057',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmModalButton: {
    flex: 1,
    backgroundColor: '#FFA500',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  confirmModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default ReceiveDevicesScreen;
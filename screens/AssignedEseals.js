import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  ScrollView,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const { width } = Dimensions.get('window');

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

const AssignedEseals = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [devices, setDevices] = useState([]);
  const [filteredDevices, setFilteredDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'online', 'offline'
  const [warrantyFilter, setWarrantyFilter] = useState('all'); // 'all', 'active', 'expired'
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [availableCount, setAvailableCount] = useState(0);

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in AssignedEseals');
    });
    return () => removeListener();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDevices();
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => false);
      return () => backHandler.remove();
    }, [])
  );

  useEffect(() => {
    filterDevices();
  }, [devices, searchQuery, statusFilter, warrantyFilter]);

  const fetchDevices = async () => {
    try {
      setLoading(true);

      // ✅ FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/rru-inventory/my-stock`,
        },
        i18n
      );

      if (response.data) {
        setDevices(response.data.devices || []);
        setAvailableCount(response.data.availableCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      Snackbar.show({
        text: t('assigned_eseals.errors.load_failed', { defaultValue: 'Failed to load assigned eseals' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevices();
  };

  const filterDevices = () => {
    let filtered = [...devices];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (device) =>
          device.name?.toLowerCase().includes(query) ||
          device.serialNo?.toLowerCase().includes(query) ||
          device.groupName?.toLowerCase().includes(query)
      );
    }

    // Apply status filter (online/offline)
    if (statusFilter !== 'all') {
      filtered = filtered.filter((device) =>
        statusFilter === 'online' ? device.isOnline : !device.isOnline
      );
    }

    // Apply warranty filter
    if (warrantyFilter !== 'all') {
      filtered = filtered.filter((device) =>
        warrantyFilter === 'active'
          ? device.warrantyStatus === 'Active'
          : device.warrantyStatus !== 'Active'
      );
    }

    setFilteredDevices(filtered);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setWarrantyFilter('all');
  };

  const renderDeviceCard = ({ item }) => {
    const statusColor = item.isOnline ? '#4CAF50' : '#9E9E9E';
    const statusText = item.isOnline
      ? t('assigned_eseals.status.online', { defaultValue: 'Online' })
      : t('assigned_eseals.status.offline', { defaultValue: 'Offline' });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.card}
        onPress={() => {
          setSelectedDevice(item);
          setModalVisible(true);
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.deviceInfo}>
            <Icon name="devices" size={24} color="#FFA500" />
            <Text style={styles.deviceName}>{item.name || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Icon name="confirmation-number" size={16} color="#666" />
            <Text style={styles.detailText}>{t('assigned_eseals.serial_label', { defaultValue: 'Serial' })}: {item.serialNo || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="group" size={16} color="#666" />
            <Text style={styles.detailText}>{t('assigned_eseals.group_label', { defaultValue: 'Group' })}: {item.groupName || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="security" size={16} color="#666" />
            <Text style={styles.detailText}>
              {t('assigned_eseals.warranty_label', { defaultValue: 'Warranty' })}: {item.warrantyStatus || t('assigned_eseals.na', { defaultValue: 'N/A' })} ({item.warrantyStartDate} - {item.warrantyEndDate})
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {/* Status Chips */}
        <TouchableOpacity
          style={[styles.filterChip, statusFilter === 'all' && styles.activeFilter]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={[styles.filterText, statusFilter === 'all' && styles.activeFilterText]}>
            {t('assigned_eseals.filters.all', { defaultValue: 'All' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, statusFilter === 'online' && styles.activeFilter]}
          onPress={() => setStatusFilter('online')}
        >
          <Icon name="wifi" size={16} color={statusFilter === 'online' ? '#FFA500' : '#666'} />
          <Text style={[styles.filterText, statusFilter === 'online' && styles.activeFilterText]}>
            {t('assigned_eseals.filters.online', { defaultValue: 'Online' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, statusFilter === 'offline' && styles.activeFilter]}
          onPress={() => setStatusFilter('offline')}
        >
          <Icon name="wifi-off" size={16} color={statusFilter === 'offline' ? '#FFA500' : '#666'} />
          <Text style={[styles.filterText, statusFilter === 'offline' && styles.activeFilterText]}>
            {t('assigned_eseals.filters.offline', { defaultValue: 'Offline' })}
          </Text>
        </TouchableOpacity>

        {/* Warranty Chips */}
        <TouchableOpacity
          style={[styles.filterChip, warrantyFilter === 'active' && styles.activeFilter]}
          onPress={() => setWarrantyFilter('active')}
        >
          <Icon name="verified" size={16} color={warrantyFilter === 'active' ? '#FFA500' : '#666'} />
          <Text style={[styles.filterText, warrantyFilter === 'active' && styles.activeFilterText]}>
            {t('assigned_eseals.filters.warranty_active', { defaultValue: 'Warranty Active' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, warrantyFilter === 'expired' && styles.activeFilter]}
          onPress={() => setWarrantyFilter('expired')}
        >
          <Icon name="warning" size={16} color={warrantyFilter === 'expired' ? '#FFA500' : '#666'} />
          <Text style={[styles.filterText, warrantyFilter === 'expired' && styles.activeFilterText]}>
            {t('assigned_eseals.filters.warranty_expired', { defaultValue: 'Warranty Expired' })}
          </Text>
        </TouchableOpacity>

        {/* Clear filters button */}
        <TouchableOpacity style={styles.clearChip} onPress={clearFilters}>
          <Icon name="clear" size={16} color="#FFA500" />
          <Text style={styles.clearText}>{t('assigned_eseals.filters.clear', { defaultValue: 'Clear' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('assigned_eseals.title', { defaultValue: 'Assigned E-Seals' })}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.statsCard}>
        <Icon name="inventory" size={24} color="#FFA500" />
        <Text style={styles.statsText}>
          {t('assigned_eseals.available_count', { defaultValue: 'Available Count' })}: {availableCount}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('assigned_eseals.search_placeholder', { defaultValue: 'Search by name or serial' })}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {renderFilters()}
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('assigned_eseals.loading', { defaultValue: 'Loading assigned eseals...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <FlatList
        data={filteredDevices}
        keyExtractor={(item) => item.deviceId.toString()}
        renderItem={renderDeviceCard}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFA500" />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        numColumns={width > 768 ? 2 : 1}
        columnWrapperStyle={width > 768 ? styles.row : null}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="devices-off" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>{t('assigned_eseals.empty.title', { defaultValue: 'No devices found' })}</Text>
            <Text style={styles.emptyText}>
              {searchQuery || statusFilter !== 'all' || warrantyFilter !== 'all'
                ? t('assigned_eseals.empty.adjust_filters', { defaultValue: 'Try adjusting your filters' })
                : t('assigned_eseals.empty.no_devices', { defaultValue: 'No assigned eseals available' })}
            </Text>
          </View>
        }
      />

      {/* Device Details Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('assigned_eseals.modal.title', { defaultValue: 'Device Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            {selectedDevice && (
              <>
                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.device_name', { defaultValue: 'Device Name' })}:</Text>
                    <Text style={styles.modalValue}>{selectedDevice.name || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.serial_number', { defaultValue: 'Serial Number' })}:</Text>
                    <Text style={styles.modalValue}>{selectedDevice.serialNo || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.imei', { defaultValue: 'IMEI' })}:</Text>
                    <Text style={styles.modalValue}>{selectedDevice.imei || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.model', { defaultValue: 'Model' })}:</Text>
                    <Text style={styles.modalValue}>
                      {selectedDevice.make} {selectedDevice.model}
                    </Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.year_of_manufacture', { defaultValue: 'Year of Manufacture' })}:</Text>
                    <Text style={styles.modalValue}>{selectedDevice.yearOfManufacture || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.group', { defaultValue: 'Group' })}:</Text>
                    <Text style={styles.modalValue}>{selectedDevice.groupName || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.firmware_version', { defaultValue: 'Firmware Version' })}:</Text>
                    <Text style={styles.modalValue}>{selectedDevice.firmwareVersion || t('assigned_eseals.na', { defaultValue: 'N/A' })}</Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.warranty', { defaultValue: 'Warranty' })}:</Text>
                    <Text style={styles.modalValue}>
                      {selectedDevice.warrantyStatus || t('assigned_eseals.na', { defaultValue: 'N/A' })} ({selectedDevice.warrantyStartDate} - {selectedDevice.warrantyEndDate})
                    </Text>
                  </View>
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>{t('assigned_eseals.modal.status', { defaultValue: 'Status' })}:</Text>
                    <Text style={[styles.modalValue, { color: selectedDevice.isOnline ? '#4CAF50' : '#9E9E9E' }]}>
                      {selectedDevice.isOnline
                        ? t('assigned_eseals.status.online', { defaultValue: 'Online' })
                        : t('assigned_eseals.status.offline', { defaultValue: 'Offline' })}
                    </Text>
                  </View>
                </ScrollView>
                <TouchableOpacity style={styles.closeModalButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeModalButtonText}>{t('assigned_eseals.modal.close', { defaultValue: 'Close' })}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
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
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0A3',
    gap: 10,
  },
  statsText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#B76E00',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
    paddingVertical: 8,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 40,
    backgroundColor: '#F5F5F5',
    marginRight: 12,
    gap: 6,
  },
  activeFilter: {
    backgroundColor: '#FFA50020',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  activeFilterText: {
    color: '#FFA500',
  },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 40,
    backgroundColor: '#F5F5F5',
    marginRight: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  clearText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFA500',
  },
  listContent: {
    paddingBottom: 20,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1F36',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 20,
  },
  modalDetailRow: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
  },
  modalValue: {
    fontSize: 14,
    color: '#333',
  },
  closeModalButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 20,
  },
  closeModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default AssignedEseals;
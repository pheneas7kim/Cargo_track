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
  Platform,
  BackHandler,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons'; 
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');

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
      const newToken = await refreshAccessToken();
      if (newToken) {
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

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in AssignedEseals');
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
              text: t('assigned_eseals.online', { defaultValue: 'Back online! Syncing data...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            fetchDevices();
          } else {
            Snackbar.show({
              text: t('assigned_eseals.offline', { defaultValue: 'Offline mode - using cached data' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        await fetchDevices();
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
      const response = await authenticatedAxios(
        'get',
        { url: `${serverUrl}/rru-inventory/my-stock` },
        i18n
      );

      if (response.data) {
        setDevices(response.data.devices || []);
        setAvailableCount(response.data.availableCount || 0);

        await OfflineDatabaseService.saveUserData('assigned_eseals_devices', {
          devices: response.data.devices || [],
          availableCount: response.data.availableCount || 0,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      const cachedData = await OfflineDatabaseService.getUserData('assigned_eseals_devices');
      if (cachedData && cachedData.devices && cachedData.devices.length > 0) {
        setDevices(cachedData.devices);
        setAvailableCount(cachedData.availableCount || 0);
        Snackbar.show({
          text: t('assigned_eseals.using_cached', { defaultValue: 'Using cached data (offline mode)' }),
          duration: 3000,
          backgroundColor: '#FF9800',
        });
      } else {
        Snackbar.show({
          text: t('assigned_eseals.errors.load_failed', { defaultValue: 'Failed to load assigned eseals' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (isOnline) {
      manualSync();
    } else {
      fetchDevices();
    }
  };

  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('assigned_eseals.errors.offline_sync', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await fetchDevices();
      Snackbar.show({
        text: t('assigned_eseals.success.sync_complete', { defaultValue: 'Sync completed successfully!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('assigned_eseals.errors.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const filterDevices = () => {
    let filtered = [...devices];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (device) =>
          device.name?.toLowerCase().includes(query) ||
          device.serialNo?.toLowerCase().includes(query) ||
          device.groupName?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((device) =>
        statusFilter === 'online' ? device.isOnline : !device.isOnline
      );
    }

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
    const statusColor = item.isOnline ? '#2E7D32' : '#757575';
    const statusBg = item.isOnline ? '#E8F5E9' : '#F5F5F5';
    const statusText = item.isOnline
      ? t('assigned_eseals.status.online', { defaultValue: 'Online' })
      : t('assigned_eseals.status.offline', { defaultValue: 'Offline' });

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.card}
        onPress={() => {
          setSelectedDevice(item);
          setModalVisible(true);
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.deviceInfo}>
            <View style={styles.iconContainer}>
              <Icon name="security" size={20} color="#FFA500" />
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {item.name || t('assigned_eseals.na', { defaultValue: 'Unnamed E-Seal' })}
              </Text>
              <Text style={styles.serialSubtitle}>SN: {item.serialNo || '—'}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.dividerLine} />

        <View style={styles.cardDetails}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>{t('assigned_eseals.group_label', { defaultValue: 'Assignment Group' })}</Text>
            <Text style={styles.detailValue} numberOfLines={1}>{item.groupName || '—'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>{t('assigned_eseals.warranty_label', { defaultValue: 'Warranty Status' })}</Text>
            <Text style={[styles.detailValue, item.warrantyStatus === 'Active' ? styles.activeWarranty : null]}>
              {item.warrantyStatus || '—'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Styled Top App Bar Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerTextGroup}>
            <Text style={styles.mainTitle}>{t('assigned_eseals.title', { defaultValue: 'My Assigned E-Seals' })}</Text>
            <Text style={styles.subTitleText}>{t('assigned_eseals.subtitle', { defaultValue: 'Manage active inventory allocation' })}</Text>
          </View>
          {isOnline && (
            <TouchableOpacity onPress={manualSync} disabled={isSyncing} style={styles.syncIconButton}>
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFA500" />
              ) : (
                <Icon name="sync" size={22} color="#495057" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Dynamic Metric Counter Widget */}
        <View style={styles.metricsBar}>
          <View style={styles.metricItem}>
            <Text style={styles.metricCount}>{availableCount}</Text>
            <Text style={styles.metricLabel}>{t('assigned_eseals.available', { defaultValue: 'Available Stock' })}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricCount}>{filteredDevices.length}</Text>
            <Text style={styles.metricLabel}>{t('assigned_eseals.displayed', { defaultValue: 'Filtered Units' })}</Text>
          </View>
        </View>
      </View>

      {/* Connectivity Alert Ribbon */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode — Serving Cached Records</Text>
        </View>
      )}

      {/* Filter Options Control Deck Panel */}
      <View style={styles.filterDeck}>
        <View style={styles.searchBarContainer}>
          <Icon name="search" size={20} color="#A0A0A0" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('assigned_eseals.search_placeholder', { defaultValue: 'Search by serial, group, name...' })}
            placeholderTextColor="#A0A0A0"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Custom Pill Selector Rows */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScrollContainer}>
          <TouchableOpacity 
            style={[styles.filterPill, statusFilter === 'all' && styles.activePill]} 
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.pillText, statusFilter === 'all' && styles.activePillText]}>All Status</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterPill, statusFilter === 'online' && styles.activePill]} 
            onPress={() => setStatusFilter('online')}
          >
            <Text style={[styles.pillText, statusFilter === 'online' && styles.activePillText]}>Online</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterPill, statusFilter === 'offline' && styles.activePill]} 
            onPress={() => setStatusFilter('offline')}
          >
            <Text style={[styles.pillText, statusFilter === 'offline' && styles.activePillText]}>Offline</Text>
          </TouchableOpacity>

          <View style={styles.pillsDivider} />

          <TouchableOpacity 
            style={[styles.filterPill, warrantyFilter === 'all' && styles.activePill]} 
            onPress={() => setWarrantyFilter('all')}
          >
            <Text style={[styles.pillText, warrantyFilter === 'all' && styles.activePillText]}>All Warranty</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterPill, warrantyFilter === 'active' && styles.activePill]} 
            onPress={() => setWarrantyFilter('active')}
          >
            <Text style={[styles.pillText, warrantyFilter === 'active' && styles.activePillText]}>Active Only</Text>
          </TouchableOpacity>
          
          {(searchQuery || statusFilter !== 'all' || warrantyFilter !== 'all') && (
            <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
              <Icon name="clear-all" size={16} color="#FF6B6B" />
              <Text style={styles.clearFiltersText}>Reset</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Main Stock Inventory Core List rendering interface view */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>Synchronizing local store data...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDevices}
          renderItem={renderDeviceCard}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FFA500']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="inventory" size={48} color="#D0D0D0" />
              <Text style={styles.emptyTitle}>No Matching E-Seals Found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search query parameters or filters</Text>
            </View>
          }
        />
      )}
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
    paddingVertical: 6,
    paddingRight: 14,
  },
  headerTextGroup: {
    flex: 1,
  },
  mainTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  subTitleText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  syncIconButton: {
    padding: 6,
  },
  metricsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#EAEAEA',
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  filterDeck: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    marginHorizontal: 20,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#1A1A1A',
    fontSize: 14,
    paddingVertical: 0,
  },
  pillsScrollContainer: {
    paddingHorizontal: 20,
    alignItems: 'center',
    paddingTop: 12,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F3F5',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activePill: {
    backgroundColor: '#FFA500',
    borderColor: '#FFA500',
  },
  pillText: {
    fontSize: 12,
    color: '#495057',
    fontWeight: '500',
  },
  activePillText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pillsDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#EAEAEA',
    marginHorizontal: 4,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  clearFiltersText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FFF8F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFEAD2',
  },
  nameBlock: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  serialSubtitle: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#F1F3F5',
    marginVertical: 12,
  },
  cardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 13,
    color: '#495057',
    fontWeight: '500',
  },
  activeWarranty: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666666',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 32,
  },
});

export default AssignedEseals;
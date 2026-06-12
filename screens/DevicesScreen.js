import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Animated,
  Alert
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import Icon from 'react-native-vector-icons/MaterialIcons';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');

const DevicesScreen = () => {
  const navigation = useNavigation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all, online, offline
  const [expandedId, setExpandedId] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Devices Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: 'Back online! Syncing data...',
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Auto-refresh when coming back online
            fetchDevices();
          } else {
            Snackbar.show({
              text: 'Offline mode - using cached devices',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load initial data
        await fetchDevices();
      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      // Cleanup
      OfflineSyncService.stopAutoSync();
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Cache devices data ==========
  const cacheDevicesData = async (devicesData) => {
    try {
      await OfflineDatabaseService.saveUserData('devices_list', {
        data: devicesData,
        timestamp: Date.now()
      });
      console.log('✅ Devices data cached offline');
    } catch (error) {
      console.error('Error caching devices data:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached devices ==========
  const loadCachedDevices = async () => {
    try {
      const cached = await OfflineDatabaseService.getUserData('devices_list');
      if (cached && cached.data && cached.data.length > 0) {
        setDevices(cached.data);
        console.log('📦 Loaded cached devices');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading cached devices:', error);
      return false;
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Manual sync function ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot sync while offline',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await fetchDevices(true);
      Snackbar.show({
        text: 'Sync completed successfully!',
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: 'Sync failed',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSyncing(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchDevices();

      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const fetchDevices = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        const hasCached = await loadCachedDevices();
        if (hasCached) {
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
      // ========== END OFFLINE CHECK ==========

      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        console.error('No token found');
        // ========== OFFLINE: Try to load cached even without token ==========
        await loadCachedDevices();
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const response = await axios.get(
        `${serverUrl}/devices/all`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data && Array.isArray(response.data)) {
        setDevices(response.data);
        // ========== OFFLINE: Cache fetched devices ==========
        await cacheDevicesData(response.data);
        // ========== END OFFLINE CACHE ==========
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);

      // ========== OFFLINE: Fallback to cached devices on error ==========
      const hasCached = await loadCachedDevices();
      if (!hasCached) {
        Snackbar.show({
          text: 'Failed to load devices',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      } else {
        Snackbar.show({
          text: 'Using cached devices (offline mode)',
          duration: 3000,
          backgroundColor: '#FF9800',
        });
      }
      // ========== END OFFLINE FALLBACK ==========
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // ========== OFFLINE: Manual sync on refresh ==========
    if (isOnline) {
      manualSync();
    } else {
      fetchDevices(true);
    }
    // ========== END OFFLINE MANUAL SYNC ==========
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getFilteredDevices = () => {
    let filtered = [...devices];

    // Apply online/offline filter
    if (filter === 'online') {
      filtered = filtered.filter(d => d.isOnline === true);
    } else if (filter === 'offline') {
      filtered = filtered.filter(d => d.isOnline === false);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.name?.toLowerCase().includes(query) ||
        d.serialNo?.toLowerCase().includes(query) ||
        d.imei?.toLowerCase().includes(query) ||
        d.model?.toLowerCase().includes(query) ||
        d.manufacturer?.name?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const getStats = () => {
    return {
      total: devices.length,
      online: devices.filter(d => d.isOnline === true).length,
      offline: devices.filter(d => d.isOnline === false).length,
    };
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderDevice = ({ item, index }) => {
    const isExpanded = expandedId === item.deviceId;
    const stats = getStats();

    return (
      <Animatable.View
        animation="fadeInUp"
        delay={index * 80}
        duration={400}
        style={styles.animationWrapper}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => toggleExpand(item.deviceId)}
          onLongPress={() => {
            setSelectedDevice(item);
            setModalVisible(true);
          }}
          delayLongPress={200}
        >
          <View style={[styles.deviceCard, item.isOnline && styles.onlineCard]}>
            <View style={styles.deviceHeader}>
              <View style={styles.deviceInfo}>
                <View style={[styles.statusIndicator, item.isOnline ? styles.online : styles.offline]} />
                <Text style={styles.deviceName}>{item.name || item.serialNo}</Text>
              </View>
              <View style={styles.badgeContainer}>
                {item.isOnline && (
                  <View style={styles.onlineBadge}>
                    <Text style={styles.onlineBadgeText}>ONLINE</Text>
                  </View>
                )}
                {!item.isOnline && (
                  <View style={styles.offlineBadge}>
                    <Text style={styles.offlineBadgeText}>OFFLINE</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.deviceDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Serial Number:</Text>
                <Text style={styles.detailValue}>{item.serialNo}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Model:</Text>
                <Text style={styles.detailValue}>{item.model || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>IMEI:</Text>
                <Text style={styles.detailValue}>{item.imei || 'N/A'}</Text>
              </View>
            </View>

            {isExpanded && (
              <Animatable.View animation="fadeIn" duration={300} style={styles.expandedContent}>
                <View style={styles.divider} />

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Manufacturer:</Text>
                  <Text style={styles.expandedValue}>{item.manufacturer?.name || 'N/A'}</Text>
                </View>

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Device Type:</Text>
                  <Text style={styles.expandedValue}>{item.deviceType?.name || 'N/A'}</Text>
                </View>

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>SIM 1:</Text>
                  <Text style={styles.expandedValue}>{item.sim1Number || 'N/A'}</Text>
                </View>

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>SIM 2:</Text>
                  <Text style={styles.expandedValue}>{item.sim2Number || 'N/A'}</Text>
                </View>

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Warranty:</Text>
                  <Text style={styles.expandedValue}>
                    {item.warrantyNumber ? `${item.warrantyNumber} (${item.warrantyPeriodMonths} months)` : 'N/A'}
                  </Text>
                </View>

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Firmware:</Text>
                  <Text style={styles.expandedValue}>{item.firmwareVersion || 'N/A'}</Text>
                </View>

                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Year:</Text>
                  <Text style={styles.expandedValue}>{item.yearOfManufacture || 'N/A'}</Text>
                </View>

                {item.notes && (
                  <View style={styles.expandedRow}>
                    <Text style={styles.expandedLabel}>Notes:</Text>
                    <Text style={styles.expandedValue}>{item.notes}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.viewDetailsButton}
                  onPress={() => {
                    setSelectedDevice(item);
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.viewDetailsButtonText}>View Full Details</Text>
                </TouchableOpacity>
              </Animatable.View>
            )}

            <View style={styles.expandIndicator}>
              <Text style={styles.expandIcon}>
                {isExpanded ? '▲ Less details' : '▼ More details'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderHeader = () => {
    const stats = getStats();

    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Devices</Text>
            <View style={styles.headerRightActions}>
              {/* ========== OFFLINE: Manual sync button ========== */}
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFA500" style={styles.syncIndicator} />
              ) : (
                <TouchableOpacity onPress={manualSync} style={styles.syncButton}>
                  <Icon name="sync" size={20} color={isOnline ? "#4CAF50" : "#999"} />
                </TouchableOpacity>
              )}
              {/* ========== END OFFLINE SYNC BUTTON ========== */}
              <View style={styles.placeholder} />
            </View>
          </View>

          {/* ========== OFFLINE: Network status banner ========== */}
          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached devices</Text>
            </View>
          )}
          {/* ========== END OFFLINE BANNER ========== */}

          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, serial, IMEI, model..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsContainer}
          >
            <TouchableOpacity
              style={[styles.statCard, filter === 'all' && styles.activeStatCard]}
              onPress={() => setFilter('all')}
            >
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>All Devices</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'online' && styles.activeStatCard]}
              onPress={() => setFilter('online')}
            >
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{stats.online}</Text>
              <Text style={styles.statLabel}>Online</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'offline' && styles.activeStatCard]}
              onPress={() => setFilter('offline')}
            >
              <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>{stats.offline}</Text>
              <Text style={styles.statLabel}>Offline</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Animated.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <FlatList
        data={getFilteredDevices()}
        keyExtractor={item => item.deviceId.toString()}
        renderItem={renderDevice}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFA500"
            colors={['#FFA500']}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Animatable.View animation="fadeIn" duration={500} style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📱</Text>
            <Text style={styles.emptyTitle}>No devices found</Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'Try adjusting your search'
                : filter !== 'all'
                ? `No ${filter} devices available`
                : 'No devices have been added yet'}
            </Text>
          </Animatable.View>
        }
      />

      {/* Device Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Device Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedDevice && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Status Header */}
                <View style={styles.modalStatusHeader}>
                  <View style={[styles.modalStatusIndicator, selectedDevice.isOnline ? styles.online : styles.offline]} />
                  <Text style={styles.modalStatusText}>
                    {selectedDevice.isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>

                {/* Device Name */}
                <Text style={styles.modalDeviceName}>{selectedDevice.name || selectedDevice.serialNo}</Text>

                {/* Basic Info Grid */}
                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Serial Number</Text>
                    <Text style={styles.infoValue}>{selectedDevice.serialNo}</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Model</Text>
                    <Text style={styles.infoValue}>{selectedDevice.model || 'N/A'}</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>IMEI</Text>
                    <Text style={styles.infoValue}>{selectedDevice.imei || 'N/A'}</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Year of Manufacture</Text>
                    <Text style={styles.infoValue}>{selectedDevice.yearOfManufacture || 'N/A'}</Text>
                  </View>
                </View>

                {/* Communication Info */}
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Communication</Text>
                  <View style={styles.communicationGrid}>
                    <View style={styles.communicationItem}>
                      <Text style={styles.communicationLabel}>SIM 1</Text>
                      <Text style={styles.communicationValue}>{selectedDevice.sim1Number || 'N/A'}</Text>
                    </View>
                    <View style={styles.communicationItem}>
                      <Text style={styles.communicationLabel}>SIM 2</Text>
                      <Text style={styles.communicationValue}>{selectedDevice.sim2Number || 'N/A'}</Text>
                    </View>
                    <View style={styles.communicationItem}>
                      <Text style={styles.communicationLabel}>Firmware</Text>
                      <Text style={styles.communicationValue}>{selectedDevice.firmwareVersion || 'N/A'}</Text>
                    </View>
                  </View>
                </View>

                {/* Warranty Info */}
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Warranty</Text>
                  <View style={styles.warrantyCard}>
                    <View style={styles.warrantyRow}>
                      <Text style={styles.warrantyLabel}>Warranty Number:</Text>
                      <Text style={styles.warrantyValue}>{selectedDevice.warrantyNumber || 'N/A'}</Text>
                    </View>
                    <View style={styles.warrantyRow}>
                      <Text style={styles.warrantyLabel}>Period:</Text>
                      <Text style={styles.warrantyValue}>
                        {selectedDevice.warrantyPeriodMonths ? `${selectedDevice.warrantyPeriodMonths} months` : 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Manufacturer & Type */}
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Manufacturer & Type</Text>
                  <View style={styles.manufacturerGrid}>
                    <View style={styles.manufacturerItem}>
                      <Text style={styles.manufacturerLabel}>Manufacturer</Text>
                      <Text style={styles.manufacturerValue}>{selectedDevice.manufacturer?.name || 'N/A'}</Text>
                      {selectedDevice.manufacturer?.code && (
                        <Text style={styles.manufacturerCode}>Code: {selectedDevice.manufacturer.code}</Text>
                      )}
                    </View>
                    <View style={styles.manufacturerItem}>
                      <Text style={styles.manufacturerLabel}>Device Type</Text>
                      <Text style={styles.manufacturerValue}>{selectedDevice.deviceType?.name || 'N/A'}</Text>
                      {selectedDevice.deviceType?.code && (
                        <Text style={styles.manufacturerCode}>Code: {selectedDevice.deviceType.code}</Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Notes */}
                {selectedDevice.notes && (
                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <View style={styles.notesCard}>
                      <Text style={styles.notesText}>{selectedDevice.notes}</Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeModalButtonText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
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
    paddingTop: 50,
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
  backButtonText: {
    fontSize: 28,
    color: '#1A1A1A',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  syncIndicator: {
    width: 40,
    height: 40,
  },
  placeholder: {
    width: 40,
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#999',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
  },
  clearIcon: {
    fontSize: 16,
    color: '#999',
    padding: 8,
  },
  statsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 100,
  },
  activeStatCard: {
    backgroundColor: '#FFA50010',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  listContent: {
    paddingBottom: 20,
  },
  animationWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  onlineCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  deviceHeader: {
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
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  online: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  offline: {
    backgroundColor: '#FF6B6B',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  badgeContainer: {
    flexDirection: 'row',
  },
  onlineBadge: {
    backgroundColor: '#4CAF5020',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onlineBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
  },
  offlineBadge: {
    backgroundColor: '#FF6B6B20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offlineBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  deviceDetails: {
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
    width: 90,
  },
  detailValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 12,
  },
  expandedRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  expandedLabel: {
    fontSize: 12,
    color: '#999',
    width: 100,
  },
  expandedValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  viewDetailsButton: {
    backgroundColor: '#FFA50010',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  viewDetailsButtonText: {
    fontSize: 12,
    color: '#FFA500',
    fontWeight: '500',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
  expandIcon: {
    fontSize: 11,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
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
    paddingHorizontal: 20,
    paddingVertical: 20,
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
  closeButtonText: {
    fontSize: 20,
    color: '#999',
    fontWeight: '300',
  },
  modalBody: {
    padding: 20,
  },
  modalStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  modalStatusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalDeviceName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  communicationGrid: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  communicationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  communicationLabel: {
    fontSize: 12,
    color: '#999',
  },
  communicationValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  warrantyCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  warrantyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warrantyLabel: {
    fontSize: 12,
    color: '#999',
  },
  warrantyValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  manufacturerGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  manufacturerItem: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
  },
  manufacturerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
  },
  manufacturerValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  manufacturerCode: {
    fontSize: 10,
    color: '#999',
  },
  notesCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
  },
  notesText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  closeModalButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  closeModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default DevicesScreen;
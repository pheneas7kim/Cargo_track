import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  ScrollView,
  TextInput,
  Animated,
  Platform,
  Alert,
  Image
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, getValidToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width, height } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = height * 0.65;
const BOTTOM_SHEET_MIN_HEIGHT = height * 0.15;


const DeviceMapScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [mapRegion, setMapRegion] = useState({
    latitude: -1.286389,
    longitude: 36.817223,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });
  const [selectedDeviceMarker, setSelectedDeviceMarker] = useState(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineDataAvailable, setOfflineDataAvailable] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  const mapRef = useRef(null);
  const intervalRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bottomSheetAnim = useRef(new Animated.Value(BOTTOM_SHEET_MIN_HEIGHT)).current;
  const searchBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(searchBarAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ✅ Listen for token refresh events to update headers
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed, updating axios headers');
      // Update axios default headers with new token
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    });

    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Device Map Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('device_map.back_online', { defaultValue: 'Back online! Syncing fleet data...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Auto-refresh when coming back online
            fetchDevices();
          } else {
            Snackbar.show({
              text: t('device_map.offline_mode', { defaultValue: 'Offline mode - Showing cached device locations' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load cached devices from offline database
        await loadCachedDevices();

        // Load last sync time
        const lastSync = await OfflineDatabaseService.getUserData('last_device_sync');
        if (lastSync) {
          setLastSyncTime(new Date(lastSync));
        }

      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      // Cleanup
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Load cached devices from offline database ==========
  const loadCachedDevices = async () => {
    try {
      const cachedDevices = await OfflineDatabaseService.getUserData('cached_devices');
      if (cachedDevices && cachedDevices.devices && cachedDevices.devices.length > 0) {
        setDevices(cachedDevices.devices);
        setOfflineDataAvailable(true);
        setLastUpdate(new Date(cachedDevices.timestamp));
        console.log(`📦 Loaded ${cachedDevices.devices.length} devices from offline cache`);

        // Fit map to cached markers
        if (cachedDevices.devices.length > 0 && mapRef.current && mapReady) {
          fitMapToMarkers(cachedDevices.devices);
        }
      }
    } catch (error) {
      console.error('Error loading cached devices:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED DEVICES ==========

  // ========== OFFLINE: Save devices to offline database ==========
  const saveDevicesToOfflineCache = async (devicesList) => {
    try {
      await OfflineDatabaseService.saveUserData('cached_devices', {
        devices: devicesList,
        timestamp: Date.now(),
        deviceCount: devicesList.length
      });
      console.log(`💾 Saved ${devicesList.length} devices to offline cache`);
      setOfflineDataAvailable(true);
    } catch (error) {
      console.error('Error saving devices to cache:', error);
    }
  };
  // ========== END OFFLINE SAVE TO CACHE ==========

  // Auto-refresh device locations every 30 seconds
  useEffect(() => {
    if (autoRefresh && isOnline) {
      intervalRef.current = setInterval(() => {
        fetchDevices(true);
      }, 30000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, isOnline]);

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

  const fetchDevices = async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) setLoading(true);

      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log('📴 Offline - using cached device data');
        await loadCachedDevices();
        if (!isAutoRefresh) {
          Snackbar.show({
            text: t('device_map.offline_data', { defaultValue: 'Offline - Showing cached device locations' }),
            duration: 3000,
            backgroundColor: '#FF9800',
          });
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }
      // ========== END OFFLINE CHECK ==========

      // ✅ Get valid token (will auto-refresh if expired)
      let token = await AsyncStorage.getItem('accessToken');
      const language = await AsyncStorage.getItem('userLanguage') || i18n.language || 'en';

      if (!token) {
        console.error('No token found');
        // Try to load from cache
        await loadCachedDevices();
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let response;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount < maxRetries) {
        try {
          response = await axios.get(
            `${serverUrl}/telemetry/latest-t1s`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept-Language': language,
              },
            }
          );
          break; // Success, exit retry loop
        } catch (error) {
          if (error.response?.status === 401 && retryCount === 0) {
            console.log('🔐 Token expired, attempting refresh...');
            const newToken = await refreshAccessToken();
            if (newToken) {
              token = newToken;
              retryCount++;
              continue; // Retry with new token
            }
          }
          throw error; // Re-throw if not recoverable
        }
      }

      if (response && response.data && Array.isArray(response.data)) {
        setDevices(response.data);
        setLastUpdate(new Date());
        setLastSyncTime(new Date());
        setOfflineDataAvailable(true);

        // ========== OFFLINE: Save to offline cache ==========
        await saveDevicesToOfflineCache(response.data);
        await OfflineDatabaseService.saveUserData('last_device_sync', Date.now());
        // ========== END OFFLINE SAVE ==========

        if (!selectedDeviceMarker && response.data.length > 0 && mapRef.current && mapReady) {
          fitMapToMarkers(response.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch device locations:', error);

      // ========== OFFLINE: Fall back to cached data on error ==========
      const cachedDevices = await OfflineDatabaseService.getUserData('cached_devices');
      if (cachedDevices && cachedDevices.devices && cachedDevices.devices.length > 0) {
        setDevices(cachedDevices.devices);
        setOfflineDataAvailable(true);
        if (!isAutoRefresh) {
          Snackbar.show({
            text: t('device_map.using_cached_data', { defaultValue: 'Using cached data (server unavailable)' }),
            duration: 3000,
            backgroundColor: '#FF9800',
          });
        }
      } else {
        // Only show error if not a 401 (already handled) and not auto-refresh
        if (error.response?.status !== 401 && !isAutoRefresh) {
          Snackbar.show({
            text: t('device_map.errors.load_failed', { defaultValue: 'Failed to load device locations' }),
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      }
      // ========== END OFFLINE FALLBACK ==========
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevices();
  };

  // ========== OFFLINE: Manual sync for device data ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('device_map.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setLoading(true);
    try {
      await fetchDevices(false);
      Snackbar.show({
        text: t('device_map.sync_complete', { defaultValue: 'Fleet data synchronized!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('device_map.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  const fitMapToMarkers = (devicesList) => {
    if (!devicesList || devicesList.length === 0) return;

    const validDevices = devicesList.filter(d => d.latitude && d.longitude);
    if (validDevices.length === 0) return;

    const latitudes = validDevices.map(d => parseFloat(d.latitude));
    const longitudes = validDevices.map(d => parseFloat(d.longitude));

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.1),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.1),
    };

    setMapRegion(region);
    if (mapRef.current && mapReady) {
      try {
        mapRef.current.animateToRegion(region, 1000);
      } catch (e) {
        console.warn('Failed to animate map:', e);
      }
    }
  };

  const centerOnDevice = (device) => {
    if (!device.latitude || !device.longitude) return;

    const region = {
      latitude: parseFloat(device.latitude),
      longitude: parseFloat(device.longitude),
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    setMapRegion(region);
    if (mapRef.current && mapReady) {
      try {
        mapRef.current.animateToRegion(region, 500);
      } catch (e) {
        console.warn('Failed to animate map:', e);
      }
    }
    setSelectedDeviceMarker(device);
    setBottomSheetVisible(true);
    Animated.spring(bottomSheetAnim, {
      toValue: BOTTOM_SHEET_MAX_HEIGHT,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  const closeBottomSheet = () => {
    Animated.spring(bottomSheetAnim, {
      toValue: BOTTOM_SHEET_MIN_HEIGHT,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start(() => setBottomSheetVisible(false));
  };

  const getFilteredDevices = () => {
    let filtered = [...devices];

    if (filter === 'moving') {
      filtered = filtered.filter(d => (d.speedKmh || 0) > 5);
    } else if (filter === 'stationary') {
      filtered = filtered.filter(d => (d.speedKmh || 0) <= 5);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.deviceName?.toLowerCase().includes(query) ||
        d.deviceSn?.toLowerCase().includes(query) ||
        d.t1Number?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const getStats = () => {
    const moving = devices.filter(d => (d.speedKmh || 0) > 5).length;
    const stationary = devices.filter(d => (d.speedKmh || 0) <= 5).length;
    return {
      total: devices.length,
      moving,
      stationary,
    };
  };

  const formatSpeed = (speed) => {
    if (!speed && speed !== 0) return t('device_map.na', { defaultValue: 'N/A' });
    return `${Math.round(speed)} km/h`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('device_map.na', { defaultValue: 'N/A' });
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 1) return t('device_map.time.just_now', { defaultValue: 'Just now' });
    if (diff < 60) return t('device_map.time.minutes_ago', { defaultValue: '{{count}} min ago' }).replace('{{count}}', diff.toString());
    if (diff < 1440) return t('device_map.time.hours_ago', { defaultValue: '{{count}} hr ago' }).replace('{{count}}', Math.floor(diff / 60).toString());
    return date.toLocaleTimeString();
  };

  const getMarkerColor = (speed) => {
    if (!speed && speed !== 0) return '#FF6B6B';
    if (speed > 80) return '#FF0000';
    if (speed > 50) return '#FFA500';
    if (speed > 5) return '#4CAF50';
    return '#2196F3';
  };

  const getStatusIcon = (speed) => {
    if (speed > 80) return '🚨';
    if (speed > 50) return '⚡';
    if (speed > 5) return '🚗';
    return '🅿️';
  };

  const getMovementStatus = (speed) => {
    if (speed > 5) return t('device_map.status.moving', { defaultValue: 'In Motion' });
    return t('device_map.status.parked', { defaultValue: 'Parked' });
  };

  // ========== OFFLINE: Format last update time with offline indicator ==========
  const getLastUpdateText = () => {
    if (!lastUpdate) return t('device_map.na', { defaultValue: 'N/A' });

    const now = new Date();
    const diff = Math.floor((now - lastUpdate) / 1000 / 60);

    if (diff < 1) return t('device_map.time.just_now', { defaultValue: 'Just now' });
    if (diff < 60) return t('device_map.time.minutes_ago', { defaultValue: '{{count}} min ago' }).replace('{{count}}', diff.toString());
    return t('device_map.time.hours_ago', { defaultValue: '{{count}} hr ago' }).replace('{{count}}', Math.floor(diff / 60).toString());
  };
  // ========== END OFFLINE LAST UPDATE ==========

  const renderHeader = () => {
    const stats = getStats();

    return (
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['#000000', '#1a1a1a']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={styles.headerGradient}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('device_map.title', { defaultValue: 'Fleet Tracker' })}</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>↻</Text>
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.searchContainer, { transform: [{ translateY: searchBarAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={t('device_map.search_placeholder', { defaultValue: 'Search by name, serial, or ID...' })}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

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
              <Text style={styles.statLabel}>{t('device_map.stats.total', { defaultValue: 'Total' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'moving' && styles.activeStatCard]}
              onPress={() => setFilter('moving')}
            >
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{stats.moving}</Text>
              <Text style={styles.statLabel}>{t('device_map.stats.moving', { defaultValue: 'Moving' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'stationary' && styles.activeStatCard]}
              onPress={() => setFilter('stationary')}
            >
              <Text style={[styles.statNumber, { color: '#FFA500' }]}>{stats.stationary}</Text>
              <Text style={styles.statLabel}>{t('device_map.stats.stationary', { defaultValue: 'Stationary' })}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* ========== OFFLINE: Status bar with sync indicator ========== */}
          <View style={styles.statusBar}>
            <View style={styles.statusLeft}>
              {!isOnline && (
                <View style={styles.offlineStatusBadge}>
                  <Text style={styles.offlineStatusText}>📴 {t('device_map.offline', { defaultValue: 'Offline Mode' })}</Text>
                </View>
              )}
              {isOnline && offlineDataAvailable && !loading && (
                <Text style={styles.lastUpdateText}>
                  {t('device_map.last_update', { defaultValue: 'Updated' })}: {getLastUpdateText()}
                </Text>
              )}
            </View>
            <View style={styles.statusRight}>
              {!isOnline && offlineDataAvailable && (
                <Text style={styles.cachedDataText}>
                  📦 {t('device_map.cached_data', { defaultValue: 'Cached Data' })}
                </Text>
              )}
              {isOnline && (
                <TouchableOpacity onPress={manualSync} style={styles.syncButton}>
                  <Text style={styles.syncButtonText}>🔄 {t('device_map.sync', { defaultValue: 'Sync' })}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {/* ========== END OFFLINE STATUS BAR ========== */}

          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[styles.controlButton, showTraffic && styles.activeControl]}
              onPress={() => setShowTraffic(!showTraffic)}
            >
              <Text style={styles.controlButtonText}>{t('device_map.controls.traffic', { defaultValue: 'Traffic' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, autoRefresh && styles.activeControl]}
              onPress={() => setAutoRefresh(!autoRefresh)}
            >
              <Text style={styles.controlButtonText}>{t('device_map.controls.live', { defaultValue: 'Live' })}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderBottomSheet = () => {
    const filteredDevices = getFilteredDevices();

    return (
      <Animated.View style={[styles.bottomSheet, { height: bottomSheetAnim }]}>
        <View style={styles.bottomSheetHandle}>
          <View style={styles.handleBar} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>
              {selectedDeviceMarker ? selectedDeviceMarker.deviceName || selectedDeviceMarker.deviceSn : t('device_map.bottom_sheet.nearby_vehicles', { defaultValue: 'Nearby Vehicles' })}
            </Text>
            <TouchableOpacity onPress={closeBottomSheet}>
              <Text style={styles.closeSheetText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.bottomSheetContent}>
          {selectedDeviceMarker ? (
            // Detailed view for selected device
            <View>
              <View style={styles.selectedDeviceHeader}>
                <View style={[styles.deviceStatusBadge, { backgroundColor: getMarkerColor(selectedDeviceMarker.speedKmh) + '20' }]}>
                  <Text style={[styles.deviceStatusText, { color: getMarkerColor(selectedDeviceMarker.speedKmh) }]}>
                    {getStatusIcon(selectedDeviceMarker.speedKmh)} {getMovementStatus(selectedDeviceMarker.speedKmh)}
                  </Text>
                </View>
                <Text style={styles.selectedDeviceSpeed}>{formatSpeed(selectedDeviceMarker.speedKmh)}</Text>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>🚛</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>{t('device_map.details.vehicle_id', { defaultValue: 'Vehicle ID' })}</Text>
                    <Text style={styles.infoValue}>{selectedDeviceMarker.deviceName || selectedDeviceMarker.deviceSn}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📍</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>{t('device_map.details.location', { defaultValue: 'Location' })}</Text>
                    <Text style={styles.infoValue}>
                      {selectedDeviceMarker.latitude?.toFixed(6)}, {selectedDeviceMarker.longitude?.toFixed(6)}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>⏱️</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>{t('device_map.details.last_update', { defaultValue: 'Last Update' })}</Text>
                    <Text style={styles.infoValue}>{formatDate(selectedDeviceMarker.timestamp)}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📊</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>{t('device_map.details.mileage', { defaultValue: 'Mileage' })}</Text>
                    <Text style={styles.infoValue}>{Math.round(selectedDeviceMarker.mileageKm || 0)} km</Text>
                  </View>
                </View>
              </View>

              {/* ========== OFFLINE: Data source indicator ========== */}
              {!isOnline && (
                <View style={styles.offlineDataBadge}>
                  <Text style={styles.offlineDataBadgeText}>📴 {t('device_map.cached_location', { defaultValue: 'Cached location data' })}</Text>
                </View>
              )}
              {/* ========== END OFFLINE DATA INDICATOR ========== */}

              <TouchableOpacity
                style={styles.centerOnMapButton}
                onPress={() => {
                  centerOnDevice(selectedDeviceMarker);
                }}
              >
                <LinearGradient
                  colors={['#000000', '#333333']}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                  style={styles.gradientButton}
                >
                  <Text style={styles.centerOnMapText}>{t('device_map.buttons.center_on_map', { defaultValue: 'Center on Map' })}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            // List view of all devices
            filteredDevices.map((device, index) => (
              <TouchableOpacity
                key={device.id || index}
                style={styles.deviceCard}
                onPress={() => {
                  setSelectedDeviceMarker(device);
                  centerOnDevice(device);
                }}
              >
                <View style={styles.deviceCardLeft}>
                  <View style={[styles.deviceIcon, { backgroundColor: getMarkerColor(device.speedKmh) }]}>
                    <Text style={styles.deviceIconText}>{getStatusIcon(device.speedKmh)}</Text>
                  </View>
                </View>
                <View style={styles.deviceCardCenter}>
                  <Text style={styles.deviceCardName}>{device.deviceName || device.deviceSn}</Text>
                  <Text style={styles.deviceCardSpeed}>{formatSpeed(device.speedKmh)}</Text>
                  <Text style={styles.deviceCardTime}>{formatDate(device.timestamp)}</Text>
                </View>
                <View style={styles.deviceCardRight}>
                  <Text style={styles.deviceCardDistance}>{Math.round(device.mileageKm || 0)} km</Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          {filteredDevices.length === 0 && !selectedDeviceMarker && (
            <View style={styles.emptySheetContainer}>
              <Text style={styles.emptySheetIcon}>🚫</Text>
              <Text style={styles.emptySheetTitle}>{t('device_map.empty.no_vehicles', { defaultValue: 'No vehicles found' })}</Text>
              <Text style={styles.emptySheetText}>{t('device_map.empty.adjust_search', { defaultValue: 'Try adjusting your search' })}</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  if (loading && !refreshing && !offlineDataAvailable) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>{t('device_map.loading', { defaultValue: 'Loading fleet data...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {renderHeader()}

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          region={mapRegion}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsTraffic={showTraffic}
          showsCompass={true}
          showsScale={true}
          zoomControlEnabled={false}
          onMapReady={() => {
            setMapReady(true);
            if (devices.length > 0) {
              fitMapToMarkers(devices);
            }
          }}
          onPress={() => closeBottomSheet()}
        >
          {getFilteredDevices().map((device, index) => {
            if (!device.latitude || !device.longitude) return null;

            const latitude = parseFloat(device.latitude);
            const longitude = parseFloat(device.longitude);

            if (isNaN(latitude) || isNaN(longitude)) return null;

            return (
              <Marker
                key={device.id || index}
                coordinate={{ latitude, longitude }}
                onPress={() => {
                  setSelectedDeviceMarker(device);
                  centerOnDevice(device);
                }}
              >
                <View style={[styles.customMarker, { borderColor: getMarkerColor(device.speedKmh) }]}>
                  <View style={[styles.markerInner, { backgroundColor: getMarkerColor(device.speedKmh) }]}>
                    <Text style={styles.markerText}>{getStatusIcon(device.speedKmh)}</Text>
                  </View>
                </View>
              </Marker>
            );
          })}
        </MapView>

        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: -1.286389,
                longitude: 36.817223,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }, 500);
            }
          }}
        >
          <Text style={styles.myLocationText}>📍</Text>
        </TouchableOpacity>
      </View>

      {renderBottomSheet()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  refreshButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderRadius: 30,
    height: 50,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#666',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
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
    marginBottom: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 80,
  },
  activeStatCard: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  // ========== OFFLINE STYLES ==========
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },
  statusLeft: {
    flex: 1,
  },
  statusRight: {
    alignItems: 'flex-end',
  },
  offlineStatusBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  offlineStatusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  lastUpdateText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  cachedDataText: {
    color: '#FF9800',
    fontSize: 10,
    fontWeight: '500',
  },
  syncButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
  offlineDataBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  offlineDataBadgeText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '500',
  },
  // ========== END OFFLINE STYLES ==========
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  controlButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  activeControl: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  customMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerText: {
    fontSize: 18,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  myLocationText: {
    fontSize: 24,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  bottomSheetHandle: {
    paddingTop: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  closeSheetText: {
    fontSize: 20,
    color: '#999',
    padding: 8,
  },
  bottomSheetContent: {
    padding: 20,
    paddingBottom: 40,
  },
  deviceCard: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  deviceCardLeft: {
    marginRight: 12,
  },
  deviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceIconText: {
    fontSize: 24,
  },
  deviceCardCenter: {
    flex: 1,
  },
  deviceCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  deviceCardSpeed: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  deviceCardTime: {
    fontSize: 12,
    color: '#999',
  },
  deviceCardRight: {
    alignItems: 'flex-end',
  },
  deviceCardDistance: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFA500',
  },
  selectedDeviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  deviceStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  deviceStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedDeviceSpeed: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  infoCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  centerOnMapButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradientButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  centerOnMapText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  emptySheetContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptySheetIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptySheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptySheetText: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#FFFFFF',
  },
});

export default DeviceMapScreen;
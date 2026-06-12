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
  Image,
  FlatList
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width, height } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = height * 0.7;
const BOTTOM_SHEET_MIN_HEIGHT = height * 0.12;

const DeviceMapScreen = () => {
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
  const [sortBy, setSortBy] = useState('distance'); // distance, speed, name

  const mapRef = useRef(null);
  const intervalRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bottomSheetAnim = useRef(new Animated.Value(BOTTOM_SHEET_MIN_HEIGHT)).current;
  const searchBarAnim = useRef(new Animated.Value(0)).current;

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
              text: 'Back online! Syncing data...',
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Auto-refresh when coming back online
            fetchDevices();
          } else {
            Snackbar.show({
              text: 'Offline mode - using cached device locations',
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
      await OfflineDatabaseService.saveUserData('device_map_locations', {
        data: devicesData,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString()
      });
      console.log('✅ Device locations cached offline');
    } catch (error) {
      console.error('Error caching device locations:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached devices ==========
  const loadCachedDevices = async () => {
    try {
      const cached = await OfflineDatabaseService.getUserData('device_map_locations');
      if (cached && cached.data && cached.data.length > 0) {
        setDevices(cached.data);
        if (cached.lastUpdate) {
          setLastUpdate(new Date(cached.lastUpdate));
        }
        console.log('📦 Loaded cached device locations');

        // Fit map to cached markers
        if (mapRef.current && mapReady && cached.data.length > 0) {
          fitMapToMarkers(cached.data);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading cached device locations:', error);
      return false;
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

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

  useEffect(() => {
    // ========== OFFLINE: Only auto-refresh if online ==========
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
        // Try to load cached data
        await loadCachedDevices();
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const response = await axios.get(
        `${serverUrl}/telemetry/latest-t1s`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data && Array.isArray(response.data)) {
        setDevices(response.data);
        setLastUpdate(new Date());

        // ========== OFFLINE: Cache fetched devices ==========
        await cacheDevicesData(response.data);
        // ========== END OFFLINE CACHE ==========

        if (!selectedDeviceMarker && response.data.length > 0 && mapRef.current && mapReady) {
          fitMapToMarkers(response.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch device locations:', error);

      // ========== OFFLINE: Fallback to cached data on error ==========
      const hasCached = await loadCachedDevices();
      if (!hasCached) {
        Snackbar.show({
          text: 'Failed to load device locations',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      } else {
        Snackbar.show({
          text: 'Using cached device locations (offline mode)',
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
      fetchDevices();
    } else {
      loadCachedDevices();
      setRefreshing(false);
    }
    // ========== END OFFLINE MANUAL SYNC ==========
  };

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
    setTimeout(() => setSelectedDeviceMarker(null), 300);
  };

  const getFilteredDevices = () => {
    let filtered = [...devices];

    if (filter === 'moving') {
      filtered = filtered.filter(d => (d.speedKmh || 0) > 5);
    } else if (filter === 'stationary') {
      filtered = filtered.filter(d => (d.speedKmh || 0) <= 5);
    } else if (filter === 'high-speed') {
      filtered = filtered.filter(d => (d.speedKmh || 0) > 80);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.deviceName?.toLowerCase().includes(query) ||
        d.deviceSn?.toLowerCase().includes(query) ||
        d.t1Number?.toLowerCase().includes(query)
      );
    }

    // Sort devices
    if (sortBy === 'speed') {
      filtered.sort((a, b) => (b.speedKmh || 0) - (a.speedKmh || 0));
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => (a.deviceName || '').localeCompare(b.deviceName || ''));
    }

    return filtered;
  };

  const getStats = () => {
    const moving = devices.filter(d => (d.speedKmh || 0) > 5).length;
    const stationary = devices.filter(d => (d.speedKmh || 0) <= 5).length;
    const highSpeed = devices.filter(d => (d.speedKmh || 0) > 80).length;
    return {
      total: devices.length,
      moving,
      stationary,
      highSpeed,
    };
  };

  const formatSpeed = (speed) => {
    if (!speed && speed !== 0) return 'N/A';
    return `${Math.round(speed)} km/h`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)} hr ago`;
    return date.toLocaleTimeString();
  };

  const getMarkerColor = (speed) => {
    if (!speed && speed !== 0) return '#FF6B6B';
    if (speed > 80) return '#FF3B30';
    if (speed > 50) return '#FF9500';
    if (speed > 5) return '#34C759';
    return '#007AFF';
  };

  const getStatusIcon = (speed) => {
    if (speed > 80) return '⚠️';
    if (speed > 50) return '⚡';
    if (speed > 5) return '🚗';
    return '📍';
  };

  const getSpeedCategory = (speed) => {
    if (speed > 80) return 'High Speed';
    if (speed > 50) return 'Moderate';
    if (speed > 5) return 'Moving';
    return 'Stationary';
  };

  const renderHeader = () => {
    const stats = getStats();

    return (
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <View style={styles.headerGradient}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Fleet Tracker</Text>
            <View style={styles.headerRightActions}>
              {/* ========== OFFLINE: Manual sync button ========== */}
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={styles.syncIndicator} />
              ) : (
                <TouchableOpacity onPress={() => fetchDevices()} style={styles.syncButton}>
                  <Icon name="sync" size={20} color={isOnline ? "#4CAF50" : "#999"} />
                </TouchableOpacity>
              )}
              {/* ========== END OFFLINE SYNC BUTTON ========== */}
              <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
                <Icon name="refresh" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ========== OFFLINE: Network status banner ========== */}
          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached locations</Text>
            </View>
          )}
          {/* ========== END OFFLINE BANNER ========== */}

          <Animated.View style={[styles.searchContainer, { transform: [{ translateY: searchBarAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Icon name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, serial, or ID..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="close" size={20} color="#999" />
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
              <Text style={styles.statLabel}>Total</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'moving' && styles.activeStatCard]}
              onPress={() => setFilter('moving')}
            >
              <Text style={[styles.statNumber, { color: '#34C759' }]}>{stats.moving}</Text>
              <Text style={styles.statLabel}>Moving</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'stationary' && styles.activeStatCard]}
              onPress={() => setFilter('stationary')}
            >
              <Text style={[styles.statNumber, { color: '#007AFF' }]}>{stats.stationary}</Text>
              <Text style={styles.statLabel}>Stationary</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, filter === 'high-speed' && styles.activeStatCard]}
              onPress={() => setFilter('high-speed')}
            >
              <Text style={[styles.statNumber, { color: '#FF3B30' }]}>{stats.highSpeed}</Text>
              <Text style={styles.statLabel}>High Speed</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[styles.controlButton, showTraffic && styles.activeControl]}
              onPress={() => setShowTraffic(!showTraffic)}
            >
              <Icon name="traffic" size={16} color="#FFFFFF" />
              <Text style={styles.controlButtonText}>Traffic</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, autoRefresh && styles.activeControl]}
              onPress={() => setAutoRefresh(!autoRefresh)}
            >
              <Icon name="timelapse" size={16} color="#FFFFFF" />
              <Text style={styles.controlButtonText}>Live</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => {
                setSortBy(sortBy === 'speed' ? 'name' : 'speed');
              }}
            >
              <Icon name="sort" size={16} color="#FFFFFF" />
              <Text style={styles.controlButtonText}>
                Sort by {sortBy === 'speed' ? 'Speed' : 'Name'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderDeviceListItem = ({ item, index }) => (
    <Animatable.View animation="fadeInUp" delay={index * 50} duration={400}>
      <TouchableOpacity
        style={styles.deviceCard}
        onPress={() => {
          setSelectedDeviceMarker(item);
          centerOnDevice(item);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.deviceIcon, { backgroundColor: getMarkerColor(item.speedKmh) + '20' }]}>
          <Text style={styles.deviceIconText}>{getStatusIcon(item.speedKmh)}</Text>
        </View>

        <View style={styles.deviceCardCenter}>
          <Text style={styles.deviceCardName}>{item.deviceName || item.deviceSn}</Text>
          <View style={styles.speedContainer}>
            <Icon name="speed" size={14} color={getMarkerColor(item.speedKmh)} />
            <Text style={[styles.deviceCardSpeed, { color: getMarkerColor(item.speedKmh) }]}>
              {formatSpeed(item.speedKmh)}
            </Text>
            <Text style={styles.speedCategory}>
              {getSpeedCategory(item.speedKmh)}
            </Text>
          </View>
          <Text style={styles.deviceCardTime}>
            <Icon name="access-time" size={10} color="#999" /> {formatDate(item.timestamp)}
          </Text>
        </View>

        <View style={styles.deviceCardRight}>
          <View style={styles.mileageContainer}>
            <Icon name="map" size={14} color="#FFA500" />
            <Text style={styles.deviceCardDistance}>{Math.round(item.mileageKm || 0)} km</Text>
          </View>
          <Icon name="chevron-right" size={20} color="#CCC" />
        </View>
      </TouchableOpacity>
    </Animatable.View>
  );

  const renderBottomSheet = () => {
    const filteredDevices = getFilteredDevices();
    const stats = getStats();

    return (
      <Animated.View style={[styles.bottomSheet, { height: bottomSheetAnim }]}>
        <View style={styles.bottomSheetHandle}>
          <View style={styles.handleBar} />
          <View style={styles.bottomSheetHeader}>
            <View>
              <Text style={styles.bottomSheetTitle}>
                {selectedDeviceMarker ? 'Vehicle Details' : 'Nearby Vehicles'}
              </Text>
              {!selectedDeviceMarker && (
                <Text style={styles.bottomSheetSubtitle}>
                  {filteredDevices.length} vehicles • {stats.moving} moving
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={closeBottomSheet} style={styles.closeSheetButton}>
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {selectedDeviceMarker ? (
          // Detailed view for selected device
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.bottomSheetContent}>
            <View style={styles.selectedDeviceCard}>
              <View style={styles.selectedDeviceHeader}>
                <View style={[styles.deviceStatusBadge, { backgroundColor: getMarkerColor(selectedDeviceMarker.speedKmh) + '20' }]}>
                  <Text style={[styles.deviceStatusText, { color: getMarkerColor(selectedDeviceMarker.speedKmh) }]}>
                    {getStatusIcon(selectedDeviceMarker.speedKmh)} {selectedDeviceMarker.speedKmh > 5 ? 'In Motion' : 'Parked'}
                  </Text>
                </View>
                <Text style={[styles.selectedDeviceSpeed, { color: getMarkerColor(selectedDeviceMarker.speedKmh) }]}>
                  {formatSpeed(selectedDeviceMarker.speedKmh)}
                </Text>
              </View>

              <Text style={styles.selectedDeviceName}>
                {selectedDeviceMarker.deviceName || selectedDeviceMarker.deviceSn}
              </Text>

              <View style={styles.infoGrid}>
                <View style={styles.infoGridItem}>
                  <Icon name="devices" size={20} color="#666" />
                  <Text style={styles.infoGridLabel}>Serial</Text>
                  <Text style={styles.infoGridValue}>{selectedDeviceMarker.deviceSn || 'N/A'}</Text>
                </View>

                <View style={styles.infoGridItem}>
                  <Icon name="tag" size={20} color="#666" />
                  <Text style={styles.infoGridLabel}>T1 Number</Text>
                  <Text style={styles.infoGridValue}>{selectedDeviceMarker.t1Number || 'N/A'}</Text>
                </View>

                <View style={styles.infoGridItem}>
                  <Icon name="speed" size={20} color="#666" />
                  <Text style={styles.infoGridLabel}>Speed</Text>
                  <Text style={styles.infoGridValue}>{formatSpeed(selectedDeviceMarker.speedKmh)}</Text>
                </View>

                <View style={styles.infoGridItem}>
                  <Icon name="straighten" size={20} color="#666" />
                  <Text style={styles.infoGridLabel}>Mileage</Text>
                  <Text style={styles.infoGridValue}>{Math.round(selectedDeviceMarker.mileageKm || 0)} km</Text>
                </View>
              </View>

              <View style={styles.locationSection}>
                <Icon name="location-on" size={20} color="#FFA500" />
                <Text style={styles.locationTitle}>Current Location</Text>
                <Text style={styles.locationCoordinates}>
                  {selectedDeviceMarker.latitude?.toFixed(6)}, {selectedDeviceMarker.longitude?.toFixed(6)}
                </Text>
              </View>

              <View style={styles.timeSection}>
                <Icon name="access-time" size={20} color="#666" />
                <Text style={styles.timeTitle}>Last Update</Text>
                <Text style={styles.timeValue}>
                  {new Date(selectedDeviceMarker.timestamp).toLocaleString()}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.centerButton}
                onPress={() => {
                  centerOnDevice(selectedDeviceMarker);
                }}
              >
                <View style={styles.centerButtonInner}>
                  <Icon name="my-location" size={20} color="#FFFFFF" />
                  <Text style={styles.centerButtonText}>Center on Map</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          // List view of all devices
          <FlatList
            data={filteredDevices}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            renderItem={renderDeviceListItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.bottomSheetContent}
            ListEmptyComponent={
              <View style={styles.emptySheetContainer}>
                <Icon name="search-off" size={64} color="#CCC" />
                <Text style={styles.emptySheetTitle}>No vehicles found</Text>
                <Text style={styles.emptySheetText}>Try adjusting your search or filters</Text>
              </View>
            }
          />
        )}
      </Animated.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading fleet data...</Text>
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
          onPress={() => {
            if (bottomSheetVisible) closeBottomSheet();
          }}
        >
          {getFilteredDevices().map((device, index) => {
            if (!device.latitude || !device.longitude) return null;

            const latitude = parseFloat(device.latitude);
            const longitude = parseFloat(device.longitude);

            if (isNaN(latitude) || isNaN(longitude)) return null;

            const isSelected = selectedDeviceMarker?.id === device.id;

            return (
              <Marker
                key={device.id || index}
                coordinate={{ latitude, longitude }}
                onPress={() => {
                  setSelectedDeviceMarker(device);
                  centerOnDevice(device);
                }}
              >
                <Animated.View style={[
                  styles.customMarker,
                  isSelected && styles.selectedMarker,
                  { borderColor: getMarkerColor(device.speedKmh) }
                ]}>
                  <View style={[styles.markerInner, { backgroundColor: getMarkerColor(device.speedKmh) }]}>
                    <Text style={styles.markerText}>{getStatusIcon(device.speedKmh)}</Text>
                  </View>
                  {isSelected && <View style={styles.markerPulse} />}
                </Animated.View>
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
          <Icon name="my-location" size={24} color="#007AFF" />
        </TouchableOpacity>

        {lastUpdate && (
          <View style={styles.lastUpdateBadge}>
            <Icon name="access-time" size={12} color="#666" />
            <Text style={styles.lastUpdateText}>
              Updated {formatDate(lastUpdate.toISOString())}
            </Text>
          </View>
        )}
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
    backgroundColor: '#000000',
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  syncIndicator: {
    width: 40,
    height: 40,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 10,
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
    backgroundColor: 'rgba(255,255,255,0.95)',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderRadius: 30,
    height: 50,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
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
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    gap: 6,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  selectedMarker: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 4,
  },
  markerInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerText: {
    fontSize: 20,
  },
  markerPulse: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,122,255,0.3)',
    animation: 'pulse 1.5s infinite',
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
  lastUpdateBadge: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  lastUpdateText: {
    fontSize: 11,
    color: '#FFF',
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
  bottomSheetSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  closeSheetButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
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
  deviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceIconText: {
    fontSize: 28,
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
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  deviceCardSpeed: {
    fontSize: 14,
    fontWeight: '600',
  },
  speedCategory: {
    fontSize: 11,
    color: '#666',
  },
  deviceCardTime: {
    fontSize: 11,
    color: '#999',
  },
  deviceCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  mileageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deviceCardDistance: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFA500',
  },
  selectedDeviceCard: {
    padding: 4,
  },
  selectedDeviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  deviceStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectedDeviceSpeed: {
    fontSize: 32,
    fontWeight: '700',
  },
  selectedDeviceName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  infoGridItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  infoGridLabel: {
    fontSize: 11,
    color: '#999',
  },
  infoGridValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  locationSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  locationCoordinates: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  timeSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 6,
  },
  timeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  timeValue: {
    fontSize: 12,
    color: '#666',
  },
  centerButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  centerButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    gap: 8,
    borderRadius: 12,
  },
  centerButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  emptySheetContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptySheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 12,
    marginBottom: 4,
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
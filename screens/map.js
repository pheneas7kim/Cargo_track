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

const { width, height } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = height * 0.65;
const BOTTOM_SHEET_MIN_HEIGHT = height * 0.15;

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

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchDevices(true);
      }, 30000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

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
      
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        console.error('No token found');
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
        
        if (!selectedDeviceMarker && response.data.length > 0 && mapRef.current && mapReady) {
          fitMapToMarkers(response.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch device locations:', error);
      Snackbar.show({
        text: 'Failed to load device locations',
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
            <Text style={styles.headerTitle}>Fleet Tracker</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>↻</Text>
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.searchContainer, { transform: [{ translateY: searchBarAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, serial, or ID..."
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
              <Text style={styles.statLabel}>Total</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'moving' && styles.activeStatCard]}
              onPress={() => setFilter('moving')}
            >
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{stats.moving}</Text>
              <Text style={styles.statLabel}>Moving</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'stationary' && styles.activeStatCard]}
              onPress={() => setFilter('stationary')}
            >
              <Text style={[styles.statNumber, { color: '#FFA500' }]}>{stats.stationary}</Text>
              <Text style={styles.statLabel}>Stationary</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.controlsContainer}>
            <TouchableOpacity 
              style={[styles.controlButton, showTraffic && styles.activeControl]}
              onPress={() => setShowTraffic(!showTraffic)}
            >
              <Text style={styles.controlButtonText}>Traffic</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.controlButton, autoRefresh && styles.activeControl]}
              onPress={() => setAutoRefresh(!autoRefresh)}
            >
              <Text style={styles.controlButtonText}>Live</Text>
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
              {selectedDeviceMarker ? selectedDeviceMarker.deviceName || selectedDeviceMarker.deviceSn : 'Nearby Vehicles'}
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
                    {getStatusIcon(selectedDeviceMarker.speedKmh)} {selectedDeviceMarker.speedKmh > 5 ? 'In Motion' : 'Parked'}
                  </Text>
                </View>
                <Text style={styles.selectedDeviceSpeed}>{formatSpeed(selectedDeviceMarker.speedKmh)}</Text>
              </View>
              
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>🚛</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Vehicle ID</Text>
                    <Text style={styles.infoValue}>{selectedDeviceMarker.deviceName || selectedDeviceMarker.deviceSn}</Text>
                  </View>
                </View>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📍</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Location</Text>
                    <Text style={styles.infoValue}>
                      {selectedDeviceMarker.latitude?.toFixed(6)}, {selectedDeviceMarker.longitude?.toFixed(6)}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>⏱️</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Last Update</Text>
                    <Text style={styles.infoValue}>{formatDate(selectedDeviceMarker.timestamp)}</Text>
                  </View>
                </View>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoIcon}>📊</Text>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Mileage</Text>
                    <Text style={styles.infoValue}>{Math.round(selectedDeviceMarker.mileageKm || 0)} km</Text>
                  </View>
                </View>
              </View>
              
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
                  <Text style={styles.centerOnMapText}>Center on Map</Text>
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
              <Text style={styles.emptySheetTitle}>No vehicles found</Text>
              <Text style={styles.emptySheetText}>Try adjusting your search</Text>
            </View>
          )}
        </ScrollView>
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
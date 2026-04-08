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
  Alert
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';

const { width, height } = Dimensions.get('window');

// Dynamically import MapView to avoid issues
let MapView, Marker, Callout, PROVIDER_GOOGLE;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps.MapView;
  Marker = Maps.Marker;
  Callout = Maps.Callout;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (error) {
  console.warn('react-native-maps not properly installed:', error);
}

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
  const [mapError, setMapError] = useState(false);
  
  const mapRef = useRef(null);
  const intervalRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

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
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.5),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.5),
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
    return date.toLocaleTimeString();
  };

  const getMarkerColor = (speed) => {
    if (!speed && speed !== 0) return '#FF6B6B';
    if (speed > 80) return '#FF0000';
    if (speed > 50) return '#FFA500';
    if (speed > 5) return '#4CAF50';
    return '#2196F3';
  };

  const renderDeviceList = () => {
    const filteredDevices = getFilteredDevices();
    
    return (
      <Animated.View style={[styles.deviceListPanel, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Devices ({filteredDevices.length})</Text>
          <TouchableOpacity onPress={() => {}} style={styles.closePanel}>
            <Text style={styles.closePanelText}>✕</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView showsVerticalScrollIndicator={false}>
          {filteredDevices.map((device, index) => (
            <TouchableOpacity
              key={device.id || index}
              style={[
                styles.deviceListItem,
                selectedDeviceMarker?.id === device.id && styles.selectedDeviceItem
              ]}
              onPress={() => {
                setSelectedDevice(device);
                centerOnDevice(device);
              }}
            >
              <View style={styles.deviceItemHeader}>
                <View style={[styles.statusDot, { backgroundColor: getMarkerColor(device.speedKmh) }]} />
                <Text style={styles.deviceItemName}>{device.deviceName || device.deviceSn}</Text>
              </View>
              <View style={styles.deviceItemDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Speed:</Text>
                  <Text style={styles.detailValue}>{formatSpeed(device.speedKmh)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location:</Text>
                  <Text style={styles.detailValue}>
                    {device.latitude?.toFixed(4) || 'N/A'}, {device.longitude?.toFixed(4) || 'N/A'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Last Update:</Text>
                  <Text style={styles.detailValue}>{formatDate(device.timestamp)}</Text>
                </View>
              </View>
              <Text style={styles.viewOnMapText}>Tap to view on map →</Text>
            </TouchableOpacity>
          ))}
          {filteredDevices.length === 0 && (
            <View style={styles.emptyListContainer}>
              <Text style={styles.emptyListText}>No devices found</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  const renderHeader = () => {
    const stats = getStats();
    
    return (
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Device Monitoring</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>↻</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search devices..."
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
            <Text style={styles.statLabel}>All</Text>
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
            <Text style={[styles.statNumber, { color: '#2196F3' }]}>{stats.stationary}</Text>
            <Text style={styles.statLabel}>Stationary</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={[styles.controlButton, showTraffic && styles.activeControl]}
            onPress={() => setShowTraffic(!showTraffic)}
          >
            <Text style={styles.controlButtonText}>🚦 Traffic</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.controlButton, autoRefresh && styles.activeControl]}
            onPress={() => setAutoRefresh(!autoRefresh)}
          >
            <Text style={styles.controlButtonText}>🔄 Auto {autoRefresh ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          
          {lastUpdate && (
            <Text style={styles.lastUpdateText}>
              Updated: {lastUpdate.toLocaleTimeString()}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  };

  // If map is not installed, show error message
  if (!MapView) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={styles.emptyTitle}>Maps not available</Text>
          <Text style={styles.emptyText}>
            Please install react-native-maps properly.
          </Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>Loading device locations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      
      {renderHeader()}
      
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          region={mapRegion}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsTraffic={showTraffic}
          showsCompass={true}
          showsScale={true}
          zoomControlEnabled={true}
          onMapReady={() => {
            setMapReady(true);
            if (devices.length > 0) {
              fitMapToMarkers(devices);
            }
          }}
          onError={(error) => {
            console.error('Map error:', error);
            setMapError(true);
          }}
        >
          {getFilteredDevices().map((device, index) => {
            if (!device.latitude || !device.longitude) return null;
            
            const latitude = parseFloat(device.latitude);
            const longitude = parseFloat(device.longitude);
            
            if (isNaN(latitude) || isNaN(longitude)) return null;
            
            return (
              <Marker
                key={device.id || index}
                coordinate={{
                  latitude,
                  longitude,
                }}
                title={device.deviceName || device.deviceSn}
                description={`Speed: ${formatSpeed(device.speedKmh)}`}
                pinColor={getMarkerColor(device.speedKmh)}
                onPress={() => {
                  setSelectedDeviceMarker(device);
                  setSelectedDevice(device);
                  setModalVisible(true);
                }}
              >
                {Callout && (
                  <Callout>
                    <View style={styles.calloutContainer}>
                      <Text style={styles.calloutTitle}>{device.deviceName || device.deviceSn}</Text>
                      <Text style={styles.calloutText}>Speed: {formatSpeed(device.speedKmh)}</Text>
                      <Text style={styles.calloutText}>Mileage: {Math.round(device.mileageKm || 0)} km</Text>
                      <Text style={styles.calloutText}>Updated: {formatDate(device.timestamp)}</Text>
                      <TouchableOpacity 
                        style={styles.calloutButton}
                        onPress={() => {
                          setSelectedDevice(device);
                          setModalVisible(true);
                        }}
                      >
                        <Text style={styles.calloutButtonText}>View Details</Text>
                      </TouchableOpacity>
                    </View>
                  </Callout>
                )}
              </Marker>
            );
          })}
        </MapView>
      </View>
      
      {renderDeviceList()}

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
                <View style={styles.modalStatusContainer}>
                  <View style={[styles.modalStatusDot, { backgroundColor: getMarkerColor(selectedDevice.speedKmh) }]} />
                  <Text style={styles.modalStatusText}>
                    {selectedDevice.speedKmh > 5 ? 'Moving' : 'Stationary'}
                  </Text>
                </View>

                <Text style={styles.modalDeviceName}>
                  {selectedDevice.deviceName || selectedDevice.deviceSn}
                </Text>
                
                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Serial Number</Text>
                    <Text style={styles.infoValue}>{selectedDevice.deviceSn || 'N/A'}</Text>
                  </View>
                  
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>T1 Number</Text>
                    <Text style={styles.infoValue}>{selectedDevice.t1Number || 'N/A'}</Text>
                  </View>
                  
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Speed</Text>
                    <Text style={styles.infoValue}>{formatSpeed(selectedDevice.speedKmh)}</Text>
                  </View>
                  
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Mileage</Text>
                    <Text style={styles.infoValue}>{Math.round(selectedDevice.mileageKm || 0)} km</Text>
                  </View>
                </View>

                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Location</Text>
                  <View style={styles.locationCard}>
                    <Text style={styles.locationLabel}>Coordinates</Text>
                    <Text style={styles.locationValue}>
                      {selectedDevice.latitude?.toFixed(6) || 'N/A'}, {selectedDevice.longitude?.toFixed(6) || 'N/A'}
                    </Text>
                  </View>
                </View>

                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Last Update</Text>
                  <View style={styles.timestampCard}>
                    <Text style={styles.timestampValue}>
                      {selectedDevice.timestamp ? new Date(selectedDevice.timestamp).toLocaleString() : 'N/A'}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={styles.centerButton}
                    onPress={() => {
                      centerOnDevice(selectedDevice);
                      setModalVisible(false);
                    }}
                  >
                    <Text style={styles.centerButtonText}>Center on Map</Text>
                  </TouchableOpacity>
                </View>

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
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 12,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  refreshButtonText: {
    fontSize: 24,
    color: '#FFA500',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    marginBottom: 12,
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
    marginBottom: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 70,
  },
  activeStatCard: {
    backgroundColor: '#FFA50010',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 8,
  },
  controlButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  activeControl: {
    backgroundColor: '#FFA50020',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  controlButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  lastUpdateText: {
    fontSize: 10,
    color: '#999',
    marginLeft: 'auto',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  deviceListPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    maxHeight: height * 0.4,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  closePanel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closePanelText: {
    fontSize: 16,
    color: '#999',
  },
  deviceListItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  selectedDeviceItem: {
    backgroundColor: '#FFA50010',
  },
  deviceItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  deviceItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  deviceItemDetails: {
    marginLeft: 18,
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  detailLabel: {
    fontSize: 11,
    color: '#999',
    width: 80,
  },
  detailValue: {
    fontSize: 11,
    color: '#333',
    flex: 1,
  },
  viewOnMapText: {
    fontSize: 10,
    color: '#FFA500',
    marginLeft: 18,
    marginTop: 4,
  },
  emptyListContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 12,
    color: '#999',
  },
  calloutContainer: {
    padding: 8,
    minWidth: 150,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  calloutButton: {
    backgroundColor: '#FFA500',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  calloutButtonText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
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
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
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
    maxHeight: '80%',
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
  modalStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  modalStatusDot: {
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
    fontSize: 22,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  locationCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
  },
  locationLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  locationValue: {
    fontSize: 13,
    color: '#333',
    fontFamily: 'monospace',
  },
  timestampCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
  },
  timestampValue: {
    fontSize: 13,
    color: '#333',
  },
  actionButtons: {
    marginBottom: 20,
  },
  centerButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  centerButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  closeModalButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  closeModalButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default DeviceMapScreen;
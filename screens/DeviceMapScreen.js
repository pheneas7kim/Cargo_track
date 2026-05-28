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
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Polyline, Circle } from 'react-native-maps';
import serverUrl from '../config';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');
const BOTTOM_SHEET_MIN_HEIGHT = 70;
const BOTTOM_SHEET_MAX_HEIGHT = height * 0.6;

const DeviceMapScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [devices, setDevices] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapRegion, setMapRegion] = useState({
    latitude: -1.286389,
    longitude: 36.817223,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });
  const [selectedDeviceMarker, setSelectedDeviceMarker] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapType, setMapType] = useState('standard');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [showGeofences, setShowGeofences] = useState(true); // toggle geofences visibility

  const mapRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const panelHeight = useRef(new Animated.Value(BOTTOM_SHEET_MIN_HEIGHT)).current;

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
      fetchAllData();

      const backAction = () => false;
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const fetchAllData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        console.error('No token found');
        return;
      }

      // Fetch both devices and geofences in parallel
      const [devicesRes, geofencesRes] = await Promise.all([
        axios.get(`${serverUrl}/telemetry/latest-t1s`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${serverUrl}/geofences?size=1000`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ]);

      if (devicesRes.data && Array.isArray(devicesRes.data)) {
        setDevices(devicesRes.data);
      }
      if (geofencesRes.data && geofencesRes.data.content) {
        setGeofences(geofencesRes.data.content);
      }

      // Fit map to all markers and geofences after both are loaded
      if (!selectedDeviceMarker && (devicesRes.data.length > 0 || geofencesRes.data.content.length > 0)) {
        fitMapToAllFeatures(devicesRes.data, geofencesRes.data.content);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      Snackbar.show({
        text: t('device_map.errors.load_failed', { defaultValue: 'Failed to load data' }),
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
    fetchAllData(true);
  };

  const fitMapToAllFeatures = (deviceList, geofenceList) => {
    const allLatLngs = [];

    // Add device coordinates
    deviceList.forEach(d => {
      if (d.latitude && d.longitude) {
        allLatLngs.push({ lat: parseFloat(d.latitude), lng: parseFloat(d.longitude) });
      }
    });

    // Add geofence coordinates
    geofenceList.forEach(g => {
      if (g.fenceType === 'LINE' && g.coordinatesJson) {
        try {
          const points = JSON.parse(g.coordinatesJson);
          points.forEach(p => allLatLngs.push({ lat: p.lat, lng: p.lng }));
        } catch (e) {}
      } else if (g.fenceType === 'CIRCLE' && g.centerLat && g.centerLng) {
        allLatLngs.push({ lat: g.centerLat, lng: g.centerLng });
      }
    });

    if (allLatLngs.length === 0) return;

    const lats = allLatLngs.map(p => p.lat);
    const lngs = allLatLngs.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

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
      } catch (e) {}
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
      } catch (e) {}
    }
    setSelectedDeviceMarker(device);
  };

  const togglePanel = () => {
    Animated.spring(panelHeight, {
      toValue: isPanelExpanded ? BOTTOM_SHEET_MIN_HEIGHT : BOTTOM_SHEET_MAX_HEIGHT,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
    setIsPanelExpanded(!isPanelExpanded);
  };

  const getFilteredDevices = () => {
    let filtered = [...devices];
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
    return '📍';
  };

  const getMapTypeValue = () => {
    switch(mapType) {
      case 'satellite':
        return 'satellite';
      case 'hybrid':
        return 'hybrid';
      default:
        return 'standard';
    }
  };

  const renderDeviceList = () => {
    const filteredDevices = getFilteredDevices();
    return (
      <Animated.View style={[styles.bottomSheet, { height: panelHeight }]}>
        <TouchableOpacity style={styles.handleBarContainer} onPress={togglePanel}>
          <View style={styles.handleBar} />
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{t('device_map.devices_title', { defaultValue: 'Devices' })} ({filteredDevices.length})</Text>
          </View>
        </TouchableOpacity>

        {isPanelExpanded && (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.deviceListContainer}>
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
                    <Text style={styles.detailLabel}>{t('device_map.speed_label', { defaultValue: 'Speed' })}:</Text>
                    <Text style={styles.detailValue}>{formatSpeed(device.speedKmh)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('device_map.location_label', { defaultValue: 'Location' })}:</Text>
                    <Text style={styles.detailValue}>
                      {device.latitude?.toFixed(4) || t('device_map.na', { defaultValue: 'N/A' })}, {device.longitude?.toFixed(4) || t('device_map.na', { defaultValue: 'N/A' })}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('device_map.last_update_label', { defaultValue: 'Last Update' })}:</Text>
                    <Text style={styles.detailValue}>{formatDate(device.timestamp)}</Text>
                  </View>
                </View>
                <Text style={styles.viewOnMapText}>{t('device_map.tap_to_view', { defaultValue: 'Tap to view on map →' })}</Text>
              </TouchableOpacity>
            ))}
            {filteredDevices.length === 0 && (
              <View style={styles.emptyListContainer}>
                <Text style={styles.emptyListText}>{t('device_map.no_devices', { defaultValue: 'No devices found' })}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>
    );
  };

  const renderHeader = () => {
    return (
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
             <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('device_map.title', { defaultValue: 'Device Monitoring' })}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>↻</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('device_map.search_placeholder', { defaultValue: 'Search devices...' })}
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

        <View style={styles.mapTypeRow}>
          <TouchableOpacity
            style={[styles.mapTypeButton, mapType === 'standard' && styles.activeMapType]}
            onPress={() => setMapType('standard')}
          >
            <Text style={[styles.mapTypeText, mapType === 'standard' && styles.activeMapTypeText]}>{t('device_map.map_types.standard', { defaultValue: '🗺️ Standard' })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapTypeButton, mapType === 'satellite' && styles.activeMapType]}
            onPress={() => setMapType('satellite')}
          >
            <Text style={[styles.mapTypeText, mapType === 'satellite' && styles.activeMapTypeText]}>{t('device_map.map_types.satellite', { defaultValue: '🛰️ Satellite' })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapTypeButton, mapType === 'hybrid' && styles.activeMapType]}
            onPress={() => setMapType('hybrid')}
          >
            <Text style={[styles.mapTypeText, mapType === 'hybrid' && styles.activeMapTypeText]}>{t('device_map.map_types.hybrid', { defaultValue: '🌍 Hybrid' })}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mapTypeRow}>
          <TouchableOpacity
            style={[styles.mapTypeButton, showGeofences && styles.activeMapType]}
            onPress={() => setShowGeofences(!showGeofences)}
          >
            <Text style={[styles.mapTypeText, showGeofences && styles.activeMapTypeText]}>
              {showGeofences ? t('device_map.hide_geofences', { defaultValue: 'Hide Geofences' }) : t('device_map.show_geofences', { defaultValue: 'Show Geofences' })}
            </Text>
          </TouchableOpacity>
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
          <Text style={styles.loadingText}>{t('device_map.loading', { defaultValue: 'Loading device locations & geofences...' })}</Text>
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
          mapType={getMapTypeValue()}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsCompass={true}
          showsScale={true}
          zoomControlEnabled={true}
          onMapReady={() => {
            setMapReady(true);
            if (devices.length > 0 || geofences.length > 0) {
              fitMapToAllFeatures(devices, geofences);
            }
          }}
          onError={(error) => {
            console.error('Map error:', error);
            setMapError(true);
          }}
        >
          {/* Device Markers */}
          {getFilteredDevices().map((device, index) => {
            if (!device.latitude || !device.longitude) return null;
            const latitude = parseFloat(device.latitude);
            const longitude = parseFloat(device.longitude);
            if (isNaN(latitude) || isNaN(longitude)) return null;

            return (
              <Marker
                key={device.id || index}
                coordinate={{ latitude, longitude }}
                title={device.deviceName || device.deviceSn}
                description={`${t('device_map.speed_label', { defaultValue: 'Speed' })}: ${formatSpeed(device.speedKmh)}`}
                onPress={() => {
                  setSelectedDeviceMarker(device);
                  setSelectedDevice(device);
                  setModalVisible(true);
                }}
              >
                <View style={[styles.customMarker, { borderColor: getMarkerColor(device.speedKmh) }]}>
                  <View style={[styles.markerInner, { backgroundColor: getMarkerColor(device.speedKmh) }]}>
                    <Text style={styles.markerText}>{getStatusIcon(device.speedKmh)}</Text>
                  </View>
                </View>
                <Callout>
                  <View style={styles.calloutContainer}>
                    <Text style={styles.calloutTitle}>{device.deviceName || device.deviceSn}</Text>
                    <Text style={styles.calloutText}>{t('device_map.speed_label', { defaultValue: 'Speed' })}: {formatSpeed(device.speedKmh)}</Text>
                    <Text style={styles.calloutText}>{t('device_map.mileage_label', { defaultValue: 'Mileage' })}: {Math.round(device.mileageKm || 0)} km</Text>
                    <Text style={styles.calloutText}>{t('device_map.updated_label', { defaultValue: 'Updated' })}: {formatDate(device.timestamp)}</Text>
                    <TouchableOpacity
                      style={styles.calloutButton}
                      onPress={() => {
                        setSelectedDevice(device);
                        setModalVisible(true);
                      }}
                    >
                      <Text style={styles.calloutButtonText}>{t('device_map.view_details', { defaultValue: 'View Details' })}</Text>
                    </TouchableOpacity>
                  </View>
                </Callout>
              </Marker>
            );
          })}

          {/* Geofences */}
          {showGeofences && geofences.map((geofence) => {
            if (geofence.fenceType === 'LINE' && geofence.coordinatesJson) {
              try {
                const points = JSON.parse(geofence.coordinatesJson);
                const coordinates = points.map(p => ({ latitude: p.lat, longitude: p.lng }));
                return (
                  <Polyline
                    key={geofence.id}
                    coordinates={coordinates}
                    strokeColor={geofence.colorHex || '#3b82f6'}
                    strokeWidth={3}
                    lineDashPattern={[5, 5]} // dashed line for routes
                  />
                );
              } catch (e) {
                console.warn('Failed to parse coordinates for route', geofence.id);
                return null;
              }
            } else if (geofence.fenceType === 'CIRCLE' && geofence.centerLat && geofence.centerLng && geofence.radiusMeters) {
              const center = { latitude: geofence.centerLat, longitude: geofence.centerLng };
              return (
                <Circle
                  key={geofence.id}
                  center={center}
                  radius={geofence.radiusMeters}
                  strokeColor={geofence.colorHex || '#ff0000'}
                  strokeWidth={2}
                  fillColor={`${geofence.colorHex || '#ff0000'}20`} // semi-transparent fill
                />
              );
            }
            return null;
          })}
        </MapView>

        {/* Center on current location button */}
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
              <Text style={styles.modalTitle}>{t('device_map.modal.title', { defaultValue: 'Device Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedDevice && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.modalStatusContainer}>
                  <View style={[styles.modalStatusDot, { backgroundColor: getMarkerColor(selectedDevice.speedKmh) }]} />
                  <Text style={styles.modalStatusText}>
                    {selectedDevice.speedKmh > 5 ? t('device_map.modal.moving', { defaultValue: 'Moving' }) : t('device_map.modal.stationary', { defaultValue: 'Stationary' })}
                  </Text>
                </View>

                <Text style={styles.modalDeviceName}>
                  {selectedDevice.deviceName || selectedDevice.deviceSn}
                </Text>

                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('device_map.modal.serial_number', { defaultValue: 'Serial Number' })}</Text>
                    <Text style={styles.infoValue}>{selectedDevice.deviceSn || t('device_map.na', { defaultValue: 'N/A' })}</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('device_map.modal.t1_number', { defaultValue: 'T1 Number' })}</Text>
                    <Text style={styles.infoValue}>{selectedDevice.t1Number || t('device_map.na', { defaultValue: 'N/A' })}</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('device_map.modal.speed', { defaultValue: 'Speed' })}</Text>
                    <Text style={styles.infoValue}>{formatSpeed(selectedDevice.speedKmh)}</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('device_map.modal.mileage', { defaultValue: 'Mileage' })}</Text>
                    <Text style={styles.infoValue}>{Math.round(selectedDevice.mileageKm || 0)} km</Text>
                  </View>
                </View>

                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>{t('device_map.modal.location', { defaultValue: 'Location' })}</Text>
                  <View style={styles.locationCard}>
                    <Text style={styles.locationLabel}>{t('device_map.modal.coordinates', { defaultValue: 'Coordinates' })}</Text>
                    <Text style={styles.locationValue}>
                      {selectedDevice.latitude?.toFixed(6) || t('device_map.na', { defaultValue: 'N/A' })}, {selectedDevice.longitude?.toFixed(6) || t('device_map.na', { defaultValue: 'N/A' })}
                    </Text>
                  </View>
                </View>

                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>{t('device_map.modal.last_update', { defaultValue: 'Last Update' })}</Text>
                  <View style={styles.timestampCard}>
                    <Text style={styles.timestampValue}>
                      {selectedDevice.timestamp ? new Date(selectedDevice.timestamp).toLocaleString() : t('device_map.na', { defaultValue: 'N/A' })}
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
                    <Text style={styles.centerButtonText}>{t('device_map.modal.center_on_map', { defaultValue: 'Center on Map' })}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeModalButtonText}>{t('device_map.modal.close', { defaultValue: 'Close' })}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animatable.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// Styles (same as before, plus one new line for the extra row)
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
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
  mapTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 8,
  },
  mapTypeButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  activeMapType: {
    backgroundColor: '#FFA500',
  },
  mapTypeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  activeMapTypeText: {
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  handleBarContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  panelHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  deviceListContainer: {
    maxHeight: BOTTOM_SHEET_MAX_HEIGHT - 70,
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
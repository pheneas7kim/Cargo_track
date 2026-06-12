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
  FlatList
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Polyline, Circle } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service (for future API calls if needed)
import { addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width, height } = Dimensions.get('window');

// ✅ Helper function to get language header (for potential future API calls)
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

const DeviceMapScreenView = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { geofence, hotspot, station, route: routeData } = route.params || {};

  // Determine which type of geofence we're viewing
  const geofenceData = geofence || hotspot || station || routeData;

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapType, setMapType] = useState('standard');
  const [showTraffic, setShowTraffic] = useState(false);
  const [coordinates, setCoordinates] = useState([]);
  const [centerLat, setCenterLat] = useState(null);
  const [centerLng, setCenterLng] = useState(null);
  const [radius, setRadius] = useState(null);
  const [polygonPoints, setPolygonPoints] = useState([]);

  const mapRef = useRef(null);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [cachedGeofenceData, setCachedGeofenceData] = useState(null);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events (for future API calls)
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in DeviceMapScreenView');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Device Map View Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            console.log('🌐 Back online in DeviceMapScreenView');
          }
        });

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

  // ========== OFFLINE: Cache geofence data ==========
  const cacheGeofenceData = async (data) => {
    if (!data) return;
    try {
      await OfflineDatabaseService.saveUserData(`geofence_view_${data.id || Date.now()}`, {
        data: data,
        timestamp: Date.now()
      });
      console.log('✅ Geofence data cached offline');
    } catch (error) {
      console.error('Error caching geofence data:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached geofence data ==========
  const loadCachedGeofenceData = async (geofenceId) => {
    try {
      const cached = await OfflineDatabaseService.getUserData(`geofence_view_${geofenceId}`);
      if (cached && cached.data) {
        console.log('📦 Loaded cached geofence data');
        return cached.data;
      }
      return null;
    } catch (error) {
      console.error('Error loading cached geofence data:', error);
      return null;
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  useEffect(() => {
    processGeofenceData();
    // ========== OFFLINE: Cache the data when online ==========
    if (geofenceData && isOnline) {
      cacheGeofenceData(geofenceData);
    }
    // ========== END OFFLINE CACHE ==========
  }, []);

  const processGeofenceData = () => {
    let dataToProcess = geofenceData;

    // ========== OFFLINE: If no data and offline, try to load cached ==========
    if (!dataToProcess && !isOnline) {
      console.log('📴 Offline mode: No geofence data provided, checking cache...');
      // Can't load specific cached data without an ID
      setLoading(false);
      // Default to Nairobi if no cached data
      setCenterLat(-1.286389);
      setCenterLng(36.817223);
      return;
    }
    // ========== END OFFLINE FALLBACK ==========

    if (!dataToProcess) {
      // Default to Nairobi if no data
      setCenterLat(-1.286389);
      setCenterLng(36.817223);
      setLoading(false);
      return;
    }

    // Handle LINE type (polygon/route)
    if (dataToProcess.fenceType === 'LINE' && dataToProcess.coordinatesJson) {
      try {
        const points = JSON.parse(dataToProcess.coordinatesJson);
        const formattedPoints = points.map(point => ({
          latitude: point.lat,
          longitude: point.lng
        }));
        setPolygonPoints(formattedPoints);

        // Calculate center for map view
        const lats = points.map(p => p.lat);
        const lngs = points.map(p => p.lng);
        const center = {
          latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
          longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        };
        setCenterLat(center.latitude);
        setCenterLng(center.longitude);
      } catch (e) {
        console.error('Failed to parse coordinates:', e);
      }
    }
    // Handle CIRCLE type (point with radius)
    else if (dataToProcess.fenceType === 'CIRCLE' && dataToProcess.centerLat && dataToProcess.centerLng) {
      setCenterLat(dataToProcess.centerLat);
      setCenterLng(dataToProcess.centerLng);
      setRadius(dataToProcess.radiusMeters);
    }
    // Fallback to device location
    else if (dataToProcess.centerLat && dataToProcess.centerLng) {
      setCenterLat(dataToProcess.centerLat);
      setCenterLng(dataToProcess.centerLng);
      setRadius(dataToProcess.radiusMeters);
    }

    setLoading(false);
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

  const getGeofenceColor = () => {
    return geofenceData?.colorHex || '#FFA500';
  };

  const getGeofenceType = () => {
    if (geofenceData?.hotspot) return t('device_map_view.types.hotspot', { defaultValue: 'Hotspot' });
    if (geofenceData?.route) return t('device_map_view.types.route', { defaultValue: 'Route' });
    if (geofenceData?.station) return t('device_map_view.types.station', { defaultValue: 'Station' });
    return t('device_map_view.types.geofence', { defaultValue: 'Geofence' });
  };

  const getGeofenceIcon = () => {
    if (geofenceData?.hotspot) return 'whatshot';
    if (geofenceData?.route) return 'route';
    if (geofenceData?.station) return 'location-on';
    return 'place';
  };

  const renderHeader = () => {
    return (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{geofenceData?.name || t('device_map_view.map_view', { defaultValue: 'Map View' })}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* ========== OFFLINE: Network status banner ========== */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached data</Text>
          </View>
        )}
        {/* ========== END OFFLINE BANNER ========== */}

        <View style={styles.mapControls}>
          <TouchableOpacity
            style={[styles.controlButton, showTraffic && styles.activeControl]}
            onPress={() => setShowTraffic(!showTraffic)}
          >
            <Icon name="traffic" size={18} color={showTraffic ? '#FFA500' : '#666'} />
            <Text style={[styles.controlText, showTraffic && styles.activeControlText]}>{t('device_map_view.traffic', { defaultValue: 'Traffic' })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              const types = ['standard', 'satellite', 'hybrid'];
              const currentIndex = types.indexOf(mapType);
              const nextIndex = (currentIndex + 1) % types.length;
              setMapType(types[nextIndex]);
            }}
          >
            <Icon name="layers" size={18} color="#666" />
            <Text style={styles.controlText}>
              {mapType === 'standard' ? t('device_map_view.map_types.standard', { defaultValue: 'Map' }) :
               mapType === 'satellite' ? t('device_map_view.map_types.satellite', { defaultValue: 'Satellite' }) :
               t('device_map_view.map_types.hybrid', { defaultValue: 'Hybrid' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderBottomInfo = () => {
    if (!geofenceData) return null;

    return (
      <View style={styles.bottomInfo}>
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={[styles.typeBadge, { backgroundColor: getGeofenceColor() + '20' }]}>
              <Icon name={getGeofenceIcon()} size={16} color={getGeofenceColor()} />
              <Text style={[styles.typeText, { color: getGeofenceColor() }]}>
                {getGeofenceType()}
              </Text>
            </View>
            <View style={[styles.activeBadge, geofenceData.isActive ? styles.active : styles.inactive]}>
              <Text style={styles.activeText}>
                {geofenceData.isActive ? t('device_map_view.active', { defaultValue: 'ACTIVE' }) : t('device_map_view.inactive', { defaultValue: 'INACTIVE' })}
              </Text>
            </View>
          </View>

          <Text style={styles.infoName}>{geofenceData.name}</Text>
          {geofenceData.description && (
            <Text style={styles.infoDescription}>{geofenceData.description}</Text>
          )}

          <View style={styles.infoDetails}>
            {radius && (
              <View style={styles.infoDetail}>
                <Icon name="radio-button-unchecked" size={16} color="#666" />
                <Text style={styles.infoDetailText}>{t('device_map_view.radius_label', { defaultValue: 'Radius' })}: {Math.round(radius)}m</Text>
              </View>
            )}
            {geofenceData.deviceCount !== undefined && (
              <View style={styles.infoDetail}>
                <Icon name="devices" size={16} color="#666" />
                <Text style={styles.infoDetailText}>{geofenceData.deviceCount} {t('device_map_view.devices', { defaultValue: 'devices' })}</Text>
              </View>
            )}
            {geofenceData.routeStatus && (
              <View style={styles.infoDetail}>
                <Icon name="flag" size={16} color="#666" />
                <Text style={[styles.infoDetailText, { color: geofenceData.routeStatus === 'ACTIVE' ? '#4CAF50' : '#FF6B6B' }]}>
                  {geofenceData.routeStatus === 'ACTIVE' ? t('device_map_view.active_status', { defaultValue: 'ACTIVE' }) : t('device_map_view.inactive_status', { defaultValue: 'INACTIVE' })}
                </Text>
              </View>
            )}
          </View>

          {geofenceData.assignedRouteIds && geofenceData.assignedRouteIds.length > 0 && (
            <View style={styles.routesContainer}>
              <Icon name="route" size={14} color="#999" />
              <Text style={styles.routesText}>
                {geofenceData.assignedRouteIds.length} {t('device_map_view.routes_assigned', { defaultValue: 'route(s) assigned' })}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.centerButton}
          onPress={() => {
            if (mapRef.current && centerLat && centerLng) {
              const region = {
                latitude: centerLat,
                longitude: centerLng,
                latitudeDelta: radius ? radius / 50000 : 0.05,
                longitudeDelta: radius ? radius / 50000 : 0.05,
              };
              mapRef.current.animateToRegion(region, 500);
            }
          }}
        >
          <Icon name="my-location" size={20} color="#FFFFFF" />
          <Text style={styles.centerButtonText}>{t('device_map_view.center_on_map', { defaultValue: 'Center on Map' })}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('device_map_view.loading', { defaultValue: 'Loading map...' })}</Text>
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
          mapType={getMapTypeValue()}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsTraffic={showTraffic}
          showsCompass={true}
          showsScale={true}
          zoomControlEnabled={true}
          onMapReady={() => {
            setMapReady(true);
            if (centerLat && centerLng) {
              setTimeout(() => {
                const region = {
                  latitude: centerLat,
                  longitude: centerLng,
                  latitudeDelta: radius ? radius / 50000 : 0.05,
                  longitudeDelta: radius ? radius / 50000 : 0.05,
                };
                mapRef.current?.animateToRegion(region, 1000);
              }, 500);
            }
          }}
        >
          {/* Draw polygon for LINE type */}
          {polygonPoints.length > 0 && (
            <>
              <Polyline
                coordinates={polygonPoints}
                strokeColor={getGeofenceColor()}
                strokeWidth={3}
                lineDashPattern={[5, 5]}
              />
              {polygonPoints.map((point, index) => (
                <Marker
                  key={`point-${index}`}
                  coordinate={point}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.pointMarker}>
                    <View style={[styles.pointInner, { backgroundColor: getGeofenceColor() }]} />
                  </View>
                </Marker>
              ))}
            </>
          )}

          {/* Draw circle for CIRCLE type */}
          {centerLat && centerLng && radius && (
            <Circle
              center={{ latitude: centerLat, longitude: centerLng }}
              radius={radius}
              strokeColor={getGeofenceColor()}
              strokeWidth={2}
              fillColor={getGeofenceColor() + '20'}
            />
          )}

          {/* Center marker */}
          {centerLat && centerLng && (
            <Marker
              coordinate={{ latitude: centerLat, longitude: centerLng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.centerMarker, { borderColor: getGeofenceColor() }]}>
                <View style={[styles.centerMarkerInner, { backgroundColor: getGeofenceColor() }]}>
                  <Icon name={getGeofenceIcon()} size={20} color="#FFFFFF" />
                </View>
              </View>
              <Callout>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>{geofenceData?.name}</Text>
                  <Text style={styles.calloutText}>{t('device_map_view.type_label', { defaultValue: 'Type' })}: {getGeofenceType()}</Text>
                  {radius && (
                    <Text style={styles.calloutText}>{t('device_map_view.radius_label', { defaultValue: 'Radius' })}: {Math.round(radius)}m</Text>
                  )}
                  {geofenceData?.deviceCount !== undefined && (
                    <Text style={styles.calloutText}>{t('device_map_view.devices_label', { defaultValue: 'Devices' })}: {geofenceData.deviceCount}</Text>
                  )}
                </View>
              </Callout>
            </Marker>
          )}
        </MapView>

        {/* My Location Button */}
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
      </View>

      {renderBottomInfo()}
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
  mapControls: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    gap: 6,
  },
  activeControl: {
    backgroundColor: '#FFA50020',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  controlText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  activeControlText: {
    color: '#FFA500',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  centerMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
  centerMarkerInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  pointInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  bottomInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  infoCard: {
    marginBottom: 12,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  active: {
    backgroundColor: '#4CAF5020',
  },
  inactive: {
    backgroundColor: '#FF6B6B20',
  },
  activeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
  },
  infoName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    lineHeight: 18,
  },
  infoDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  infoDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoDetailText: {
    fontSize: 12,
    color: '#666',
  },
  routesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routesText: {
    fontSize: 11,
    color: '#999',
  },
  centerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  centerButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
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
});

export default DeviceMapScreenView;
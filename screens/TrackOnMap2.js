import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Snackbar from 'react-native-snackbar';
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width, height } = Dimensions.get('window');
const API_BASE = 'https://demo2.bsl.co.ke';

const getAuthToken = async () => {
  try {
    return await AsyncStorage.getItem('accessToken');
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

const TrackOnMap = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { Ticket, t1Number } = route.params || {};
  const trackingNumber = Ticket?.trackingNumber || t1Number;

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapType, setMapType] = useState('standard');
  const [showTraffic, setShowTraffic] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [originCoord, setOriginCoord] = useState(null);
  const [destCoord, setDestCoord] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [hasCoordinates, setHasCoordinates] = useState(false);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineDataAvailable, setOfflineDataAvailable] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  const mapRef = useRef(null);
  let refreshInterval = useRef(null);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Track On Map');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online && autoRefresh) {
            // Restart auto-refresh when coming online
            startAutoRefresh();
            refreshLocation();
          }
          if (!online) {
            Snackbar.show({
              text: 'Offline mode - Showing cached location data',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load cached location data if available
        if (trackingNumber) {
          await loadCachedLocationData(trackingNumber);
        }

      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      NetworkMonitorService.cleanup();
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Load cached location data ==========
  const loadCachedLocationData = async (trackNum) => {
    try {
      const cachedData = await OfflineDatabaseService.getUserData(`tracking_${trackNum}`);
      if (cachedData && cachedData.location) {
        setCurrentLocation(cachedData.location);
        setLastUpdate(new Date(cachedData.timestamp));
        setOfflineDataAvailable(true);
        setHasCoordinates(true);
        console.log(`📦 Loaded cached location for ${trackNum}`);

        // Update map if ready
        if (mapRef.current && cachedData.location) {
          setTimeout(() => {
            mapRef.current.animateToRegion(
              {
                latitude: cachedData.location.latitude,
                longitude: cachedData.location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              500
            );
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error loading cached location:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Save location data to cache ==========
  const saveLocationToCache = async (trackNum, location) => {
    try {
      await OfflineDatabaseService.saveUserData(`tracking_${trackNum}`, {
        location: location,
        timestamp: Date.now(),
        trackingNumber: trackNum
      });
      console.log(`💾 Saved location for ${trackNum} to offline cache`);
    } catch (error) {
      console.error('Error saving location to cache:', error);
    }
  };
  // ========== END OFFLINE SAVE TO CACHE ==========

  // ========== OFFLINE: Save route data to cache ==========
  const saveRouteToCache = async (trackNum, routeData) => {
    try {
      await OfflineDatabaseService.saveUserData(`route_${trackNum}`, {
        originCoord: routeData.originCoord,
        destCoord: routeData.destCoord,
        routePoints: routeData.routePoints,
        timestamp: Date.now()
      });
      console.log(`💾 Saved route data for ${trackNum} to offline cache`);
    } catch (error) {
      console.error('Error saving route to cache:', error);
    }
  };
  // ========== END OFFLINE SAVE ROUTE ==========

  // ========== OFFLINE: Load cached route data ==========
  const loadCachedRouteData = async (trackNum) => {
    try {
      const cachedRoute = await OfflineDatabaseService.getUserData(`route_${trackNum}`);
      if (cachedRoute) {
        if (cachedRoute.originCoord) setOriginCoord(cachedRoute.originCoord);
        if (cachedRoute.destCoord) setDestCoord(cachedRoute.destCoord);
        if (cachedRoute.routePoints && cachedRoute.routePoints.length > 0) {
          setRoutePoints(cachedRoute.routePoints);
        }
        console.log(`📦 Loaded cached route data for ${trackNum}`);
      }
    } catch (error) {
      console.error('Error loading cached route:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED ROUTE ==========

  useEffect(() => {
    if (!trackingNumber) {
      Alert.alert('Error', 'No Ticket or T1 number provided');
      navigation.goBack();
      return;
    }

    // Load cached route data first
    loadCachedRouteData(trackingNumber);

    // Set coordinates directly from Ticket
    let initialOrigin = null;
    let initialDest = null;
    let initialLocation = null;

    if (Ticket) {
      // Set current location from Ticket data
      if (Ticket.latitude && Ticket.longitude) {
        initialLocation = {
          latitude: Ticket.latitude,
          longitude: Ticket.longitude,
        };
        setCurrentLocation(initialLocation);
        setHasCoordinates(true);
        // Save to cache
        saveLocationToCache(trackingNumber, initialLocation);
      }

      // Set origin coordinates
      if (Ticket.originCoord) {
        initialOrigin = Ticket.originCoord;
      } else if (Ticket.originLat && Ticket.originLng) {
        initialOrigin = { latitude: Ticket.originLat, longitude: Ticket.originLng };
      }
      setOriginCoord(initialOrigin);
      if (initialOrigin) setHasCoordinates(true);

      // Set destination coordinates
      if (Ticket.destCoord) {
        initialDest = Ticket.destCoord;
      } else if (Ticket.destLat && Ticket.destLng) {
        initialDest = { latitude: Ticket.destLat, longitude: Ticket.destLng };
      }
      setDestCoord(initialDest);
      if (initialDest) setHasCoordinates(true);

      // Set route points immediately
      if (initialOrigin && initialDest) {
        const points = [initialOrigin, initialDest];
        setRoutePoints(points);
        // Save route to cache
        saveRouteToCache(trackingNumber, {
          originCoord: initialOrigin,
          destCoord: initialDest,
          routePoints: points
        });
      }
    }

    setLoading(false);
    setLastUpdate(new Date());

    // Start auto-refresh if enabled
    if (autoRefresh) {
      startAutoRefresh();
    }

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  // Auto-zoom to fit all coordinates once map is ready
  useEffect(() => {
    if (mapReady && mapRef.current && hasCoordinates) {
      const coords = [];
      if (originCoord) coords.push(originCoord);
      if (destCoord) coords.push(destCoord);
      if (currentLocation) coords.push(currentLocation);

      if (coords.length > 0) {
        setTimeout(() => {
          mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }, 500);
      }
    }
  }, [mapReady, originCoord, destCoord, currentLocation, hasCoordinates]);

  const startAutoRefresh = () => {
    if (refreshInterval.current) clearInterval(refreshInterval.current);
    refreshInterval.current = setInterval(() => {
      // ========== OFFLINE: Only refresh when online ==========
      if (isOnline) {
        refreshLocation();
      }
      // ========== END OFFLINE CHECK ==========
    }, 10000);
  };

  const stopAutoRefresh = () => {
    if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
      refreshInterval.current = null;
    }
  };

  const refreshLocation = async () => {
    if (!trackingNumber) return;
    setRefreshing(true);
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log('📴 Offline - using cached location data');
        await loadCachedLocationData(trackingNumber);
        Snackbar.show({
          text: 'Offline - Showing cached location',
          duration: 2000,
          backgroundColor: '#FF9800',
        });
        setRefreshing(false);
        return;
      }
      // ========== END OFFLINE CHECK ==========

      const token = await getAuthToken();
      if (!token) throw new Error('No token');

      const response = await fetch(`${API_BASE}/api/v1/telemetry/by-t1/${trackingNumber}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch telemetry');
      const device = await response.json();

      if (device && device.latitude && device.longitude) {
        const newLoc = {
          latitude: device.latitude,
          longitude: device.longitude,
        };

        setCurrentLocation(newLoc);
        setLastUpdate(new Date());
        setHasCoordinates(true);

        // ========== OFFLINE: Save to cache ==========
        await saveLocationToCache(trackingNumber, newLoc);
        // ========== END OFFLINE SAVE ==========

        if (mapRef.current) {
          mapRef.current.animateToRegion(
            {
              latitude: newLoc.latitude,
              longitude: newLoc.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            500
          );
        }
      } else {
        // Try to load from cache if device not found
        await loadCachedLocationData(trackingNumber);
      }
    } catch (error) {
      console.error('Refresh error:', error);

      // ========== OFFLINE: Fall back to cached data on error ==========
      await loadCachedLocationData(trackingNumber);
      Snackbar.show({
        text: 'Using cached location (server unavailable)',
        duration: 2000,
        backgroundColor: '#FF9800',
      });
      // ========== END OFFLINE FALLBACK ==========
    } finally {
      setRefreshing(false);
    }
  };

  // ========== OFFLINE: Manual refresh with offline awareness ==========
  const manualRefreshLocation = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot refresh while offline',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }
    await refreshLocation();
  };
  // ========== END OFFLINE MANUAL REFRESH ==========

  // ========== OFFLINE: Get last update display with cached indicator ==========
  const getLastUpdateDisplay = () => {
    if (!lastUpdate) return 'N/A';
    if (!isOnline && offlineDataAvailable) {
      return `${lastUpdate.toLocaleTimeString()} (cached)`;
    }
    return lastUpdate.toLocaleTimeString();
  };
  // ========== END OFFLINE TIMESTAMP ==========

  const getMapTypeValue = () => {
    switch (mapType) {
      case 'satellite':
        return 'satellite';
      case 'hybrid':
        return 'hybrid';
      default:
        return 'standard';
    }
  };

  const getStatusColor = () => {
    return Ticket?.statusColor || '#FFA500';
  };

  const centerOnLocation = (lat, lng, zoomLevel = 0.01) => {
    if (mapRef.current && lat && lng) {
      mapRef.current.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: zoomLevel,
          longitudeDelta: zoomLevel,
        },
        500
      );
    }
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => {
      const newVal = !prev;
      if (newVal && isOnline) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
      return newVal;
    });
  };

  // Calculate initial region based on available Ticket data
  const getInitialRegion = () => {
    // Priority 1: Current location from Ticket
    if (Ticket?.latitude && Ticket?.longitude) {
      return {
        latitude: Ticket.latitude,
        longitude: Ticket.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    // Priority 2: Origin coordinates
    if (Ticket?.originLat && Ticket?.originLng) {
      return {
        latitude: Ticket.originLat,
        longitude: Ticket.originLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Priority 3: Destination coordinates
    if (Ticket?.destLat && Ticket?.destLng) {
      return {
        latitude: Ticket.destLat,
        longitude: Ticket.destLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Priority 4: Origin Coord object
    if (Ticket?.originCoord) {
      return {
        latitude: Ticket.originCoord.latitude,
        longitude: Ticket.originCoord.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Priority 5: Destination Coord object
    if (Ticket?.destCoord) {
      return {
        latitude: Ticket.destCoord.latitude,
        longitude: Ticket.destCoord.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Fallback to Kenya (should not happen if data is valid)
    return {
      latitude: -1.286389,
      longitude: 36.817223,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Device</Text>
        <View style={styles.placeholder} />
      </View>

      {/* ========== OFFLINE: Status indicator ========== */}
      {!isOnline && (
        <View style={styles.offlineStatusIndicator}>
          <Icon name="wifi-off" size={14} color="#FF9800" />
          <Text style={styles.offlineStatusText}>Offline Mode - Showing cached location</Text>
        </View>
      )}
      {/* ========== END OFFLINE INDICATOR ========== */}

      <View style={styles.mapControls}>
        <TouchableOpacity
          style={[styles.controlButton, showTraffic && styles.activeControl]}
          onPress={() => setShowTraffic(!showTraffic)}
        >
          <Icon name="traffic" size={18} color={showTraffic ? '#FFA500' : '#666'} />
          <Text style={[styles.controlText, showTraffic && styles.activeControlText]}>Traffic</Text>
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
            {mapType === 'standard' ? 'Map' : mapType === 'satellite' ? 'Satellite' : 'Hybrid'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, autoRefresh && styles.activeControl]}
          onPress={toggleAutoRefresh}
        >
          <Icon name="autorenew" size={18} color={autoRefresh ? '#FFA500' : '#666'} />
          <Text style={[styles.controlText, autoRefresh && styles.activeControlText]}>Auto</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBottomInfo = () => (
    <View style={styles.bottomInfo}>
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={[styles.typeBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <Icon name="local-shipping" size={16} color={getStatusColor()} />
            <Text style={[styles.typeText, { color: getStatusColor() }]}>
              {Ticket?.status || 'In Transit'}
            </Text>
          </View>
          {refreshing && <ActivityIndicator size="small" color="#FFA500" />}
        </View>

        <Text style={styles.infoName}>
          {Ticket?.trackingNumber || trackingNumber}
        </Text>
        <Text style={styles.infoDescription}>
          {Ticket?.deviceName || Ticket?.deviceSn || 'Device Tracking'}
        </Text>

        <View style={styles.infoDetails}>
          <View style={styles.infoDetail}>
            <Icon name="place" size={16} color="#666" />
            <Text style={styles.infoDetailText}>
              {Ticket?.origin || 'Origin'} → {Ticket?.destination || 'Destination'}
            </Text>
          </View>
          <View style={styles.infoDetail}>
            <Icon name="update" size={16} color="#666" />
            <Text style={styles.infoDetailText}>
              Last Update: {getLastUpdateDisplay()}
            </Text>
          </View>
          {Ticket?.speedKmh !== undefined && (
            <View style={styles.infoDetail}>
              <Icon name="speed" size={16} color="#666" />
              <Text style={styles.infoDetailText}>Speed: {Ticket.speedKmh} km/h</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.centerButtonsRow}>
        {currentLocation && (
          <TouchableOpacity
            style={styles.centerButton}
            onPress={() => centerOnLocation(currentLocation.latitude, currentLocation.longitude, 0.01)}
          >
            <Icon name="my-location" size={20} color="#FFFFFF" />
            <Text style={styles.centerButtonText}>Current</Text>
          </TouchableOpacity>
        )}
        {originCoord && (
          <TouchableOpacity
            style={styles.centerButton}
            onPress={() => centerOnLocation(originCoord.latitude, originCoord.longitude, 0.02)}
          >
            <Icon name="flag" size={20} color="#FFFFFF" />
            <Text style={styles.centerButtonText}>Origin</Text>
          </TouchableOpacity>
        )}
        {destCoord && (
          <TouchableOpacity
            style={styles.centerButton}
            onPress={() => centerOnLocation(destCoord.latitude, destCoord.longitude, 0.02)}
          >
            <Icon name="location-on" size={20} color="#FFFFFF" />
            <Text style={styles.centerButtonText}>Destination</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.centerButton, styles.refreshButton]} onPress={manualRefreshLocation}>
          <Icon name="refresh" size={20} color="#FFFFFF" />
          <Text style={styles.centerButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Show loading while checking for coordinates
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If no coordinates available after loading, show error
  if (!hasCoordinates && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <Icon name="location-off" size={64} color="#FF6B6B" />
          <Text style={styles.errorText}>No location data available</Text>
          <Text style={styles.errorSubtext}>Unable to display map coordinates</Text>
          <TouchableOpacity
            style={styles.goBackButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
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
          onMapReady={() => setMapReady(true)}
          initialRegion={getInitialRegion()}
        >
          {routePoints.length > 0 && (
            <Polyline
              coordinates={routePoints}
              strokeColor={getStatusColor()}
              strokeWidth={3}
              lineDashPattern={[5, 5]}
            />
          )}

          {currentLocation && (
            <Marker
              coordinate={currentLocation}
              title="Current Location"
              description={Ticket?.location || 'Device current position'}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.centerMarker, { borderColor: getStatusColor() }]}>
                <View style={[styles.centerMarkerInner, { backgroundColor: getStatusColor() }]}>
                  <Icon name="local-shipping" size={20} color="#FFFFFF" />
                </View>
              </View>
              <Callout>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>{Ticket?.trackingNumber || trackingNumber}</Text>
                  <Text style={styles.calloutText}>Status: {Ticket?.status || 'Active'}</Text>
                  {Ticket?.speedKmh && <Text style={styles.calloutText}>Speed: {Ticket.speedKmh} km/h</Text>}
                  {/* ========== OFFLINE: Cache indicator in callout ========== */}
                  {!isOnline && (
                    <Text style={styles.cachedCalloutText}>📴 Cached location</Text>
                  )}
                  {/* ========== END OFFLINE INDICATOR ========== */}
                </View>
              </Callout>
            </Marker>
          )}

          {originCoord && (
            <Marker coordinate={originCoord} title="Origin" description={Ticket?.origin} pinColor="#4CAF50">
              <Callout>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>Origin</Text>
                  <Text style={styles.calloutText}>{Ticket?.origin}</Text>
                </View>
              </Callout>
            </Marker>
          )}

          {destCoord && (
            <Marker coordinate={destCoord} title="Destination" description={Ticket?.destination} pinColor="#2196F3">
              <Callout>
                <View style={styles.calloutContainer}>
                  <Text style={styles.calloutTitle}>Destination</Text>
                  <Text style={styles.calloutText}>{Ticket?.destination}</Text>
                </View>
              </Callout>
            </Marker>
          )}
        </MapView>

        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion(
                {
                  latitude: -1.286389,
                  longitude: 36.817223,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                },
                500
              );
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
  container: { flex: 1, backgroundColor: '#F8F9FA' },
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
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  placeholder: { width: 40 },
  // ========== OFFLINE STYLES ==========
  offlineStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  offlineStatusText: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: '500',
  },
  cachedCalloutText: {
    fontSize: 10,
    color: '#FF9800',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // ========== END OFFLINE STYLES ==========
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
  activeControl: { backgroundColor: '#FFA50020', borderWidth: 1, borderColor: '#FFA500' },
  controlText: { fontSize: 12, fontWeight: '500', color: '#666' },
  activeControlText: { color: '#FFA500' },
  mapContainer: { flex: 1, position: 'relative' },
  map: { width: '100%', height: '100%' },
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
  infoCard: { marginBottom: 12 },
  infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 6 },
  typeText: { fontSize: 12, fontWeight: '600' },
  infoName: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  infoDescription: { fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 18 },
  infoDetails: { gap: 8 },
  infoDetail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoDetailText: { fontSize: 12, color: '#666', flex: 1 },
  centerButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  centerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  refreshButton: { backgroundColor: '#2196F3' },
  centerButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  calloutContainer: { padding: 8, minWidth: 150 },
  calloutTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  calloutText: { fontSize: 11, color: '#666', marginBottom: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  errorText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#FF6B6B' },
  errorSubtext: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  goBackButton: {
    marginTop: 24,
    backgroundColor: '#FFA500',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goBackButtonText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
});

export default TrackOnMap;
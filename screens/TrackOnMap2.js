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

  const mapRef = useRef(null);
  let refreshInterval = useRef(null);

  useEffect(() => {
    if (!trackingNumber) {
      Alert.alert('Error', 'No Ticket or T1 number provided');
      navigation.goBack();
      return;
    }

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
        setRoutePoints([initialOrigin, initialDest]);
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
      refreshLocation();
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
      }
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

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
      if (newVal) {
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
              Last Update: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'N/A'}
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
        <TouchableOpacity style={[styles.centerButton, styles.refreshButton]} onPress={refreshLocation}>
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
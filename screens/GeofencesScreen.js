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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';

const { width, height } = Dimensions.get('window');

const GeofencesScreen = () => {
  const navigation = useNavigation();
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGeofence, setSelectedGeofence] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, hotspot, route, station
  
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

  useFocusEffect(
    React.useCallback(() => {
      fetchGeofences();
      
      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const fetchGeofences = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        console.error('No token found');
        return;
      }

      const response = await axios.get(
        `${serverUrl}/geofences?size=1000`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data && response.data.content) {
        setGeofences(response.data.content);
      } else if (response.data && Array.isArray(response.data)) {
        setGeofences(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch geofences:', error);
      Snackbar.show({
        text: 'Failed to load geofences',
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
    fetchGeofences(true);
  };

  const getFilteredGeofences = () => {
    let filtered = [...geofences];
    
    // Filter by type
    if (filterType === 'hotspot') {
      filtered = filtered.filter(g => g.hotspot === true);
    } else if (filterType === 'route') {
      filtered = filtered.filter(g => g.route === true);
    } else if (filterType === 'station') {
      filtered = filtered.filter(g => g.station === true);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.name?.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)} hr ago`;
    return date.toLocaleDateString();
  };

  const formatCoordinates = (lat, lng) => {
    if (!lat || !lng) return 'N/A';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const formatRadius = (meters) => {
    if (!meters) return 'N/A';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const getTypeIcon = (item) => {
    if (item.hotspot) return 'whatshot';
    if (item.route) return 'route';
    if (item.station) return 'location-on';
    return 'place';
  };

  const getTypeColor = (item) => {
    if (item.hotspot) return '#FF6B6B';
    if (item.route) return '#4CAF50';
    if (item.station) return '#2196F3';
    return '#FFA500';
  };

  const getTypeName = (item) => {
    if (item.hotspot) return 'HOTSPOT';
    if (item.route) return 'ROUTE';
    if (item.station) return 'STATION';
    return 'GEOFENCE';
  };

  const getFenceTypeIcon = (fenceType) => {
    return fenceType === 'LINE' ? 'show-chart' : 'radio-button-unchecked';
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderGeofenceCard = ({ item, index }) => {
    const isExpanded = expandedId === item.id;
    const typeIcon = getTypeIcon(item);
    const typeColor = getTypeColor(item);
    const typeName = getTypeName(item);
    
    return (
      <Animatable.View 
        animation="fadeInUp" 
        delay={index * 80}
        duration={400}
        style={styles.animationWrapper}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => toggleExpand(item.id)}
          onLongPress={() => {
            setSelectedGeofence(item);
            setModalVisible(true);
          }}
          delayLongPress={200}
        >
          <View style={[styles.geofenceCard, { borderLeftColor: item.colorHex || typeColor }]}>
            <View style={styles.cardHeader}>
              <View style={styles.titleContainer}>
                <View style={[styles.typeIconContainer, { backgroundColor: typeColor + '20' }]}>
                  <Icon name={typeIcon} size={20} color={typeColor} />
                </View>
                <Text style={styles.geofenceName}>{item.name}</Text>
              </View>
              <View style={[styles.activeBadge, item.isActive ? styles.active : styles.inactive]}>
                <Text style={styles.activeText}>
                  {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Text>
              </View>
            </View>

            <View style={styles.typeBadge}>
              <Text style={[styles.typeText, { color: typeColor }]}>
                {typeName}
              </Text>
              <View style={[styles.fenceTypeBadge, { backgroundColor: '#F5F5F5' }]}>
                <Icon name={getFenceTypeIcon(item.fenceType)} size={12} color="#666" />
                <Text style={styles.fenceTypeText}>{item.fenceType || 'CIRCLE'}</Text>
              </View>
            </View>

            <Text style={styles.description} numberOfLines={isExpanded ? undefined : 2}>
              {item.description || 'No description available'}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Icon name="devices" size={14} color="#666" />
                <Text style={styles.statText}>{item.deviceCount || 0} devices</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="flag" size={14} color="#666" />
                <Text style={[styles.statText, { color: item.routeStatus === 'ACTIVE' ? '#4CAF50' : '#FF6B6B' }]}>
                  {item.routeStatus || 'ACTIVE'}
                </Text>
              </View>
            </View>

            {isExpanded && (
              <Animatable.View animation="fadeIn" duration={300} style={styles.expandedContent}>
                <View style={styles.divider} />
                
                <View style={styles.detailRow}>
                  <Icon name="location-on" size={16} color="#999" />
                  <Text style={styles.detailLabel}>Coordinates:</Text>
                  {item.centerLat ? (
                    <Text style={styles.detailValue}>
                      {formatCoordinates(item.centerLat, item.centerLng)}
                    </Text>
                  ) : (
                    <Text style={styles.detailValue}>Polygon (LINE)</Text>
                  )}
                </View>
                
                {item.radiusMeters && (
                  <View style={styles.detailRow}>
                    <Icon name="radio-button-unchecked" size={16} color="#999" />
                    <Text style={styles.detailLabel}>Radius:</Text>
                    <Text style={styles.detailValue}>{formatRadius(item.radiusMeters)}</Text>
                  </View>
                )}
                
                {item.stationType && (
                  <View style={styles.detailRow}>
                    <Icon name="info" size={16} color="#999" />
                    <Text style={styles.detailLabel}>Station Type:</Text>
                    <Text style={styles.detailValue}>{item.stationType?.replace('_', ' ')}</Text>
                  </View>
                )}
                
                {item.assignedRouteIds && item.assignedRouteIds.length > 0 && (
                  <View style={styles.detailRow}>
                    <Icon name="route" size={16} color="#999" />
                    <Text style={styles.detailLabel}>Assigned Routes:</Text>
                    <Text style={styles.detailValue}>{item.assignedRouteIds.length} route(s)</Text>
                  </View>
                )}
                
                <View style={styles.detailRow}>
                  <Icon name="access-time" size={16} color="#999" />
                  <Text style={styles.detailLabel}>Created:</Text>
                  <Text style={styles.detailValue}>{formatDate(item.createdAt)}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Icon name="update" size={16} color="#999" />
                  <Text style={styles.detailLabel}>Updated:</Text>
                  <Text style={styles.detailValue}>{formatDate(item.updatedAt)}</Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.viewOnMapButton}
                  onPress={() => {
                    navigation.navigate('DeviceMapScreenView', { 
                      geofence: item 
                    });
                  }}
                >
                  <Icon name="map" size={18} color="#FFA500" />
                  <Text style={styles.viewOnMapText}>View on Map</Text>
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
    const filteredGeofences = getFilteredGeofences();
    const hotspotCount = geofences.filter(g => g.hotspot).length;
    const routeCount = geofences.filter(g => g.route).length;
    const stationCount = geofences.filter(g => g.station).length;
    
    return (
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Geofences</Text>
          <View style={styles.headerRight}>
            <Text style={styles.countBadge}>{filteredGeofences.length}</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search geofences..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'all' && styles.activeFilter]}
            onPress={() => setFilterType('all')}
          >
            <Icon name="view-list" size={18} color={filterType === 'all' ? '#FFA500' : '#666'} />
            <Text style={[styles.filterText, filterType === 'all' && styles.activeFilterText]}>All</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'hotspot' && styles.activeFilter]}
            onPress={() => setFilterType('hotspot')}
          >
            <Icon name="whatshot" size={18} color={filterType === 'hotspot' ? '#FF6B6B' : '#666'} />
            <Text style={[styles.filterText, filterType === 'hotspot' && styles.activeFilterText]}>
              Hotspots ({hotspotCount})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'route' && styles.activeFilter]}
            onPress={() => setFilterType('route')}
          >
            <Icon name="route" size={18} color={filterType === 'route' ? '#4CAF50' : '#666'} />
            <Text style={[styles.filterText, filterType === 'route' && styles.activeFilterText]}>
              Routes ({routeCount})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.filterButton, filterType === 'station' && styles.activeFilter]}
            onPress={() => setFilterType('station')}
          >
            <Icon name="location-on" size={18} color={filterType === 'station' ? '#2196F3' : '#666'} />
            <Text style={[styles.filterText, filterType === 'station' && styles.activeFilterText]}>
              Stations ({stationCount})
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{geofences.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
              {geofences.filter(g => g.isActive).length}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>
              {geofences.filter(g => !g.isActive).length}
            </Text>
            <Text style={styles.statLabel}>Inactive</Text>
          </View>
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
          <Text style={styles.loadingText}>Loading geofences...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredGeofences = getFilteredGeofences();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      
      <FlatList
        data={filteredGeofences}
        keyExtractor={item => item.id.toString()}
        renderItem={renderGeofenceCard}
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
            <Icon name="place" size={80} color="#CCC" />
            <Text style={styles.emptyTitle}>No geofences found</Text>
            <Text style={styles.emptyText}>
              {searchQuery 
                ? 'Try adjusting your search' 
                : 'No geofences have been created yet'}
            </Text>
          </Animatable.View>
        }
      />

      {/* Geofence Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Geofence Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            
            {selectedGeofence && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Status Header */}
                <View style={styles.modalStatusHeader}>
                  <View style={[styles.modalStatusBadge, selectedGeofence.isActive ? styles.modalActive : styles.modalInactive]}>
                    <Text style={styles.modalStatusText}>
                      {selectedGeofence.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>

                {/* Type Header */}
                <View style={styles.modalTypeContainer}>
                  <Icon 
                    name={getTypeIcon(selectedGeofence)} 
                    size={32} 
                    color={getTypeColor(selectedGeofence)} 
                  />
                  <Text style={[styles.modalTypeText, { color: getTypeColor(selectedGeofence) }]}>
                    {getTypeName(selectedGeofence)}
                  </Text>
                </View>

                {/* Geofence Name */}
                <Text style={styles.modalGeofenceName}>{selectedGeofence.name}</Text>
                
                {/* Description */}
                {selectedGeofence.description && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Description</Text>
                    <Text style={styles.modalDescription}>{selectedGeofence.description}</Text>
                  </View>
                )}

                {/* Location Info */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Location</Text>
                  <View style={styles.locationCard}>
                    <View style={styles.locationRow}>
                      <Icon name="place" size={18} color="#FFA500" />
                      <Text style={styles.locationLabel}>Type:</Text>
                      <Text style={styles.locationValue}>{selectedGeofence.fenceType || 'CIRCLE'}</Text>
                    </View>
                    {selectedGeofence.centerLat ? (
                      <>
                        <View style={styles.locationRow}>
                          <Icon name="location-on" size={18} color="#FFA500" />
                          <Text style={styles.locationLabel}>Coordinates:</Text>
                          <Text style={styles.locationValue}>
                            {formatCoordinates(selectedGeofence.centerLat, selectedGeofence.centerLng)}
                          </Text>
                        </View>
                        <View style={styles.locationRow}>
                          <Icon name="radio-button-unchecked" size={18} color="#FFA500" />
                          <Text style={styles.locationLabel}>Radius:</Text>
                          <Text style={styles.locationValue}>{formatRadius(selectedGeofence.radiusMeters)}</Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.locationRow}>
                        <Icon name="show-chart" size={18} color="#FFA500" />
                        <Text style={styles.locationLabel}>Polygon:</Text>
                        <Text style={styles.locationValue}>Line route with multiple points</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Details Grid */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Details</Text>
                  <View style={styles.detailsGrid}>
                    <View style={styles.detailCard}>
                      <Icon name="devices" size={20} color="#666" />
                      <Text style={styles.detailCardLabel}>Devices</Text>
                      <Text style={styles.detailCardValue}>{selectedGeofence.deviceCount || 0}</Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Icon name="flag" size={20} color="#666" />
                      <Text style={styles.detailCardLabel}>Route Status</Text>
                      <Text style={[styles.detailCardValue, { color: selectedGeofence.routeStatus === 'ACTIVE' ? '#4CAF50' : '#FF6B6B' }]}>
                        {selectedGeofence.routeStatus || 'ACTIVE'}
                      </Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Icon name="palette" size={20} color="#666" />
                      <Text style={styles.detailCardLabel}>Color</Text>
                      <View style={styles.colorPreview}>
                        <View style={[styles.colorBox, { backgroundColor: selectedGeofence.colorHex || '#FFA500' }]} />
                        <Text style={styles.detailCardValue}>{selectedGeofence.colorHex || '#FFA500'}</Text>
                      </View>
                    </View>
                    {selectedGeofence.stationType && (
                      <View style={styles.detailCard}>
                        <Icon name="info" size={20} color="#666" />
                        <Text style={styles.detailCardLabel}>Station Type</Text>
                        <Text style={styles.detailCardValue}>{selectedGeofence.stationType?.replace('_', ' ')}</Text>
                      </View>
                    )}
                    {selectedGeofence.assignedRouteIds && selectedGeofence.assignedRouteIds.length > 0 && (
                      <View style={styles.detailCard}>
                        <Icon name="route" size={20} color="#666" />
                        <Text style={styles.detailCardLabel}>Assigned Routes</Text>
                        <Text style={styles.detailCardValue}>{selectedGeofence.assignedRouteIds.length} route(s)</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Timestamps */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Timestamps</Text>
                  <View style={styles.timestampCard}>
                    <View style={styles.timestampRow}>
                      <Icon name="access-time" size={16} color="#999" />
                      <Text style={styles.timestampLabel}>Created:</Text>
                      <Text style={styles.timestampValue}>
                        {new Date(selectedGeofence.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.timestampRow}>
                      <Icon name="update" size={16} color="#999" />
                      <Text style={styles.timestampLabel}>Updated:</Text>
                      <Text style={styles.timestampValue}>
                        {new Date(selectedGeofence.updatedAt).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <TouchableOpacity 
                  style={styles.viewMapModalButton}
                  onPress={() => {
                    setModalVisible(false);
                    navigation.navigate('DeviceMap', { 
                      geofence: selectedGeofence 
                    });
                  }}
                >
                  <Icon name="map" size={20} color="#FFFFFF" />
                  <Text style={styles.viewMapModalButtonText}>View on Map</Text>
                </TouchableOpacity>

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
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  countBadge: {
    backgroundColor: '#FFA500',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
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
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
    marginLeft: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    gap: 6,
  },
  activeFilter: {
    backgroundColor: '#FFA50020',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  activeFilterText: {
    color: '#FFA500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 12,
    borderRadius: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
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
  geofenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  geofenceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
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
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fenceTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  fenceTypeText: {
    fontSize: 10,
    color: '#666',
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: '#666',
  },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
    width: 100,
  },
  detailValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  viewOnMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFA50010',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  viewOnMapText: {
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 20,
  },
  modalStatusHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modalActive: {
    backgroundColor: '#4CAF5020',
  },
  modalInactive: {
    backgroundColor: '#FF6B6B20',
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  modalTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modalTypeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalGeofenceName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  locationCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationLabel: {
    fontSize: 12,
    color: '#999',
    width: 70,
  },
  locationValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  detailCardLabel: {
    fontSize: 11,
    color: '#999',
  },
  detailCardValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  colorPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  timestampCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timestampLabel: {
    fontSize: 12,
    color: '#999',
    width: 60,
  },
  timestampValue: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
  viewMapModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  viewMapModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  closeModalButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  closeModalButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default GeofencesScreen;
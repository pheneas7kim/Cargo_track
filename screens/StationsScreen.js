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
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const { width, height } = Dimensions.get('window');

// ✅ Helper function to get language header
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

// ✅ Helper function to make authenticated axios request with retry on 401
const authenticatedAxios = async (axiosInstance, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    const response = await axiosInstance({
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    return response;
  } catch (error) {
    if (error.response?.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedAxios(axiosInstance, config, i18n, 1);
      }
    }
    throw error;
  }
};

const StationsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, checkpoint, bus_stop

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in StationsScreen');
    });
    return () => removeListener();
  }, []);

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
      fetchStations();

      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const fetchStations = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const response = await authenticatedAxios(
        axios.get,
        {
          url: `${serverUrl}/geofences/stations?size=1000`,
        },
        i18n
      );

      if (response.data && response.data.content) {
        setStations(response.data.content);
      } else if (response.data && Array.isArray(response.data)) {
        setStations(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch stations:', error);
      Snackbar.show({
        text: t('stations.errors.load_failed', { defaultValue: 'Failed to load stations' }),
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
    fetchStations(true);
  };

  const getFilteredStations = () => {
    let filtered = [...stations];

    // Filter by station type
    if (filterType === 'checkpoint') {
      filtered = filtered.filter(s => s.stationType === 'CHECKPOINT');
    } else if (filterType === 'bus_stop') {
      filtered = filtered.filter(s => s.stationType === 'BUS_STOP');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('stations.na', { defaultValue: 'N/A' });
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 1) return t('stations.time.just_now', { defaultValue: 'Just now' });
    if (diff < 60) return t('stations.time.minutes_ago', { defaultValue: '{{count}} min ago' }).replace('{{count}}', diff.toString());
    if (diff < 1440) return t('stations.time.hours_ago', { defaultValue: '{{count}} hr ago' }).replace('{{count}}', Math.floor(diff / 60).toString());
    return date.toLocaleDateString();
  };

  const formatCoordinates = (lat, lng) => {
    if (!lat || !lng) return t('stations.na', { defaultValue: 'N/A' });
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const formatRadius = (meters) => {
    if (!meters) return t('stations.na', { defaultValue: 'N/A' });
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const getStationTypeIcon = (type) => {
    switch(type) {
      case 'CHECKPOINT':
        return 'check-circle';
      case 'BUS_STOP':
        return 'directions-bus';
      default:
        return 'location-on';
    }
  };

  const getStationTypeColor = (type) => {
    switch(type) {
      case 'CHECKPOINT':
        return '#4CAF50';
      case 'BUS_STOP':
        return '#2196F3';
      default:
        return '#FFA500';
    }
  };

  const getStationTypeName = (type) => {
    switch(type) {
      case 'CHECKPOINT':
        return t('stations.types.checkpoint', { defaultValue: 'CHECKPOINT' });
      case 'BUS_STOP':
        return t('stations.types.bus_stop', { defaultValue: 'BUS STOP' });
      default:
        return t('stations.types.station', { defaultValue: 'STATION' });
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderStationCard = ({ item, index }) => {
    const isExpanded = expandedId === item.id;
    const stationTypeIcon = getStationTypeIcon(item.stationType);
    const stationTypeColor = getStationTypeColor(item.stationType);
    const stationTypeName = getStationTypeName(item.stationType);

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
            setSelectedStation(item);
            setModalVisible(true);
          }}
          delayLongPress={200}
        >
          <View style={[styles.stationCard, { borderLeftColor: item.colorHex || stationTypeColor }]}>
            <View style={styles.cardHeader}>
              <View style={styles.titleContainer}>
                <View style={[styles.typeIconContainer, { backgroundColor: stationTypeColor + '20' }]}>
                  <Icon name={stationTypeIcon} size={20} color={stationTypeColor} />
                </View>
                <Text style={styles.stationName}>{item.name}</Text>
              </View>
              <View style={[styles.activeBadge, item.isActive ? styles.active : styles.inactive]}>
                <Text style={styles.activeText}>
                  {item.isActive ? t('stations.active', { defaultValue: 'ACTIVE' }) : t('stations.inactive', { defaultValue: 'INACTIVE' })}
                </Text>
              </View>
            </View>

            <View style={styles.typeBadge}>
              <Text style={[styles.typeText, { color: stationTypeColor }]}>
                {stationTypeName}
              </Text>
            </View>

            <Text style={styles.description} numberOfLines={isExpanded ? undefined : 2}>
              {item.description || t('stations.no_description', { defaultValue: 'No description available' })}
            </Text>

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Icon name="location-on" size={14} color="#666" />
                <Text style={styles.infoText}>
                  {formatCoordinates(item.centerLat, item.centerLng)}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Icon name="radio-button-unchecked" size={14} color="#666" />
                <Text style={styles.infoText}>{formatRadius(item.radiusMeters)}</Text>
              </View>
            </View>

            {isExpanded && (
              <Animatable.View animation="fadeIn" duration={300} style={styles.expandedContent}>
                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Icon name="info" size={16} color="#999" />
                  <Text style={styles.detailLabel}>{t('stations.fence_type_label', { defaultValue: 'Fence Type' })}:</Text>
                  <Text style={styles.detailValue}>{item.fenceType || 'CIRCLE'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Icon name="flag" size={16} color="#999" />
                  <Text style={styles.detailLabel}>{t('stations.route_status_label', { defaultValue: 'Route Status' })}:</Text>
                  <Text style={[styles.detailValue, { color: item.routeStatus === 'ACTIVE' ? '#4CAF50' : '#FF6B6B' }]}>
                    {item.routeStatus || 'ACTIVE'}
                  </Text>
                </View>

                {item.assignedRouteIds && item.assignedRouteIds.length > 0 && (
                  <View style={styles.detailRow}>
                    <Icon name="route" size={16} color="#999" />
                    <Text style={styles.detailLabel}>{t('stations.assigned_routes_label', { defaultValue: 'Assigned Routes' })}:</Text>
                    <Text style={styles.detailValue}>{item.assignedRouteIds.length} {t('stations.route_s', { defaultValue: 'route(s)' })}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Icon name="access-time" size={16} color="#999" />
                  <Text style={styles.detailLabel}>{t('stations.created_label', { defaultValue: 'Created' })}:</Text>
                  <Text style={styles.detailValue}>{formatDate(item.createdAt)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Icon name="update" size={16} color="#999" />
                  <Text style={styles.detailLabel}>{t('stations.updated_label', { defaultValue: 'Updated' })}:</Text>
                  <Text style={styles.detailValue}>{formatDate(item.updatedAt)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.viewOnMapButton}
                  onPress={() => {
                    navigation.navigate('DeviceMapScreenView', {
                      station: item
                    });
                  }}
                >
                  <Icon name="map" size={18} color="#FFA500" />
                  <Text style={styles.viewOnMapText}>{t('stations.view_on_map', { defaultValue: 'View on Map' })}</Text>
                </TouchableOpacity>
              </Animatable.View>
            )}

            <View style={styles.expandIndicator}>
              <Text style={styles.expandIcon}>
                {isExpanded ? t('stations.less_details', { defaultValue: '▲ Less details' }) : t('stations.more_details', { defaultValue: '▼ More details' })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderHeader = () => {
    const filteredStations = getFilteredStations();
    const checkpointCount = stations.filter(s => s.stationType === 'CHECKPOINT').length;
    const busStopCount = stations.filter(s => s.stationType === 'BUS_STOP').length;

    return (
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('stations.title', { defaultValue: 'Stations' })}</Text>
          <View style={styles.headerRight}>
            <Text style={styles.countBadge}>{filteredStations.length}</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('stations.search_placeholder', { defaultValue: 'Search stations...' })}
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
            <Text style={[styles.filterText, filterType === 'all' && styles.activeFilterText]}>
              {t('stations.filters.all', { defaultValue: 'All' })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, filterType === 'checkpoint' && styles.activeFilter]}
            onPress={() => setFilterType('checkpoint')}
          >
            <Icon name="check-circle" size={18} color={filterType === 'checkpoint' ? '#4CAF50' : '#666'} />
            <Text style={[styles.filterText, filterType === 'checkpoint' && styles.activeFilterText]}>
              {t('stations.filters.checkpoints', { defaultValue: 'Checkpoints' })} ({checkpointCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, filterType === 'bus_stop' && styles.activeFilter]}
            onPress={() => setFilterType('bus_stop')}
          >
            <Icon name="directions-bus" size={18} color={filterType === 'bus_stop' ? '#2196F3' : '#666'} />
            <Text style={[styles.filterText, filterType === 'bus_stop' && styles.activeFilterText]}>
              {t('stations.filters.bus_stops', { defaultValue: 'Bus Stops' })} ({busStopCount})
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stations.length}</Text>
            <Text style={styles.statLabel}>{t('stations.stats.total', { defaultValue: 'Total Stations' })}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
              {stations.filter(s => s.isActive).length}
            </Text>
            <Text style={styles.statLabel}>{t('stations.stats.active', { defaultValue: 'Active' })}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>
              {stations.filter(s => !s.isActive).length}
            </Text>
            <Text style={styles.statLabel}>{t('stations.stats.inactive', { defaultValue: 'Inactive' })}</Text>
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
          <Text style={styles.loadingText}>{t('stations.loading', { defaultValue: 'Loading stations...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredStations = getFilteredStations();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <FlatList
        data={filteredStations}
        keyExtractor={item => item.id.toString()}
        renderItem={renderStationCard}
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
            <Icon name="location-off" size={80} color="#CCC" />
            <Text style={styles.emptyTitle}>{t('stations.empty.title', { defaultValue: 'No stations found' })}</Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? t('stations.empty.adjust_search', { defaultValue: 'Try adjusting your search' })
                : t('stations.empty.no_stations', { defaultValue: 'No stations have been created yet' })}
            </Text>
          </Animatable.View>
        }
      />

      {/* Station Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('stations.modal.title', { defaultValue: 'Station Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {selectedStation && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Status Header */}
                <View style={styles.modalStatusHeader}>
                  <View style={[styles.modalStatusBadge, selectedStation.isActive ? styles.modalActive : styles.modalInactive]}>
                    <Text style={styles.modalStatusText}>
                      {selectedStation.isActive ? t('stations.active', { defaultValue: 'ACTIVE' }) : t('stations.inactive', { defaultValue: 'INACTIVE' })}
                    </Text>
                  </View>
                </View>

                {/* Station Type */}
                <View style={styles.modalTypeContainer}>
                  <Icon
                    name={getStationTypeIcon(selectedStation.stationType)}
                    size={24}
                    color={getStationTypeColor(selectedStation.stationType)}
                  />
                  <Text style={[styles.modalTypeText, { color: getStationTypeColor(selectedStation.stationType) }]}>
                    {getStationTypeName(selectedStation.stationType)}
                  </Text>
                </View>

                {/* Station Name */}
                <Text style={styles.modalStationName}>{selectedStation.name}</Text>

                {/* Description */}
                {selectedStation.description && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>{t('stations.modal.description', { defaultValue: 'Description' })}</Text>
                    <Text style={styles.modalDescription}>{selectedStation.description}</Text>
                  </View>
                )}

                {/* Location Info */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('stations.modal.location', { defaultValue: 'Location' })}</Text>
                  <View style={styles.locationCard}>
                    <View style={styles.locationRow}>
                      <Icon name="location-on" size={18} color="#FFA500" />
                      <Text style={styles.locationLabel}>{t('stations.modal.coordinates_label', { defaultValue: 'Coordinates' })}:</Text>
                      <Text style={styles.locationValue}>
                        {formatCoordinates(selectedStation.centerLat, selectedStation.centerLng)}
                      </Text>
                    </View>
                    <View style={styles.locationRow}>
                      <Icon name="radio-button-unchecked" size={18} color="#FFA500" />
                      <Text style={styles.locationLabel}>{t('stations.modal.radius_label', { defaultValue: 'Radius' })}:</Text>
                      <Text style={styles.locationValue}>{formatRadius(selectedStation.radiusMeters)}</Text>
                    </View>
                  </View>
                </View>

                {/* Details Grid */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('stations.modal.details', { defaultValue: 'Details' })}</Text>
                  <View style={styles.detailsGrid}>
                    <View style={styles.detailCard}>
                      <Icon name="info" size={20} color="#666" />
                      <Text style={styles.detailCardLabel}>{t('stations.modal.fence_type_label', { defaultValue: 'Fence Type' })}</Text>
                      <Text style={styles.detailCardValue}>{selectedStation.fenceType || 'CIRCLE'}</Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Icon name="flag" size={20} color="#666" />
                      <Text style={styles.detailCardLabel}>{t('stations.modal.route_status_label', { defaultValue: 'Route Status' })}</Text>
                      <Text style={[styles.detailCardValue, { color: selectedStation.routeStatus === 'ACTIVE' ? '#4CAF50' : '#FF6B6B' }]}>
                        {selectedStation.routeStatus || 'ACTIVE'}
                      </Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Icon name="palette" size={20} color="#666" />
                      <Text style={styles.detailCardLabel}>{t('stations.modal.color_label', { defaultValue: 'Color' })}</Text>
                      <View style={styles.colorPreview}>
                        <View style={[styles.colorBox, { backgroundColor: selectedStation.colorHex || '#3b82f6' }]} />
                        <Text style={styles.detailCardValue}>{selectedStation.colorHex || '#3b82f6'}</Text>
                      </View>
                    </View>
                    {selectedStation.assignedRouteIds && selectedStation.assignedRouteIds.length > 0 && (
                      <View style={styles.detailCard}>
                        <Icon name="route" size={20} color="#666" />
                        <Text style={styles.detailCardLabel}>{t('stations.modal.assigned_routes_label', { defaultValue: 'Assigned Routes' })}</Text>
                        <Text style={styles.detailCardValue}>{selectedStation.assignedRouteIds.length} {t('stations.route_s', { defaultValue: 'route(s)' })}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Timestamps */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('stations.modal.timestamps', { defaultValue: 'Timestamps' })}</Text>
                  <View style={styles.timestampCard}>
                    <View style={styles.timestampRow}>
                      <Icon name="access-time" size={16} color="#999" />
                      <Text style={styles.timestampLabel}>{t('stations.modal.created_label', { defaultValue: 'Created' })}:</Text>
                      <Text style={styles.timestampValue}>
                        {new Date(selectedStation.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.timestampRow}>
                      <Icon name="update" size={16} color="#999" />
                      <Text style={styles.timestampLabel}>{t('stations.modal.updated_label', { defaultValue: 'Updated' })}:</Text>
                      <Text style={styles.timestampValue}>
                        {new Date(selectedStation.updatedAt).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeModalButtonText}>{t('stations.modal.close', { defaultValue: 'Close' })}</Text>
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
    paddingHorizontal: 20,
    gap: 12,
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
  stationCard: {
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
  stationName: {
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
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
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
    fontSize: 14,
    fontWeight: '600',
  },
  modalStationName: {
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

export default StationsScreen;
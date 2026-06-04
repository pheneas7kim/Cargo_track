import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  ScrollView,
  TextInput,
  Animated
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const { width } = Dimensions.get('window');

// Helper function to get language header
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

// FIXED: Helper function to make authenticated axios request with retry on 401
const authenticatedAxios = async (method, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    // Create axios instance for each request
    const axiosInstance = axios.create();

    const response = await axiosInstance({
      method: method, // 'get', 'post', 'put', 'delete', etc.
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    return response;
  } catch (error) {
    console.error('❌ API Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      dataType: typeof error.response?.data
    });

    if (error.response?.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedAxios(method, config, i18n, 1);
      }
    }
    throw error;
  }
};

const RandomStopScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [incidentTypes, setIncidentTypes] = useState([]);
  const [loadingIncidentTypes, setLoadingIncidentTypes] = useState(false);
  const [showIncidentDropdown, setShowIncidentDropdown] = useState(false);

  const [newStop, setNewStop] = useState({
    plateNumber: '',
    reason: '',
    incidentTypeId: null,
    incidentTypeName: '',
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in RandomStopScreen');
    });
    return () => removeListener();
  }, []);

  // Memoized filtered stops to prevent unnecessary re-renders
  const filteredStops = useMemo(() => {
    if (!searchQuery) return stops;
    const searchLower = searchQuery.toLowerCase();
    return stops.filter(stop => {
      const plateMatch = stop.vehiclePlateNumber?.toLowerCase().includes(searchLower) || false;
      const ticketMatch = stop.ticketNumber?.toLowerCase().includes(searchLower) || false;
      return plateMatch || ticketMatch;
    });
  }, [stops, searchQuery]);

  useEffect(() => {
    console.log('=== RANDOM STOP SCREEN LOADED ===');
    console.log('Screen initialized at:', new Date().toISOString());

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    fetchIncidentTypes();
  }, []);

  const fetchIncidentTypes = async () => {
    console.log('\n=== FETCHING INCIDENT TYPES ===');
    console.log('Request started at:', new Date().toISOString());
    setLoadingIncidentTypes(true);

    try {
      // FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name instead of axios.get
        {
          url: `${serverUrl}incident-types`,
        },
        i18n
      );

      console.log('✅ Incident Types Response Status:', response.status);
      console.log('✅ Response data type:', typeof response.data);
      console.log('✅ Response data:', JSON.stringify(response.data).substring(0, 500));

      // Check if response is actually an error
      if (response.data && response.data.statusCode && response.data.statusCode !== 200) {
        console.error('❌ API returned error:', response.data);
        setIncidentTypes([]);
        return;
      }

      // Try to parse incident types from various response formats
      let incidentTypesData = [];

      if (response.data) {
        // Check for error response
        if (response.data.error || response.data.message) {
          console.error('❌ Error response from server:', response.data);
          Snackbar.show({
            text: `Error: ${response.data.message || 'Failed to load incident types'}`,
            backgroundColor: '#FF6B6B',
            duration: 3000,
          });
          setIncidentTypes([]);
          return;
        }

        // Try different response structures
        if (Array.isArray(response.data)) {
          incidentTypesData = response.data;
          console.log(`✅ Found ${incidentTypesData.length} incident types (direct array)`);
        }
        else if (response.data.content && Array.isArray(response.data.content)) {
          incidentTypesData = response.data.content;
          console.log(`✅ Found ${incidentTypesData.length} incident types (paginated format)`);
        }
        else if (response.data.data && Array.isArray(response.data.data)) {
          incidentTypesData = response.data.data;
          console.log(`✅ Found ${incidentTypesData.length} incident types (nested data)`);
        }
        else if (response.data.incidentTypes && Array.isArray(response.data.incidentTypes)) {
          incidentTypesData = response.data.incidentTypes;
          console.log(`✅ Found ${incidentTypesData.length} incident types (incidentTypes field)`);
        }
        else if (response.data.incidentTypeList && Array.isArray(response.data.incidentTypeList)) {
          incidentTypesData = response.data.incidentTypeList;
          console.log(`✅ Found ${incidentTypesData.length} incident types (incidentTypeList field)`);
        }
        else if (typeof response.data === 'object') {
          // If it's an object but not an array, try to extract any array property
          console.log('Response is an object with keys:', Object.keys(response.data));
          for (let key in response.data) {
            if (Array.isArray(response.data[key])) {
              incidentTypesData = response.data[key];
              console.log(`✅ Found array in property "${key}" with ${incidentTypesData.length} items`);
              break;
            }
          }
        }

        if (incidentTypesData.length === 0) {
          console.warn('⚠️ No incident types array found in response');
          console.warn('Response structure:', Object.keys(response.data));
          incidentTypesData = [];
        }
      } else {
        console.warn('⚠️ No data received from incident types endpoint');
        incidentTypesData = [];
      }

      setIncidentTypes(incidentTypesData);

    } catch (error) {
      console.error('❌ Error fetching incident types:', error.message);

      // Detailed error logging
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));

        // Check if error response is a map/object
        if (typeof error.response.data === 'object') {
          console.error('Error data is an object with keys:', Object.keys(error.response.data));
          const errorMessage = error.response.data.message ||
                              error.response.data.error ||
                              error.response.data.msg ||
                              'Failed to load incident types';

          Snackbar.show({
            text: errorMessage,
            backgroundColor: '#FF6B6B',
            duration: 3000,
          });
        } else {
          Snackbar.show({
            text: `Failed to load incident types: ${error.message}`,
            backgroundColor: '#FF6B6B',
            duration: 3000,
          });
        }
      } else if (error.request) {
        console.error('No response received:', error.request);
        Snackbar.show({
          text: 'Network error - Could not connect to server',
          backgroundColor: '#FF6B6B',
          duration: 3000,
        });
      } else {
        console.error('Error:', error.message);
      }

      setIncidentTypes([]);
    } finally {
      setLoadingIncidentTypes(false);
      console.log('Incident types fetch completed\n');
    }
  };

  useFocusEffect(
    useCallback(() => {
      console.log('\n🔄 SCREEN FOCUSED - Fetching stops...');
      fetchStops();
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => false);
      return () => {
        console.log('Screen unfocused - removing back handler');
        backHandler.remove();
      };
    }, [])
  );

  const fetchStops = async (isRefresh = false) => {
    console.log('\n=== FETCHING RANDOM STOPS ===');
    console.log('Fetch type:', isRefresh ? 'REFRESH' : 'INITIAL LOAD');

    try {
      if (!isRefresh) setLoading(true);

      const userId = await AsyncStorage.getItem('id');
      const userName = await AsyncStorage.getItem('name');
      console.log('User ID:', userId || 'Not found');
      console.log('User Name:', userName || 'Not found');

      const url = `${serverUrl}random-stops/my-requests?page=0&size=100&sort=createdAt,desc`;
      console.log('Request URL:', url);

      const startTime = Date.now();
      // FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name instead of axios.get
        {
          url: url,
        },
        i18n
      );
      const endTime = Date.now();

      console.log(`✅ Request completed in ${endTime - startTime}ms`);
      console.log('Response Status:', response.status);
      console.log('Response data type:', typeof response.data);

      // Parse response with better error handling
      let stopsData = [];

      if (response.data) {
        if (response.data.content && Array.isArray(response.data.content)) {
          stopsData = response.data.content;
          console.log(`✅ Found ${stopsData.length} stops (paginated response)`);
          console.log('Pagination info:', {
            totalElements: response.data.totalElements,
            totalPages: response.data.totalPages
          });
        } else if (Array.isArray(response.data)) {
          stopsData = response.data;
          console.log(`✅ Found ${stopsData.length} stops (array response)`);
        } else if (response.data.data && Array.isArray(response.data.data)) {
          stopsData = response.data.data;
          console.log(`✅ Found ${stopsData.length} stops (nested data format)`);
        } else {
          console.warn('⚠️ Unexpected response format for stops:', typeof response.data);
          if (response.data && typeof response.data === 'object') {
            console.warn('Response keys:', Object.keys(response.data));
          }
          stopsData = [];
        }
      } else {
        console.warn('⚠️ No data received from stops endpoint');
        stopsData = [];
      }

      if (stopsData.length > 0) {
        // Count items with and without plate numbers
        const withPlate = stopsData.filter(s => s.vehiclePlateNumber).length;
        const withoutPlate = stopsData.filter(s => !s.vehiclePlateNumber).length;
        console.log(`📊 Stops with plate numbers: ${withPlate}, without: ${withoutPlate}`);

        // Log status distribution
        const statuses = [...new Set(stopsData.map(s => s.status))];
        console.log('📊 Status distribution:', statuses);
      }

      setStops(stopsData);
    } catch (error) {
      console.error('❌ ERROR FETCHING STOPS:', error.message);

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);

        if (error.response.status === 401) {
          console.error('🔐 Authentication failed - token may be expired');
        } else if (error.response.status === 403) {
          console.error('🚫 Forbidden - insufficient permissions');
        } else if (error.response.status === 404) {
          console.error('🔍 Endpoint not found - check server URL');
        }
      } else if (error.request) {
        console.error('No response received from server');
      } else {
        console.error('Error setting up request:', error.message);
      }

      Snackbar.show({
        text: t('random_stop.errors.load_stops', { defaultValue: 'Failed to load stops' }),
        duration: 3000,
        backgroundColor: '#FF6B6B'
      });

      // Set empty array to avoid rendering errors
      setStops([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      console.log('Fetch stops completed\n');
    }
  };

  const formatPlateNumber = (text) => {
    let cleaned = text.replace(/\s/g, '').toUpperCase();
    if (cleaned.length >= 7) {
      const part1 = cleaned.substring(0, 3);
      const part2 = cleaned.substring(3, 6);
      const part3 = cleaned.substring(6, 7);
      if (part3) {
        return `${part1} ${part2} ${part3}`;
      } else if (part2) {
        return `${part1} ${part2}`;
      }
    }
    return cleaned;
  };

  const handleCreateStop = async () => {
    console.log('\n=== SUBMIT STOP REQUEST ===');

    const normalizedPlateNumber = newStop.plateNumber
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();

    if (!normalizedPlateNumber || !newStop.reason) {
      Snackbar.show({ text: t('random_stop.errors.plate_reason_required', { defaultValue: 'Plate Number and Reason are required' }), duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }

    if (!newStop.incidentTypeId) {
      Snackbar.show({ text: t('random_stop.errors.incident_type_required', { defaultValue: 'Please select an incident type' }), duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }

    setSubmitting(true);

    try {
      const postData = {
        plateNumber: normalizedPlateNumber,
        reason: newStop.reason,
        incidentTypeId: newStop.incidentTypeId
      };

      console.log('POST URL:', `${serverUrl}random-stops`);
      console.log('POST Data:', postData);

      // FIXED: Changed from axios.post to 'post' string method
      const response = await authenticatedAxios(
        'post',  // <-- FIXED: Use string method name instead of axios.post
        {
          url: `${serverUrl}random-stops`,
          data: postData,
          headers: { 'Content-Type': 'application/json' },
        },
        i18n
      );

      console.log('✅ Response Status:', response.status);
      console.log('Response data:', response.data);

      if (response.data && response.data.vehiclePlateNumber === null) {
        Snackbar.show({
          text: t('random_stop.errors.vehicle_not_found', { defaultValue: '⚠️ Stop created but vehicle not found in system' }),
          duration: 5000,
          backgroundColor: '#FFA500'
        });
      } else {
        Snackbar.show({ text: t('random_stop.success.submitted', { defaultValue: '✓ Request submitted successfully' }), duration: 2000, backgroundColor: '#4CAF50' });
      }

      setCreateModalVisible(false);
      setNewStop({
        plateNumber: '',
        reason: '',
        incidentTypeId: null,
        incidentTypeName: ''
      });

      fetchStops();
    } catch (error) {
      console.error('❌ ERROR SUBMITTING STOP:', error.message);

      let errorMessage = t('random_stop.errors.submission_failed', { defaultValue: 'Submission failed' });

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);

        if (error.response.status === 404) {
          errorMessage = t('random_stop.errors.vehicle_not_found_message', { defaultValue: 'Vehicle plate number not found in system' });
        } else if (error.response.status === 401) {
          errorMessage = t('random_stop.errors.auth_failed', { defaultValue: 'Authentication failed - please login again' });
        } else if (error.response.data && error.response.data.message) {
          errorMessage = error.response.data.message;
        }
      }

      Snackbar.show({ text: errorMessage, duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    return status === 'APPROVED' ? '#4CAF50' : '#FFA500';
  };

  const getStatusText = (status) => {
    if (status === 'APPROVED') {
      return t('random_stop.status.approved', { defaultValue: 'APPROVED' });
    }
    return t('random_stop.status.pending', { defaultValue: 'PENDING' });
  };

  const keyExtractor = useCallback((item) => {
    return item.id?.toString() || Math.random().toString();
  }, []);

  const renderStopItem = ({ item, index }) => (
    <Animatable.View animation="fadeInUp" delay={index * 50} style={styles.cardWrapper}>
      <TouchableOpacity
        style={styles.stopCard}
        onPress={() => {
          setSelectedStop(item);
          setDetailModalVisible(true);
        }}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.plateText}>
              {item.vehiclePlateNumber || t('random_stop.vehicle_not_found', { defaultValue: '⚠️ Vehicle Not Found' })}
            </Text>
            <Text style={styles.ticketText}>
              {item.ticketNumber || t('random_stop.no_ticket', { defaultValue: 'No Ticket' })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>

        <Text style={styles.reasonText} numberOfLines={2}>
          {t('random_stop.reason_label', { defaultValue: 'Reason' })}: {item.reason || t('random_stop.no_reason', { defaultValue: 'No reason provided' })}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.footerInfo}>{t('random_stop.by_label', { defaultValue: 'By' })}: {item.requestedByName || t('random_stop.unknown', { defaultValue: 'Unknown' })}</Text>
          <Text style={styles.footerInfo}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : t('random_stop.unknown_date', { defaultValue: 'Unknown date' })}
          </Text>
        </View>
      </TouchableOpacity>
    </Animatable.View>
  );

  const ListEmptyComponent = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Icon name="info-outline" size={50} color="#999" />
      <Text style={styles.emptyTitle}>{t('random_stop.empty.title', { defaultValue: 'No Stop Requests Found' })}</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? t('random_stop.empty.search_suggestion', { defaultValue: 'Try a different search term' }) : t('random_stop.empty.refresh_suggestion', { defaultValue: 'Pull down to refresh or create a new request' })}
      </Text>
    </View>
  ), [searchQuery, t]);

  if (loading && stops.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('random_stop.loading', { defaultValue: 'Loading stops...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('random_stop.title', { defaultValue: 'Random Stops' })}</Text>
            <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.createButtonText}>{t('random_stop.report_button', { defaultValue: '+ Report' })}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('random_stop.search_placeholder', { defaultValue: 'Search Plate or Ticket...' })}
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
        </View>
      </Animated.View>

      <FlatList
        data={filteredStops}
        keyExtractor={keyExtractor}
        renderItem={renderStopItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchStops(true)}
            tintColor="#FFA500"
            colors={["#FFA500"]}
          />
        }
        ListEmptyComponent={ListEmptyComponent}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        windowSize={5}
        showsVerticalScrollIndicator={false}
      />

      {/* Create Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('random_stop.modal.create_title', { defaultValue: 'Request Random Stop' })}</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>{t('random_stop.form.plate_number', { defaultValue: 'Vehicle Plate Number' })} *</Text>
              <TextInput
                style={styles.input}
                value={newStop.plateNumber}
                onChangeText={(text) =>
                  setNewStop({
                    ...newStop,
                    plateNumber: formatPlateNumber(text),
                  })
                }
                placeholder={t('random_stop.placeholders.plate_number', { defaultValue: 'e.g. KCT 102 P' })}
                placeholderTextColor="#999"
                autoCapitalize="characters"
              />

              <Text style={styles.label}>{t('random_stop.form.incident_type', { defaultValue: 'Incident Type' })} *</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowIncidentDropdown(true)}
              >
                <Text style={newStop.incidentTypeName ? styles.dropdownText : styles.dropdownPlaceholder}>
                  {newStop.incidentTypeName || t('random_stop.form.select_incident_type', { defaultValue: 'Select incident type' })}
                </Text>
                <Icon name="arrow-drop-down" size={24} color="#666" />
              </TouchableOpacity>

              <Text style={styles.label}>{t('random_stop.form.reason', { defaultValue: 'Reason' })} *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={4}
                value={newStop.reason}
                onChangeText={(text) => setNewStop({...newStop, reason: text})}
                placeholder={t('random_stop.placeholders.reason', { defaultValue: 'Enter detailed reason for the stop...' })}
                placeholderTextColor="#999"
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleCreateStop}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('random_stop.buttons.submit', { defaultValue: 'Submit Request' })}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Incident Type Dropdown Modal */}
      <Modal
        visible={showIncidentDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowIncidentDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowIncidentDropdown(false)}
        >
          <View style={styles.dropdownModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('random_stop.modal.select_incident', { defaultValue: 'Select Incident Type' })}</Text>
              <TouchableOpacity onPress={() => setShowIncidentDropdown(false)}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {loadingIncidentTypes ? (
              <ActivityIndicator size="large" color="#FFA500" />
            ) : incidentTypes.length === 0 ? (
              <View style={styles.emptyDropdownContainer}>
                <Text style={styles.emptyDropdownText}>{t('random_stop.errors.no_incident_types', { defaultValue: 'No incident types found' })}</Text>
              </View>
            ) : (
              <ScrollView>
                {incidentTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={styles.dropdownOption}
                    onPress={() => {
                      setNewStop({
                        ...newStop,
                        incidentTypeId: type.id,
                        incidentTypeName: type.name || type.incidentTypeName
                      });
                      setShowIncidentDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      {type.name || type.incidentTypeName}
                    </Text>
                    {newStop.incidentTypeId === type.id && (
                      <Icon name="check" size={20} color="#FFA500" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('random_stop.modal.detail_title', { defaultValue: 'Request Details' })}</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {selectedStop && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.plate_number', { defaultValue: 'Plate Number' })}</Text>
                  <Text style={styles.detailValue}>
                    {selectedStop.vehiclePlateNumber || t('random_stop.vehicle_not_found', { defaultValue: '⚠️ Vehicle Not Found' })}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.ticket_number', { defaultValue: 'Ticket Number' })}</Text>
                  <Text style={styles.detailValue}>
                    {selectedStop.ticketNumber || t('random_stop.details.not_assigned', { defaultValue: 'Not assigned yet' })}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.reason', { defaultValue: 'Reason' })}</Text>
                  <Text style={styles.detailValue}>
                    {selectedStop.reason || t('random_stop.no_reason', { defaultValue: 'No reason provided' })}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.status', { defaultValue: 'Status' })}</Text>
                  <Text style={[styles.detailValue, { color: getStatusColor(selectedStop.status), fontWeight: 'bold' }]}>
                    {getStatusText(selectedStop.status)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.requested_by', { defaultValue: 'Requested By' })}</Text>
                  <Text style={styles.detailValue}>{selectedStop.requestedByName || t('random_stop.unknown', { defaultValue: 'Unknown' })}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.approved_by', { defaultValue: 'Approved By' })}</Text>
                  <Text style={styles.detailValue}>{selectedStop.approvedByName || t('random_stop.details.pending', { defaultValue: 'Pending' })}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('random_stop.details.requested_at', { defaultValue: 'Requested At' })}</Text>
                  <Text style={styles.detailValue}>
                    {selectedStop.requestedAt ? new Date(selectedStop.requestedAt).toLocaleString() : t('random_stop.unknown', { defaultValue: 'Unknown' })}
                  </Text>
                </View>
                {selectedStop.approvedAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('random_stop.details.approved_at', { defaultValue: 'Approved At' })}</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedStop.approvedAt).toLocaleString()}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  header: {
    backgroundColor: '#FFF',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A'
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center'
  },
  createButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8
  },
  createButtonText: {
    color: '#FFF',
    fontWeight: 'bold'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    borderRadius: 12,
    paddingHorizontal: 12
  },
  searchInput: {
    flex: 1,
    height: 45,
    color: '#000',
    fontSize: 14,
  },
  searchIcon: {
    marginRight: 10
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  cardWrapper: {
    marginBottom: 12
  },
  stopCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  plateText: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#1A1A1A'
  },
  ticketText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  reasonText: {
    color: '#444',
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#F9F9F9',
    padding: 8,
    borderRadius: 8,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10
  },
  footerInfo: {
    fontSize: 11,
    color: '#888'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    maxHeight: '90%'
  },
  dropdownModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 25,
    padding: 20,
    width: '90%',
    maxHeight: '70%',
    alignSelf: 'center'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A'
  },
  modalBody: {
    maxHeight: '80%',
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 15,
    color: '#444',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    color: '#000',
    fontSize: 14,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dropdownButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    color: '#000',
    fontSize: 14,
  },
  dropdownPlaceholder: {
    color: '#999',
    fontSize: 14,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#333',
  },
  emptyDropdownContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyDropdownText: {
    fontSize: 14,
    color: '#999',
  },
  submitButton: {
    backgroundColor: '#FFA500',
    marginTop: 30,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  },
  detailRow: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingBottom: 8
  },
  detailLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4
  },
  detailValue: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '500'
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default RandomStopScreen;
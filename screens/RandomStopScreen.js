import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const { width } = Dimensions.get('window');

const RandomStopScreen = () => {
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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    fetchIncidentTypes();
  }, []);

  const fetchIncidentTypes = async () => {
    setLoadingIncidentTypes(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.get(`${serverUrl}incident-types`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data && Array.isArray(response.data)) {
        setIncidentTypes(response.data);
      } else if (response.data && response.data.content) {
        setIncidentTypes(response.data.content);
      } else {
        setIncidentTypes([]);
      }
    } catch (error) {
      console.error('Error fetching incident types:', error);
      Snackbar.show({
        text: 'Failed to load incident types',
        backgroundColor: '#FF6B6B',
        duration: 3000,
      });
    } finally {
      setLoadingIncidentTypes(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStops();
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => false);
      return () => backHandler.remove();
    }, [])
  );

  const fetchStops = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.get(
        `${serverUrl}random-stops/my-requests?page=0&size=100&sort=createdAt,desc`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data && response.data.content) {
        setStops(response.data.content);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      Snackbar.show({ text: 'Failed to load stops', duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Helper function to format plate numbers
  const formatPlateNumber = (text) => {
    // Remove any existing spaces and convert to uppercase
    let cleaned = text.replace(/\s/g, '').toUpperCase();

    // If the length is 7 or more, try to format as "XXX NNN X" pattern
    if (cleaned.length >= 7) {
      // Example: KDX002T -> KDX 002 T
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
    console.log('=== SUBMIT BUTTON PRESSED ===');

    // Normalize the plate number: trim spaces and ensure single spaces between parts
    const normalizedPlateNumber = newStop.plateNumber
      .trim()
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .toUpperCase();

    console.log('Original plate number:', newStop.plateNumber);
    console.log('Normalized plate number:', normalizedPlateNumber);

    console.log('Form data before validation:', {
      plateNumber: normalizedPlateNumber,
      reason: newStop.reason,
      incidentTypeId: newStop.incidentTypeId
    });

    if (!normalizedPlateNumber || !newStop.reason) {
      console.log('Validation failed: Missing required fields');
      Snackbar.show({ text: 'Plate Number and Reason are required', duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }

    if (!newStop.incidentTypeId) {
      console.log('Validation failed: Missing incident type');
      Snackbar.show({ text: 'Please select an incident type', duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }

    console.log('Validation passed. Starting submission...');
    setSubmitting(true);

    try {
      const token = await AsyncStorage.getItem('accessToken');
      console.log('Token retrieved:', token ? 'Token exists (length: ' + token.length + ')' : 'NO TOKEN FOUND');

      const postData = {
        plateNumber: normalizedPlateNumber,  // Use normalized version
        reason: newStop.reason,
        incidentTypeId: newStop.incidentTypeId
      };

      console.log('POST URL:', `${serverUrl}random-stops`);
      console.log('POST Data:', JSON.stringify(postData, null, 2));

      const response = await axios.post(`${serverUrl}random-stops`, postData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      console.log('SUCCESS - Response status:', response.status);
      console.log('SUCCESS - Response data:', response.data);

      // Check if the vehicle was found
      if (response.data.vehiclePlateNumber === null) {
        Snackbar.show({
          text: `⚠️ Stop created but vehicle "${normalizedPlateNumber}" not found in system`,
          duration: 5000,
          backgroundColor: '#FFA500'
        });
      } else {
        Snackbar.show({ text: '✓ Request submitted successfully', duration: 2000, backgroundColor: '#4CAF50' });
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
      console.log('ERROR - Submission failed');
      console.log('Error status:', error.response?.status);
      console.log('Error message:', error.message);
      console.log('Error response data:', error.response?.data);

      let errorMessage = 'Submission failed';
      if (error.response?.status === 404) {
        errorMessage = 'Vehicle plate number not found in system';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Snackbar.show({ text: errorMessage, duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
      console.log('Submission completed. Submitting state:', false);
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    return status === 'APPROVED' ? '#4CAF50' : '#FFA500';
  };

  const renderStopItem = ({ item, index }) => (
    <Animatable.View animation="fadeInUp" delay={index * 50} style={styles.cardWrapper}>
      <TouchableOpacity
        style={styles.stopCard}
        onPress={() => { setSelectedStop(item); setDetailModalVisible(true); }}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.plateText}>{item.vehiclePlateNumber || '⚠️ Vehicle Not Found'}</Text>
            <Text style={styles.ticketText}>{item.ticketNumber || 'No Ticket'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status || 'PENDING'}</Text>
          </View>
        </View>

        <Text style={styles.reasonText} numberOfLines={1}>Reason: {item.reason || 'No reason provided'}</Text>

        <View style={styles.cardFooter}>
          <Text style={styles.footerInfo}>By: {item.requestedByName || 'Unknown'}</Text>
          <Text style={styles.footerInfo}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Unknown date'}</Text>
        </View>
      </TouchableOpacity>
    </Animatable.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                      <Icon name="arrow-back" size={24} color="#1A1A1A" />
                    </TouchableOpacity>
            <Text style={styles.headerTitle}>Random Stops</Text>
            <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.createButtonText}>+ Report</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search Plate or Ticket..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>
      </Animated.View>

      <FlatList
        data={stops.filter(s => s.vehiclePlateNumber && s.vehiclePlateNumber.toLowerCase().includes(searchQuery.toLowerCase()))}
        keyExtractor={item => item.id.toString()}
        renderItem={renderStopItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchStops(true)} tintColor="#FFA500" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Stop Requests Found</Text>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={createModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Random Stop</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}><Text style={styles.closeIcon}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Vehicle Plate Number</Text>
              <TextInput
                style={styles.input}
                value={newStop.plateNumber}
                onChangeText={(text) =>
                  setNewStop({
                    ...newStop,
                    plateNumber: formatPlateNumber(text),
                  })
                }
                placeholder="e.g. AAA 001 A"
                placeholderTextColor="#000"
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Incident Type *</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowIncidentDropdown(true)}
              >
                <Text style={newStop.incidentTypeName ? styles.dropdownText : styles.dropdownPlaceholder}>
                  {newStop.incidentTypeName || 'Select incident type'}
                </Text>
                <Icon name="arrow-drop-down" size={24} color="#666" />
              </TouchableOpacity>

              <Text style={styles.label}>Reason</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                multiline
                value={newStop.reason}
                onChangeText={(text) => setNewStop({...newStop, reason: text})}
                placeholder="Enter reason for stop..."
                placeholderTextColor="#000"
              />

              <TouchableOpacity
                style={[styles.submitButton, submitting && { opacity: 0.7 }]}
                onPress={handleCreateStop}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>Submit Request</Text>}
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
              <Text style={styles.modalTitle}>Select Incident Type</Text>
              <TouchableOpacity onPress={() => setShowIncidentDropdown(false)}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {loadingIncidentTypes ? (
              <ActivityIndicator size="large" color="#FFA500" />
            ) : incidentTypes.length === 0 ? (
              <View style={styles.emptyDropdownContainer}>
                <Text style={styles.emptyDropdownText}>No incident types found</Text>
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
                    <Text style={styles.dropdownOptionText}>{type.name || type.incidentTypeName}</Text>
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
      <Modal visible={detailModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}><Text style={styles.closeIcon}>✕</Text></TouchableOpacity>
            </View>
            {selectedStop && (
              <View style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Plate Number</Text>
                  <Text style={styles.detailValue}>{selectedStop.vehiclePlateNumber || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Ticket Number</Text>
                  <Text style={styles.detailValue}>{selectedStop.ticketNumber || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>{selectedStop.reason || 'No reason provided'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { color: getStatusColor(selectedStop.status) }]}>{selectedStop.status || 'PENDING'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Requested By</Text>
                  <Text style={styles.detailValue}>{selectedStop.requestedByName || 'Unknown'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Approved By</Text>
                  <Text style={styles.detailValue}>{selectedStop.approvedByName || 'Pending'}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: '#FFF', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 15 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  backButtonText: { fontSize: 24, color: '#1A1A1A' },
  createButton: { backgroundColor: '#FFA500', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  createButtonText: { color: '#FFF', fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 45, color: '#000' },
  searchIcon: { marginRight: 10, color: '#999' },
  listContent: { padding: 16 },
  cardWrapper: { marginBottom: 12 },
  stopCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  plateText: { fontWeight: 'bold', fontSize: 18, color: '#1A1A1A' },
  ticketText: { fontSize: 12, color: '#666', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  reasonText: { color: '#444', fontSize: 14, marginBottom: 12, backgroundColor: '#F9F9F9', padding: 8, borderRadius: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  footerInfo: { fontSize: 11, color: '#888' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, minHeight: '50%' },
  dropdownModalContent: { backgroundColor: '#FFF', borderRadius: 25, padding: 20, width: '90%', maxHeight: '70%', alignSelf: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
  closeIcon: { fontSize: 22, color: '#999' },
  label: { fontWeight: '600', marginBottom: 8, marginTop: 15, color: '#444' },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, color: '#000' },
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
    fontSize: 16,
  },
  dropdownPlaceholder: {
    color: '#999',
    fontSize: 16,
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
    fontSize: 16,
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
  submitButton: { backgroundColor: '#FFA500', marginTop: 30, padding: 16, borderRadius: 12, alignItems: 'center' },
  submitButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  detailRow: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 8 },
  detailLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  detailValue: { fontSize: 15, color: '#1A1A1A', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 16, color: '#999' }
});

export default RandomStopScreen;
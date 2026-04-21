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

  // Form State matching your POST body requirements
  const [newStop, setNewStop] = useState({
    vehicleId: 1, // Defaulting as per your example
    vehiclePlateNumber: '',
    reason: '',
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

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

      // Mapping specifically to your "content" array
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

  const handleCreateStop = async () => {
    if (!newStop.vehiclePlateNumber || !newStop.reason) {
      Snackbar.show({ text: 'Plate Number and Reason are required', duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      // POST body matches your tested Postman structure
      await axios.post(`${serverUrl}random-stops`, {
        ...newStop,
        requestedAt: new Date().toISOString(),
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      Snackbar.show({ text: 'Request submitted successfully', duration: 2000, backgroundColor: '#4CAF50' });
      setCreateModalVisible(false);
      setNewStop({ vehicleId: 1, vehiclePlateNumber: '', reason: '' });
      fetchStops();
    } catch (error) {
      Snackbar.show({ text: 'Submission failed', duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
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
            <Text style={styles.plateText}>{item.vehiclePlateNumber}</Text>
            <Text style={styles.ticketText}>{item.ticketNumber || 'No Ticket'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.reasonText} numberOfLines={1}>Reason: {item.reason}</Text>

        <View style={styles.cardFooter}>
          <Text style={styles.footerInfo}>By: {item.requestedByName}</Text>
          <Text style={styles.footerInfo}>{new Date(item.createdAt).toLocaleDateString()}</Text>
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
        data={stops.filter(s => s.vehiclePlateNumber.toLowerCase().includes(searchQuery.toLowerCase()))}
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
                value={newStop.vehiclePlateNumber}
                onChangeText={(text) => setNewStop({...newStop, vehiclePlateNumber: text.toUpperCase()})}
                placeholder="e.g. KCT102P"
              />

              <Text style={styles.label}>Reason</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                multiline
                value={newStop.reason}
                onChangeText={(text) => setNewStop({...newStop, reason: text})}
                placeholder="Enter reason for stop..."
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
                  <Text style={styles.detailValue}>{selectedStop.vehiclePlateNumber}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Ticket Number</Text>
                  <Text style={styles.detailValue}>{selectedStop.ticketNumber || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>{selectedStop.reason}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { color: getStatusColor(selectedStop.status) }]}>{selectedStop.status}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Requested By</Text>
                  <Text style={styles.detailValue}>{selectedStop.requestedByName}</Text>
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
  closeIcon: { fontSize: 22, color: '#999' },
  label: { fontWeight: '600', marginBottom: 8, marginTop: 15, color: '#444' },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, color: '#000' },
  submitButton: { backgroundColor: '#FFA500', marginTop: 30, padding: 16, borderRadius: 12, alignItems: 'center' },
  submitButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  detailRow: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 8 },
  detailLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  detailValue: { fontSize: 15, color: '#1A1A1A', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 16, color: '#999' }
});

export default RandomStopScreen;
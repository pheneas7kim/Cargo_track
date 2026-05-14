import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, ActivityIndicator, Alert, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Geolocation from 'react-native-geolocation-service';
import Snackbar from 'react-native-snackbar';
import serverUrl from '../config';
import { PermissionsAndroid, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

const CreateTicket = ({ navigation }) => {
  const [submitting, setSubmitting] = useState(false);
  const [incidentTypes, setIncidentTypes] = useState([]);
  const [loadingIncidentTypes, setLoadingIncidentTypes] = useState(false);
  const [showIncidentDropdown, setShowIncidentDropdown] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    deviceSn: '',    // Optional
    cargoValue: '',  // Optional
    incidentType: 'ROUTE',
    incidentTypeId: null,
    incidentTypeName: '',
  });

  const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  useEffect(() => {
    fetchIncidentTypes();
  }, []);

  const fetchIncidentTypes = async () => {
    setLoadingIncidentTypes(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.get(`${serverUrl}/incident-types`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Assuming the response returns an array of objects with id and name
      setIncidentTypes(response.data);
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

  const handleSubmit = async () => {
    // 1. Validate required fields
    if (!form.title || !form.description) {
      Alert.alert('Required', 'Please fill in the title and description');
      return;
    }

    if (!form.incidentTypeId) {
      Alert.alert('Required', 'Please select an incident type');
      return;
    }

    // 2. Check Permissions for Android
    if (Platform.OS === 'android') {
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      if (!hasPermission) {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (status !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("Permission Denied", "Location is required to submit a ticket.");
          return;
        }
      }
    }

    setSubmitting(true);

    // 3. Capture GPS and Submit
    Geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = await AsyncStorage.getItem('accessToken');
          const userObj = await AsyncStorage.getItem('user');
          const user = userObj ? JSON.parse(userObj) : null;

          // Construct the JSON payload
          const payload = {
            ...form,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            assigneeId: user?.id || 1,
            // Handle optional numeric fields
            cargoValue: form.cargoValue ? parseFloat(form.cargoValue) : 0,
            deviceSn: form.deviceSn.trim() || null,
            incidentTypeId: form.incidentTypeId,
          };

          const response = await axios.post(`${serverUrl}/tickets/manual`, payload, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          // 4. Handle Success and Navigate to Evidence Screen
          if (response.status === 200 || response.status === 201) {
            // Extract the new ticket ID from the response
            const ticketId = response.data.id;

            Snackbar.show({
              text: 'Ticket Created! Now attach evidence.',
              backgroundColor: '#4CAF50'
            });

            // Navigate to the next step
            navigation.navigate('AttatchEvidence', { ticketId: ticketId });
          }
        } catch (error) {
          console.error('Submission Error:', error.response?.data);
          Alert.alert('Error', error.response?.data?.message || 'Submission failed');
        } finally {
          setSubmitting(false);
        }
      },
      (error) => {
        setSubmitting(false);
        Alert.alert(
          'GPS Error',
          'Please ensure GPS is on and high-accuracy is enabled to submit.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
        showLocationDialog: true,
        forceRequestLocation: true
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>Create Manual Ticket</Text>

        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Broken Seal"
          value={form.title}
          onChangeText={(val) => setForm({...form, title: val})}
        />

        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Provide incident details..."
          multiline
          value={form.description}
          onChangeText={(val) => setForm({...form, description: val})}
        />

        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityContainer}>
          {priorityOptions.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.priorityOption, form.priority === p && styles.prioritySelected]}
              onPress={() => setForm({...form, priority: p})}
            >
              <Text style={[styles.priorityText, form.priority === p && styles.priorityTextSelected]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Incident Type *</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setShowIncidentDropdown(true)}
        >
          <Text style={form.incidentTypeName ? styles.dropdownText : styles.dropdownPlaceholder}>
            {form.incidentTypeName || 'Select incident type'}
          </Text>
          <Icon name="arrow-drop-down" size={24} color="#666" />
        </TouchableOpacity>

        <View style={styles.divider} />

        {/*
        <Text style={styles.optionalLabel}>Device Serial Number (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter Serial Number"
          keyboardType="numeric"
          value={form.deviceSn}
          onChangeText={(val) => setForm({...form, deviceSn: val})}
        />

        <Text style={styles.optionalLabel}>Cargo Value (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="KES"
          keyboardType="numeric"
          value={form.cargoValue}
          onChangeText={(val) => setForm({...form, cargoValue: val})}
        />
        */}

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Proceed to Attatch Evidence</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal for dropdown options */}
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Incident Type</Text>
              <TouchableOpacity onPress={() => setShowIncidentDropdown(false)}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {loadingIncidentTypes ? (
              <ActivityIndicator size="large" color="#FFA500" />
            ) : (
              <ScrollView>
                {incidentTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={styles.dropdownOption}
                    onPress={() => {
                      setForm({
                        ...form,
                        incidentTypeId: type.id,
                        incidentTypeName: type.name
                      });
                      setShowIncidentDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>{type.name}</Text>
                    {form.incidentTypeId === type.id && (
                      <Icon name="check" size={20} color="#FFA500" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default CreateTicket;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 20 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#1A1A1A', marginTop: 30 },
  label: { fontWeight: '600', marginTop: 15, color: '#444' },
  optionalLabel: { fontWeight: '500', marginTop: 15, color: '#888', fontSize: 13 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, color: '#000' },
  priorityContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  priorityOption: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, alignItems: 'center', marginHorizontal: 2, backgroundColor: '#fff' },
  prioritySelected: { backgroundColor: '#FFA500', borderColor: '#FFA500' },
  priorityText: { fontSize: 10, fontWeight: 'bold', color: '#666' },
  priorityTextSelected: { color: '#fff' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
  submitBtn: { backgroundColor: '#FFA500', padding: 15, borderRadius: 8, marginTop: 30, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  dropdownButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
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
    fontWeight: '600',
    color: '#1A1A1A',
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
});
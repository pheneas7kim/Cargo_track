import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, ActivityIndicator, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Geolocation from 'react-native-geolocation-service';
import Snackbar from 'react-native-snackbar';
import serverUrl from '../config';
import { PermissionsAndroid, Platform } from 'react-native';

const CreateTicket = ({ navigation }) => {
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    deviceSn: '',    // Optional
    cargoValue: '',  // Optional
    incidentType: 'MANUAL',
  });

  const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  const handleSubmit = async () => {
    // 1. Validate required fields
    if (!form.title || !form.description) {
      Alert.alert('Required', 'Please fill in the title and description');
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
            incidentType: 'MANUAL'
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
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginTop: 5 },
  priorityContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  priorityOption: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, alignItems: 'center', marginHorizontal: 2, backgroundColor: '#fff' },
  prioritySelected: { backgroundColor: '#FFA500', borderColor: '#FFA500' },
  priorityText: { fontSize: 10, fontWeight: 'bold', color: '#666' },
  priorityTextSelected: { color: '#fff' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
  submitBtn: { backgroundColor: '#FFA500', padding: 15, borderRadius: 8, marginTop: 30, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

});
import React, { useState } from 'react';
import { StyleSheet, SafeAreaView, View, StatusBar, Text,Alert,  TouchableOpacity, FlatList, Image, Modal, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config'; 
import { useNavigation } from '@react-navigation/native'; // <-- useNavigation for navigation
import Snackbar from 'react-native-snackbar'; // <-- Add this import at the top



function SetSecretPin() {
  const [pin, setPin] = useState('');
  const maxTries = 4;
  let currentTry = 0;
  let requeryTimer = null;
  const navigation = useNavigation();  // Hook to access navigation prop

  const [isLoading, setIsLoading] = useState(false);


  const handleSavePin = async () => {
    if (pin.length !== 4 || isNaN(pin)) {
      // Alert.alert('Invalid PIN', 'Please enter a 4-digit numeric PIN.');
      Snackbar.show({
        text: "Please enter a 4-digit numeric PIN",
        duration: 3000, // 3000 ms = 3 seconds
        backgroundColor: '#FF0000',
      });
      return;
    }
  

    setIsLoading(true); // Start loading

    // try {
      await AsyncStorage.setItem('secretPin', pin);
      const salesOrderId = await AsyncStorage.getItem('salesOrderId');
      const phoneNumber = await AsyncStorage.getItem('phoneNumber2');
      const token = await AsyncStorage.getItem('accessToken');
  
      const url = `${serverUrl}/SalesOrder/paySupplier?id=${salesOrderId}&phoneNumber=${phoneNumber}&PIN=${pin}`;
    
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
  
      
      const result = await response.json(); // always parse as JSON
      console.log('📩 API Response:', result);
  
      if (response.ok) {
        handleSuccess(result.sales_order_id);
        // setPin('');
      } else {
        const errorMessage = result.data || result.message || 'Failed to submit. Please try again.';
        // Alert.alert('Failed', errorMessage);
        Snackbar.show({
          text: errorMessage,
          duration: 3000, // 3000 ms = 3 seconds
          backgroundColor: '#FF0000',
        });
      }
    // } catch (error) {
    //   console.error('❗ Error:', error);
    //   // Alert.alert('Error', 'Something went wrong. Please try again.');
    // }
  };

  const handleSuccess = async (salesOrderId) => {
    console.log('📩 salesOrderId:', salesOrderId);
    setTimeout(() => {
      let currentTry = 0;
      // This is a recursive function instead of using setInterval
      const requeryPayments = async () => {
       
        // navigation.replace('Dashboard');
        if (currentTry < maxTries) {
          const response = await requeryPaymentsById(salesOrderId, maxTries - currentTry, navigation);
  
          if (response?.processed) {
            // console.log('✅ Processed successfully!');

            setIsLoading(false); // Start loading

            Snackbar.show({
              text: 'Processed successfully',
              duration: 3000, // 3000 ms = 3 seconds
              backgroundColor: '#2bb673',
            });

            navigation.reset({
              index: 0,
              routes: [{ name: 'Dashboard' }],
            });
          } else {
            setIsLoading(false); // Start loading
            currentTry++;
            if (currentTry < maxTries) {
              console.log(`⏳ Requerying... ${maxTries - currentTry} attempts left`);
              setTimeout(requeryPayments, 5000); // Retry after 5 seconds
            } else {
              console.log('❗ Max requery attempts reached.');
              // Alert.alert('Notice', 'Max requery attempts reached.');
              navigation.replace('Dashboard');

            }
          }
        }
      };
  
      requeryPayments(); // Initial call
    }, 5000);
  };


  const requeryPaymentsById = async (id, countsLeft, navigation) => {
    const url = `${serverUrl}/SalesOrder/checkSupplierPayment?id=${id}`;

    const token = await AsyncStorage.getItem('accessToken');
  
    console.log('➡️ Sending GETs request to', url);


    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
  
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Requery Success [Status 200]');
        console.log('📦 Response Data:', data);
  
        const processed = data?.processed ?? false;
  
        return { processed }; // Return processed status
      } else {
        const errorText = await response.text();
        console.log(`⚠️ Error [${response.status}]: ${errorText}`);
        return { processed: false }; // Indicate failure
      }
    } catch (error) {
      console.error('❌ Exception during requery:', error);
      Alert.alert('Error', `Requery error: ${error.message}`);
      return { processed: false }; // Indicate failure
    }
  };


  

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Enter Your Secret PIN</Text>
      
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ''))} // Allow only numbers
        placeholder="Enter 4-digit PIN"
        maxLength={4}
        keyboardType="number-pad"
        secureTextEntry={true} />

          <TouchableOpacity
          style={[styles.saveButton, isLoading && { backgroundColor: '#a5d6c7' }]}
          onPress={handleSavePin}
          disabled={isLoading} >
          <Text style={styles.saveButtonText}>
            {isLoading ? 'Please wait...' : 'Confirm'}
          </Text>
        </TouchableOpacity>

     
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: 22,
    fontWeight: 'normal',
    marginBottom: 20,
    color: '#333',
  },
  input: {
    width: '80%',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 8,
    color: '#000'
  },
  saveButton: {
    backgroundColor: '#2bb673',
    paddingVertical: 14,
    paddingHorizontal: 60,
    borderRadius: 6,
    elevation: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'normal',
  },
});

export default SetSecretPin;

import React, { useState } from 'react';
import { StyleSheet, SafeAreaView, View, StatusBar, Text,Alert,  TouchableOpacity, FlatList, Image, Modal, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config'; 
import { useNavigation } from '@react-navigation/native'; // <-- useNavigation for navigation
import Snackbar from 'react-native-snackbar'; // <-- Add this import at the top

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

function SetSecretPin() {
  const [pin, setPin] = useState('');
  const maxTries = 4;
  let currentTry = 0;
  let requeryTimer = null;
  const navigation = useNavigation();  // Hook to access navigation prop

  const [isLoading, setIsLoading] = useState(false);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineTransaction, setOfflineTransaction] = useState(null);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ========== OFFLINE MODE INITIALIZATION ==========
  React.useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Set Secret PIN Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            console.log('🌐 Back online in SetSecretPin');
            // Check for pending transactions when coming online
            checkPendingTransactions();
          } else {
            Snackbar.show({
              text: 'Offline mode - PIN will be saved locally',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load pending transactions
        await checkPendingTransactions();
      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      // Cleanup
      OfflineSyncService.stopAutoSync();
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Check pending transactions ==========
  const checkPendingTransactions = async () => {
    try {
      const pending = await OfflineDatabaseService.getUserData('pending_pin_payments');
      if (pending && pending.length > 0) {
        setOfflineTransaction(pending[0]);
        console.log('📦 Found pending PIN transaction:', pending[0]);
      }
    } catch (error) {
      console.error('Error checking pending transactions:', error);
    }
  };
  // ========== END OFFLINE CHECK PENDING ==========

  // ========== OFFLINE: Save PIN payment offline ==========
  const savePinPaymentOffline = async (pinValue, salesOrderId, phoneNumber) => {
    try {
      const offlinePayment = {
        id: Date.now(),
        pin: pinValue,
        salesOrderId: salesOrderId,
        phoneNumber: phoneNumber,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'PENDING'
      };

      const existingPayments = await OfflineDatabaseService.getUserData('pending_pin_payments') || [];
      existingPayments.push(offlinePayment);
      await OfflineDatabaseService.saveUserData('pending_pin_payments', existingPayments);
      setOfflineTransaction(offlinePayment);

      // Also add to sync queue
      await OfflineDatabaseService.addToSyncQueue('PIN_PAYMENT', '/SalesOrder/paySupplier', {
        salesOrderId: salesOrderId,
        phoneNumber: phoneNumber,
        pin: pinValue
      });

      // Save PIN to local storage as well
      await AsyncStorage.setItem('secretPin', pinValue);

      return true;
    } catch (error) {
      console.error('Error saving PIN payment offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE PAYMENT ==========

  // ========== OFFLINE: Process pending PIN payments ==========
  const processPendingPinPayments = async () => {
    if (!isOnline) return;

    const pendingPayments = await OfflineDatabaseService.getUserData('pending_pin_payments');
    if (!pendingPayments || pendingPayments.length === 0) return;

    console.log(`🔄 Processing ${pendingPayments.length} pending PIN payments...`);

    for (const payment of pendingPayments) {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        const url = `${serverUrl}/SalesOrder/paySupplier?id=${payment.salesOrderId}&phoneNumber=${payment.phoneNumber}&PIN=${payment.pin}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        const result = await response.json();

        if (response.ok) {
          console.log(`✅ Processed pending PIN payment for order ${payment.salesOrderId}`);
          // Start requery for this payment
          handleSuccess(result.sales_order_id);
        } else {
          console.log(`❌ Failed to process PIN payment for order ${payment.salesOrderId}`);
        }
      } catch (error) {
        console.error(`Error processing PIN payment:`, error);
      }
    }

    // Clear processed payments
    await OfflineDatabaseService.saveUserData('pending_pin_payments', []);
    setOfflineTransaction(null);
  };
  // ========== END OFFLINE PROCESS PENDING ==========

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

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      // Save PIN payment offline
      const salesOrderId = await AsyncStorage.getItem('salesOrderId');
      const phoneNumber = await AsyncStorage.getItem('phoneNumber2');

      const saved = await savePinPaymentOffline(pin, salesOrderId, phoneNumber);
      if (saved) {
        Snackbar.show({
          text: 'PIN saved offline. Will process when online.',
          duration: 4000,
          backgroundColor: '#FF9800',
        });
        setIsLoading(false);
        navigation.replace('Dashboard');
      } else {
        Snackbar.show({
          text: 'Failed to save PIN offline. Please try again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        setIsLoading(false);
      }
      return;
    }
    // ========== END OFFLINE CHECK ==========

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
        setIsLoading(false);
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

  // ========== OFFLINE: Manual retry for pending transactions ==========
  const retryPendingPayment = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot retry while offline. Please connect to the internet.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);
    try {
      await processPendingPinPayments();
    } catch (error) {
      console.error('Retry error:', error);
      Snackbar.show({
        text: 'Failed to retry payment',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };
  // ========== END OFFLINE RETRY ==========

  return (
    <SafeAreaView style={styles.container}>
      {/* ========== OFFLINE: Pending transaction banner ========== */}
      {offlineTransaction && !isOnline && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>
            📴 Pending PIN payment detected. Will process when online.
          </Text>
          <TouchableOpacity onPress={retryPendingPayment} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry Now</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* ========== END OFFLINE PENDING BANNER ========== */}

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && !offlineTransaction && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - PIN will be saved locally</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

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
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FF9800',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 8,
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
  },
  pendingBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '600',
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
    alignItems: 'center',
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
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
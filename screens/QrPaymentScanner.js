import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  StatusBar,
  SafeAreaView, 
  FlatList, 
  Image, 
  Modal, 
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { useNavigation } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import serverUrl from '../config'; 



const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

const QrPaymentScanner = () => {
  const navigation = useNavigation();

  const [scannedData, setScannedData] = useState(null);
  const [tiptoken, settiptoken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [userTipName, setUserName] = useState(null);
  const [tippedphoneNumber, setTippedPhoneNumber] = useState('');


  /** 🔄 Fetch user details when page opens */
  useFocusEffect(
    React.useCallback(() => {
      fetchUserDetailsData();
    }, [])
  );

  /** 📡 Fetch logged-in user data */
  const fetchUserDetailsData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');

      if (!token) {
        Snackbar.show({
          text: 'User not logged in.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        return;
      }

      const response = await axios.get(`${serverUrl}/api/validateuser`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const fetchedPhone = response.data?.usedetails?.phoneNo || '';
      setPhoneNumber(fetchedPhone);
    } catch (error) {
      Snackbar.show({
        text: 'Could not fetch user details.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    }
  };

  /** 📸 QR Scanner Event */
  const onReadCode = (event) => {
    let value = event?.nativeEvent?.codeStringValue;
    if (!value) return;

    value = value.trim();
    if (!value.startsWith('http')) value = 'https://' + value;

    try {
      const url = new URL(value);
      const data = url.searchParams.get('data');
      const name = url.searchParams.get("name");
      const phone_number = url.searchParams.get("phonenumber");

      if (data) {
        settiptoken(data);
        setScannedData(data);
        setUserName(name ? decodeURIComponent(name) : "Unknown");
        setTippedPhoneNumber(phone_number ? decodeURIComponent(phone_number) : "N/A");
        setIsModalVisible(true);
        setIsModalVisible(true);
        return;
      }
    } catch (err) {
    //   console.warn('⚠️ Invalid QR format');
    }
    // Fallback regex parsing if URL constructor fails
    const matchData = value.match(/[?&]data=([^&]+)/);
    const matchPhone = value.match(/[?&]phonenumber=([^&]+)/);
    const matchName = value.match(/[?&]name=([^&]+)/);

    if (matchData && matchPhone) {
        const dataValue = decodeURIComponent(matchData[1]);
        const phoneValue = decodeURIComponent(matchPhone[1]);
        const nameValue = matchName ? decodeURIComponent(matchName[1]) : 'Unknown';

        settiptoken(dataValue);
        setScannedData(dataValue);
        setUserName(nameValue);
        setTippedPhoneNumber(phoneValue);
        setIsModalVisible(true);
    } else {
        Snackbar.show({
        text: 'Invalid QR Code. Please scan a valid one.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
        });
    }
  };

  /** 💳 Submit Payment */
  const handleSubmit = async () => {
    if (!phoneNumber.trim() || !amount.trim()) {
      Snackbar.show({
        text: 'Phone number and amount are required',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);

    const requestBody = {
      grandTotal: amount,
      phoneNumber: phoneNumber,
    };

    try {
      const response = await fetch(`${serverUrl}/SalesOrder/salesOrder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tiptoken}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const sales_order_id = data.sales_order_id;
        handleSuccess(sales_order_id);
        setIsModalVisible(false);
      } else {
        Snackbar.show({
          text: 'Failed to submit. Please try again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
    } catch (error) {
      Snackbar.show({
        text: 'Network error. Please try again later.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /** 🔁 Check payment status */
  const handleSuccess = async (salesOrderId) => {
    let currentTry = 0;
    const maxTries = 6;

    const requeryPayments = async () => {
      if (currentTry >= maxTries) return;
      const response = await requeryPaymentsById(salesOrderId);
    if (response?.processed === true || response?.processing === true) {
         Snackbar.show({
          text: 'Payment processed successfully!',
          duration: 3000,
          backgroundColor: '#4ECDC4',
        });
        navigation.reset({
          index: 0,
          routes: [{ name: 'Dashboard' }],
        });
      } else {
        currentTry++;
        setTimeout(requeryPayments, 5000);
      }
    };

    setTimeout(requeryPayments, 5000);
  };

/** 🔍 Requery payment status by ID */
const requeryPaymentsById = async (id) => {
  try {
    const response = await fetch(`${serverUrl}/SalesOrder/getSalesOrderByID?id=${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tiptoken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      // ✅ Return both flags
      return {
        processed: data?.processed ?? false,
        processing: data?.processing ?? false,
      };
    } else {
      return { processed: false, processing: false };
    }
  } catch {
    return { processed: false, processing: false };
  }
};

  /** 🧭 Modal controls */
  const closeModal = () => {
    setIsModalVisible(false);
    setAmount('');
  };

  
   return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {!scannedData ? (
        <>
          <Text style={styles.title}>QR Scanner</Text>
          <Text style={styles.subtitle}>Scan to make quick and secure payments</Text>

          <View style={styles.cameraWrapper}>
            <View style={styles.cameraFrame}>
              <Camera
                style={styles.camera}
                scanBarcode
                onReadCode={onReadCode}
                showFrame={false}
              />
              <View style={styles.scanBorder} />
            </View>
          </View>

          <Text style={styles.instructionText}>Align the QR code inside the box</Text>
        </>
      ) : (
        <View style={styles.resultContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.resultTitle}>QR Code Scanned</Text>
          {/* <Text style={styles.qrValue}>{scannedData}</Text> */}

          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => setScannedData(null)}>
            <Text style={styles.rescanText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}


      {/* 💰 Tip Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tip</Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.modalTitleNames}>Name:  {userTipName}</Text>
              <Text style={styles.modalTitleNames}>Phone No:  {tippedphoneNumber}</Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Amount (KSH)</Text>
              <TextInput
                placeholder="200"
                keyboardType="numeric"
                style={styles.input}
                placeholderTextColor="#A0A0A0"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}>
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Tip Now</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animatable.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default QrPaymentScanner;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C10', // dark elegant base
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },

  subtitle: {
    color: '#A4A6AD',
    fontSize: 14,
    marginBottom: 25,
  },

  cameraWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  cameraFrame: {
    width: SCAN_SIZE + 20,
    height: SCAN_SIZE + 20,
    borderRadius: 25,
    backgroundColor: '#1C1E22',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  camera: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
  },

  scanBorder: {
    position: 'absolute',
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderColor: '#FFD700',
    borderWidth: 2,
    borderRadius: 20,
  },

  instructionText: {
    color: '#C5C6CA',
    fontSize: 15,
    marginTop: 25,
    textAlign: 'center',
  },

  resultContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1E22',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  successIcon: {
    fontSize: 50,
    marginBottom: 15,
  },

  resultTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 8,
  },

  qrValue: {
    fontSize: 14,
    color: '#A4FBA6',
    textAlign: 'center',
    marginBottom: 20,
  },

  rescanButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: '#FFD700',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },

  rescanText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },



   modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666666',
    fontWeight: '300',
  },
  inputContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },

   modalTitleNames: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
  },


  input: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFD700',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

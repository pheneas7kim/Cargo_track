import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Vibration,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import serverUrl from '../config';
import Snackbar from 'react-native-snackbar';
import { useNavigation } from '@react-navigation/native';
import * as Animatable from 'react-native-animatable';

const { width } = Dimensions.get('window');
const MAX_TRIES = 5; // Define the missing constant

function EnterPin() {
  const [pin, setPin] = useState(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const navigation = useNavigation();
  const pinRefs = useRef([]);

  useEffect(() => {
    setTimeout(() => pinRefs.current[0]?.focus(), 100);
  }, []);

  const handlePinChange = (value, index) => {
    const currentPin = [...pin];

    if (value === '' && index > 0) {
      currentPin[index] = '';
      setPin(currentPin);
      pinRefs.current[index - 1]?.focus();
      return;
    }

    if (value.length === 1 && /^\d$/.test(value)) {
      currentPin[index] = value;
      setPin(currentPin);

      if (index < 3) {
        pinRefs.current[index + 1]?.focus();
      } else {
        const enteredPin = [...currentPin];
        setTimeout(() => validateAndSave(enteredPin), 200);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace') {
      const currentPin = [...pin];

      if (currentPin[index] === '' && index > 0) {
        pinRefs.current[index - 1]?.focus();
      } else {
        currentPin[index] = '';
        setPin(currentPin);
      }
    }
  };

  const validateAndSave = async (pinArray) => {
    const pinValue = pinArray.join('');

    if (pinValue.length !== 4 || !/^\d{4}$/.test(pinValue)) {
      Vibration.vibrate(500);
      setShake(true);
      setTimeout(() => setShake(false), 500);

      Snackbar.show({
        text: 'Invalid PIN. Please try again.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });

      setPin(['', '', '', '']);
      setTimeout(() => pinRefs.current[0]?.focus(), 1000);
      return;
    }

    await handleSavePin(pinValue);
  };

  const handleSavePin = async (pinValue) => {
    setIsLoading(true);

    try {
      const salesOrderId = await AsyncStorage.getItem('salesOrderId');
      const phoneNumber = await AsyncStorage.getItem('phoneNumber2');
      const token = await AsyncStorage.getItem('accessToken');

      const url = `${serverUrl}/SalesOrder/paySupplier?id=${salesOrderId}&phoneNumber=${phoneNumber}&PIN=${pinValue}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      console.log('📩 API Response:', result);

      if (response.ok) {
        handleSuccess(result.sales_order_id);
      } else {
        setIsLoading(false);
        const errorMessage = result.data || result.message || 'Failed to submit. Please try again.';
        
        Snackbar.show({
          text: errorMessage,
          duration: 3000,
          backgroundColor: '#FF0000',
        });

        // Reset PIN on error
        setPin(['', '', '', '']);
        setTimeout(() => pinRefs.current[0]?.focus(), 1000);
      }
    } catch (error) {
      setIsLoading(false);
      console.error('❌ Error submitting PIN:', error);
      
      Snackbar.show({
        text: 'Network error. Please try again.',
        duration: 3000,
        backgroundColor: '#FF0000',
      });

      // Reset PIN on error
      setPin(['', '', '', '']);
      setTimeout(() => pinRefs.current[0]?.focus(), 1000);
    }
  };

  const handleCancel = () => {
    navigation.replace('Dashboard');
  };

  const handleSuccess = async (salesOrderId) => {
    console.log('📩 salesOrderId:', salesOrderId);
    
    setTimeout(() => {
      let currentTry = 0;
      
      const requeryPayments = async () => {
        if (currentTry < MAX_TRIES) {
          const response = await requeryPaymentsById(salesOrderId, MAX_TRIES - currentTry, navigation);

          if (response?.processed) {
            setIsLoading(false);

            Snackbar.show({
              text: 'Processed successfully',
              duration: 3000,
              backgroundColor: '#2bb673',
            });

            navigation.reset({
              index: 0,
              routes: [{ name: 'Dashboard' }],
            });
          } else {
            currentTry++;
            if (currentTry < MAX_TRIES) {
              console.log(`⏳ Requerying... ${MAX_TRIES - currentTry} attempts left`);
              setTimeout(requeryPayments, 5000);
            } else {
              console.log('❗ Max requery attempts reached.');
              setIsLoading(false);
              
              Alert.alert(
                'Notice', 
                'Payment processing is taking longer than expected. Please check your transaction history.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.replace('Dashboard')
                  }
                ]
              );
            }
          }
        }
      };

      requeryPayments();
    }, 5000);
  };

  const requeryPaymentsById = async (id, countsLeft, navigation) => {
    const url = `${serverUrl}/SalesOrder/checkSupplierPayment?id=${id}`;

    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      console.log('➡️ Sending GET request to', url);

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
        return { processed };
      } else {
        const errorText = await response.text();
        console.log(`⚠️ Error [${response.status}]: ${errorText}`);
        return { processed: false };
      }
    } catch (error) {
      console.error('❌ Exception during requery:', error);
      return { processed: false };
    }
  };

  const renderPinInput = () => (
    <View style={styles.pinContainer}>
      {pin.map((digit, index) => (
        <Animatable.View
          key={index}
          animation={shake ? "shake" : undefined}
          style={[
            styles.pinInputContainer,
            digit !== '' && styles.pinInputFilled
          ]}
        >
          <TextInput
            ref={(ref) => pinRefs.current[index] = ref}
            style={styles.pinInput}
            value={digit}
            onChangeText={(value) => handlePinChange(value, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            keyboardType="number-pad"
            maxLength={1}
            secureTextEntry={true}
            textAlign="center"
            selectTextOnFocus={true}
            editable={!isLoading}
          />
          {digit !== '' && <View style={styles.pinDot} />}
        </Animatable.View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.content}>
        <Animatable.View animation="fadeInDown" style={styles.headerContainer}>
          <View style={styles.lockIcon}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>
          <Text style={styles.title}>Your PIN</Text>
          <Text style={styles.subtitle}>Enter a 4-digit PIN to complete transaction</Text>
        </Animatable.View>

        <Animatable.View style={styles.pinSection}>
          {renderPinInput()}
        </Animatable.View>

        <Animatable.View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            This action will deduct the amount from your wallet
          </Text>
        </Animatable.View>

        {isLoading && (
          <Animatable.View animation="fadeIn" style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Processing... Please wait!</Text>
          </Animatable.View>
        )}

        <Animatable.View animation="fadeInUp" style={styles.resetContainer}>
          <TouchableOpacity 
            style={[styles.resetButton, isLoading && styles.disabledButton]} 
            onPress={handleCancel}
            disabled={isLoading}
          >
            <Text style={[styles.resetButtonText, isLoading && styles.disabledText]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </Animatable.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD70015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  lockEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  pinSection: {
    marginBottom: 16,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  pinInputContainer: {
    width: 46,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pinInputFilled: {
    borderColor: '#FFD700',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFD700',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 1,
  },
  pinInput: {
    width: '100%',
    height: '100%',
    fontSize: 16,
    fontWeight: '600',
    color: 'transparent',
    textAlign: 'center',
  },
  pinDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
  },
  instructionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  instructionsText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 12,
    fontWeight: '500',
  },
  resetContainer: {
    marginTop: 20,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  resetButtonText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#999999',
  },
});

export default EnterPin;
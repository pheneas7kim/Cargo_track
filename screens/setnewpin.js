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
  Vibration
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import serverUrl from '../config'; 
import Snackbar from 'react-native-snackbar';
import { useNavigation } from '@react-navigation/native';
import * as Animatable from 'react-native-animatable';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');

function SetNewSecretPin() {
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [step, setStep] = useState(1); // 1 = enter PIN, 2 = confirm PIN
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  const navigation = useNavigation();
  const pinRefs = useRef([]);
  const confirmPinRefs = useRef([]);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Set New Secret PIN');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (!online) {
            Snackbar.show({
              text: 'Offline mode - PIN will be saved locally',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Check for pending PIN sync
        await checkPendingPinSync();

      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      // Cleanup
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Save PIN offline ==========
  const savePinOffline = async (pinValue) => {
    try {
      const offlinePinData = {
        id: Date.now().toString(),
        pin: pinValue,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'QUEUED',
        retryCount: 0
      };

      await OfflineDatabaseService.saveUserData('pending_pin_setup', offlinePinData);

      // Also add to sync queue
      await OfflineDatabaseService.addToSyncQueue('PIN_SETUP', '/users/user/changePIN', {
        pin: pinValue
      });

      // Save locally to AsyncStorage as well
      await AsyncStorage.setItem('secretPin', pinValue);
      await AsyncStorage.setItem('secretPinPendingSync', 'true');

      console.log(`📦 PIN setup saved offline for user`);
      return true;
    } catch (error) {
      console.error('Error saving PIN offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE PIN ==========

  // ========== OFFLINE: Check pending PIN sync ==========
  const checkPendingPinSync = async () => {
    try {
      const pendingSync = await AsyncStorage.getItem('secretPinPendingSync');
      if (pendingSync === 'true') {
        const pendingPinData = await OfflineDatabaseService.getUserData('pending_pin_setup');
        if (pendingPinData && isOnline) {
          Snackbar.show({
            text: 'Found pending PIN setup. Syncing...',
            duration: 3000,
            backgroundColor: '#FF9800',
          });
          await syncPendingPin();
        }
      }
    } catch (error) {
      console.error('Error checking pending PIN sync:', error);
    }
  };
  // ========== END OFFLINE CHECK PENDING PIN ==========

  // ========== OFFLINE: Sync pending PIN ==========
  const syncPendingPin = async () => {
    if (!isOnline) return;

    const pendingPinData = await OfflineDatabaseService.getUserData('pending_pin_setup');
    if (!pendingPinData) return;

    console.log(`🔄 Attempting to sync pending PIN setup...`);

    try {
      const token = await AsyncStorage.getItem('accessToken');
      const url = `${serverUrl}/users/user/changePIN?pin=${pendingPinData.pin}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: "",
      });

      if (response.ok) {
        // Clear pending sync flag
        await AsyncStorage.removeItem('secretPinPendingSync');
        await OfflineDatabaseService.saveUserData('pending_pin_setup', null);

        console.log(`✅ PIN setup synced successfully`);

        Snackbar.show({
          text: 'PIN setup synchronized with server!',
          duration: 3000,
          backgroundColor: '#4CAF50',
        });

        // Navigate to dashboard after successful sync
        navigation.replace('Dashboard');
      } else {
        console.log(`❌ Failed to sync PIN setup: ${response.status}`);
      }
    } catch (error) {
      console.error('Error syncing PIN:', error);
    }
  };
  // ========== END OFFLINE SYNC PENDING PIN ==========

  useEffect(() => {
    // Focus first input on mount
    if (pinRefs.current[0]) {
      setTimeout(() => pinRefs.current[0].focus(), 100);
    }
  }, []);

  const handlePinChange = (value, index, isConfirm = false) => {
    const currentPin = isConfirm ? [...confirmPin] : [...pin];
    const refs = isConfirm ? confirmPinRefs.current : pinRefs.current;

    // Handle backspace
    if (value === '' && index > 0) {
      currentPin[index] = '';
      if (isConfirm) {
        setConfirmPin(currentPin);
      } else {
        setPin(currentPin);
      }
      refs[index - 1]?.focus();
      return;
    }

    // Handle number input
    if (value.length === 1 && /^\d$/.test(value)) {
      currentPin[index] = value;
      if (isConfirm) {
        setConfirmPin(currentPin);
      } else {
        setPin(currentPin);
      }

      // Move to next input or proceed to confirmation
      if (index < 3) {
        refs[index + 1]?.focus();
      } else if (!isConfirm && step === 1) {
        // PIN entry complete, move to confirmation
        setTimeout(() => {
          setStep(2);
          setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
        }, 200);
      } else if (isConfirm && step === 2) {
        // Confirmation complete, validate
        setTimeout(() => validateAndSave([...currentPin]), 200);
      }
    }
  };

  const handleKeyPress = (e, index, isConfirm = false) => {
    const refs = isConfirm ? confirmPinRefs.current : pinRefs.current;

    if (e.nativeEvent.key === 'Backspace') {
      const currentPin = isConfirm ? [...confirmPin] : [...pin];

      if (currentPin[index] === '' && index > 0) {
        refs[index - 1]?.focus();
      } else {
        currentPin[index] = '';
        if (isConfirm) {
          setConfirmPin(currentPin);
        } else {
          setPin(currentPin);
        }
      }
    }
  };

  const validateAndSave = async (finalConfirmPin) => {
    const enteredPin = pin.join('');
    const confirmedPin = finalConfirmPin.join('');

    if (enteredPin !== confirmedPin) {
      // PINs don't match
      Vibration.vibrate(500);
      setShake(true);
      setTimeout(() => setShake(false), 500);

      Snackbar.show({
        text: 'PINs do not match. Please try again.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });

      // Reset to step 1
      setTimeout(() => {
        setStep(1);
        setPin(['', '', '', '']);
        setConfirmPin(['', '', '', '']);
        setTimeout(() => pinRefs.current[0]?.focus(), 100);
      }, 1000);
      return;
    }

    // PINs match, save to server
    await handleSavePin(enteredPin);
  };

  const handleSavePin = async (pinValue) => {
    setIsLoading(true);

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      console.log('📴 Offline - saving PIN setup for later sync');
      const saved = await savePinOffline(pinValue);
      if (saved) {
        Snackbar.show({
          text: 'PIN saved locally. Will sync when online.',
          duration: 4000,
          backgroundColor: '#FF9800',
        });

        setTimeout(() => {
          navigation.replace('Dashboard');
        }, 1500);
      } else {
        Snackbar.show({
          text: 'Failed to save PIN offline. Please try again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      setIsLoading(false);
      return;
    }
    // ========== END OFFLINE CHECK ==========

    try {
      await AsyncStorage.setItem('secretPin', pinValue);
      const token = await AsyncStorage.getItem('accessToken');
      const url = `${serverUrl}/users/user/changePIN?pin=${pinValue}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: "",
      });

      if (response.ok) {
        Snackbar.show({
          text: 'PIN successfully set!',
          duration: 3000,
          backgroundColor: '#4ECDC4',
        });

        setTimeout(() => {
          navigation.replace('Dashboard');
        }, 1500);
      } else {
        const errorText = await response.text();
        console.error('Error Response:', errorText);

        // ========== OFFLINE: Save PIN offline on server error ==========
        if (response.status === 500 || response.status === 503) {
          const saved = await savePinOffline(pinValue);
          if (saved) {
            Snackbar.show({
              text: 'Server error. PIN saved locally. Will sync when online.',
              duration: 4000,
              backgroundColor: '#FF9800',
            });
            setTimeout(() => {
              navigation.replace('Dashboard');
            }, 1500);
          } else {
            Snackbar.show({
              text: 'Failed to set PIN. Please try again.',
              duration: 3000,
              backgroundColor: '#FF6B6B',
            });
          }
        } else {
          Snackbar.show({
            text: 'Failed to set PIN. Please try again.',
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      }
    } catch (error) {
      console.error('Error:', error);

      // ========== OFFLINE: Save PIN offline on network error ==========
      const saved = await savePinOffline(pinValue);
      if (saved) {
        Snackbar.show({
          text: 'Network error. PIN saved locally. Will sync when online.',
          duration: 4000,
          backgroundColor: '#FF9800',
        });
        setTimeout(() => {
          navigation.replace('Dashboard');
        }, 1500);
      } else {
        Snackbar.show({
          text: 'Something went wrong. Please try again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      // ========== END OFFLINE SAVE ==========
    } finally {
      setIsLoading(false);
    }
  };

  const resetPin = () => {
    setStep(1);
    setPin(['', '', '', '']);
    setConfirmPin(['', '', '', '']);
    setTimeout(() => pinRefs.current[0]?.focus(), 100);
  };

  const renderPinInput = (pinArray, refs, isConfirm = false) => {
    return (
      <View style={styles.pinContainer}>
        {pinArray.map((digit, index) => (
          <Animatable.View
            key={index}
            animation={shake && isConfirm ? "shake" : undefined}
            style={[
              styles.pinInputContainer,
              digit !== '' && styles.pinInputFilled
            ]}
          >
            <TextInput
              ref={(ref) => refs.current[index] = ref}
              style={styles.pinInput}
              value={digit}
              onChangeText={(value) => handlePinChange(value, index, isConfirm)}
              onKeyPress={(e) => handleKeyPress(e, index, isConfirm)}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry={true}
              textAlign="center"
              selectTextOnFocus={true}
            />
            {digit !== '' && <View style={styles.pinDot} />}
          </Animatable.View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - PIN will be saved locally</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      <View style={styles.content}>
        {/* Header */}
        <Animatable.View animation="fadeInDown" style={styles.headerContainer}>
          <View style={styles.lockIcon}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>
          <Text style={styles.title}>
            {step === 1 ? 'Set Your PIN' : 'Confirm Your PIN'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? 'Create a 4-digit PIN to secure your account'
              : 'Please enter your PIN again to confirm'
            }
          </Text>
        </Animatable.View>

        {/* Progress Indicator */}
        <Animatable.View  style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: step === 1 ? '50%' : '100%' }]} />
          </View>
          <Text style={styles.progressText}>Step {step} of 2</Text>
        </Animatable.View>

        {/* PIN Input */}
        <Animatable.View
          style={styles.pinSection}
        >
          {step === 1 ? (
            renderPinInput(pin, pinRefs)
          ) : (
            renderPinInput(confirmPin, confirmPinRefs, true)
          )}
        </Animatable.View>

        {/* Instructions */}
        <Animatable.View  delay={500} style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            {step === 1
              ? 'Choose a PIN that\'s easy for you to remember but hard for others to guess'
              : 'Make sure both PINs match exactly'
            }
          </Text>
        </Animatable.View>

        {/* Loading State */}
        {isLoading && (
          <Animatable.View  style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Setting up your PIN...</Text>
          </Animatable.View>
        )}

        {/* Reset Button (only show in step 2) */}
        {step === 2 && !isLoading && (
          <Animatable.View animation="fadeInUp" style={styles.resetContainer}>
            <TouchableOpacity style={styles.resetButton} onPress={resetPin}>
              <Text style={styles.resetButtonText}>Start Over</Text>
            </TouchableOpacity>
          </Animatable.View>
        )}
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
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    width: '60%',
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
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
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
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
  // ========== OFFLINE STYLES ==========
  offlineBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  // ========== END OFFLINE STYLES ==========
});

export default SetNewSecretPin;
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import serverUrl from '../config'; 
import Snackbar from 'react-native-snackbar';
import Clipboard from '@react-native-clipboard/clipboard';
import Share from 'react-native-share';
import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

const SECRET_KEY = 'KAZIYANGU_TIP_SECRET_2025';
const BASE_FORM_URL = 'https://kaziyangu.ke/kaziyanguadmin/tip-form.html';

function MpesaPaybillQRCode() {
  const [qrValue, setQrValue] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineDataAvailable, setOfflineDataAvailable] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  useFocusEffect(
    React.useCallback(() => {
      fetchUserDetailsData();
    }, [])
  );

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Mpesa QR Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (!online) {
            // Try to load cached QR data when offline
            loadCachedQRData();
            Snackbar.show({
              text: 'Offline mode - Showing cached QR data',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load cached QR data if available
        await loadCachedQRData();

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

  // ========== OFFLINE: Load cached QR data from offline database ==========
  const loadCachedQRData = async () => {
    try {
      const cachedData = await OfflineDatabaseService.getUserData('cached_qr_data');
      if (cachedData) {
        setQrValue(cachedData.qrValue || '');
        setName(cachedData.name || '');
        setPhoneNumber(cachedData.phoneNumber || '');
        setOfflineDataAvailable(true);
        console.log('📦 Loaded QR data from offline cache');
      }
    } catch (error) {
      console.error('Error loading cached QR data:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED QR DATA ==========

  // ========== OFFLINE: Save QR data to offline database ==========
  const saveQRDataToOfflineCache = async (qrValueData, nameData, phoneData) => {
    try {
      await OfflineDatabaseService.saveUserData('cached_qr_data', {
        qrValue: qrValueData,
        name: nameData,
        phoneNumber: phoneData,
        timestamp: Date.now()
      });
      console.log('💾 Saved QR data to offline cache');
      setOfflineDataAvailable(true);
    } catch (error) {
      console.error('Error saving QR data to cache:', error);
    }
  };
  // ========== END OFFLINE SAVE TO CACHE ==========

  // ========== OFFLINE: Get cached user details ==========
  const getCachedUserDetails = async () => {
    try {
      const cachedDetails = await OfflineDatabaseService.getUserData('cached_user_details');
      if (cachedDetails) {
        return cachedDetails;
      }
      return null;
    } catch (error) {
      console.error('Error getting cached user details:', error);
      return null;
    }
  };
  // ========== END OFFLINE GET CACHED DETAILS ==========

  // ========== OFFLINE: Save user details to cache ==========
  const saveUserDetailsToCache = async (phone, userName) => {
    try {
      await OfflineDatabaseService.saveUserData('cached_user_details', {
        phoneNumber: phone,
        name: userName,
        timestamp: Date.now()
      });
      console.log('💾 Saved user details to offline cache');
    } catch (error) {
      console.error('Error saving user details to cache:', error);
    }
  };
  // ========== END OFFLINE SAVE USER DETAILS ==========

  const fetchUserDetailsData = async () => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log('📴 Offline - using cached user details');
        const cachedDetails = await getCachedUserDetails();
        if (cachedDetails) {
          setPhoneNumber(cachedDetails.phoneNumber || '');
          setName(cachedDetails.name || '');
          await loadCachedQRData();
          setIsLoading(false);
        } else {
          Snackbar.show({
            text: 'Offline - No cached user data available',
            duration: 3000,
            backgroundColor: '#FF9800',
          });
          setIsLoading(false);
        }
        return;
      }
      // ========== END OFFLINE CHECK ==========

      const token = await AsyncStorage.getItem('accessToken');
      const userId = await AsyncStorage.getItem('id');

      if (!token || !userId) {
        Snackbar.show({
          text: 'User not logged in.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        setIsLoading(false);
        return;
      }

      const response = await axios.get(`${serverUrl}/api/validateuser`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const fetchedPhone = response.data?.usedetails?.phoneNo || '';
      setPhoneNumber(fetchedPhone);

      const storedName = await AsyncStorage.getItem('name');
      const userName = storedName || response.data?.usedetails?.name || 'Unnamed User';
      setName(userName);

      // ========== OFFLINE: Save user details to cache ==========
      await saveUserDetailsToCache(fetchedPhone, userName);
      // ========== END OFFLINE SAVE ==========

      await generateQr(fetchedPhone, userName);
    } catch (error) {
      console.error('❌ Failed to fetch user details:', error);

      // ========== OFFLINE: Fall back to cached data on error ==========
      const cachedDetails = await getCachedUserDetails();
      if (cachedDetails) {
        setPhoneNumber(cachedDetails.phoneNumber || '');
        setName(cachedDetails.name || '');
        await loadCachedQRData();
        Snackbar.show({
          text: 'Using cached user data (server unavailable)',
          duration: 3000,
          backgroundColor: '#FF9800',
        });
      } else {
        Snackbar.show({
          text: 'Could not fetch user details.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      // ========== END OFFLINE FALLBACK ==========

      setIsLoading(false);
    }
  };

  // ✅ Generate QR code URL
  const generateQr = async (phoneNo, userName) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const finalName = userName || name || 'Unnamed User';

      if (!token) {
        Snackbar.show({
          text: 'Access token not found.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        setIsLoading(false);
        return;
      }

      const fullUrl = `${BASE_FORM_URL}?data=${encodeURIComponent(
        token
      )}&name=${encodeURIComponent(finalName)}&phonenumber=${encodeURIComponent(phoneNo)}`;

      setQrValue(fullUrl);

      // ========== OFFLINE: Save QR data to cache ==========
      await saveQRDataToOfflineCache(fullUrl, finalName, phoneNo);
      // ========== END OFFLINE SAVE ==========

    } catch (error) {
      console.error('❌ Error generating QR:', error);
      Snackbar.show({
        text: 'Failed to generate QR code.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect(() => {
  //   const generateQr = async () => {
  //     try {
  //       const token = await AsyncStorage.getItem('accessToken');
  //       const storedName = await AsyncStorage.getItem('name');

  //       if (!token) {
  //         Snackbar.show({
  //           text: 'Access token not found.',
  //           duration: 3000,
  //           backgroundColor: '#FF6B6B',
  //         });
  //         setIsLoading(false);
  //         return;
  //       }

  //       setName(storedName || 'Unnamed User');

  //     //       const encryptedToken = encodeURIComponent(
  //     //   CryptoJS.AES.encrypt(token, "KAZIYANGU_TIP_SECRET_2025").toString()
  //     // );
  //     // const encodedToken = encodeURIComponent(btoa(token));
  //     // const fullUrl = `${BASE_FORM_URL}?data=${encodedToken}&name=${encodeURIComponent(name)}`;

  //       // ✅ Build full URL once
  //       const fullUrl = `${BASE_FORM_URL}?data=${encodeURIComponent(
  //         token
  //       )}&name=${encodeURIComponent(storedName || 'Unnamed')}&phonenumber=${encodeURIComponent(phonenumber)}`;

  //       setQrValue(fullUrl);
  //     } catch (error) {
  //       console.error('❌ Error generating QR:', error);
  //       Snackbar.show({
  //         text: 'Failed to generate QR code.',
  //         duration: 3000,
  //         backgroundColor: '#FF6B6B',
  //       });
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };

  //   generateQr();
  // }, []);

  // ========== OFFLINE: Manual refresh/sync ==========
  const handleManualRefresh = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot refresh while offline',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);
    try {
      await fetchUserDetailsData();
      Snackbar.show({
        text: 'QR data refreshed!',
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Refresh error:', error);
      Snackbar.show({
        text: 'Refresh failed',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };
  // ========== END OFFLINE MANUAL REFRESH ==========

  // 📋 Copy link
  const handleCopyLink = async () => {
    if (!qrValue) return;
    Clipboard.setString(qrValue);
    Snackbar.show({
      text: 'Link copied to clipboard!',
      duration: 2000,
      backgroundColor: '#4ECDC4',
    });
  };

  // 📤 Share link (fixed duplication)
  const handleShareLink = async () => {
    if (!qrValue) return;

    try {
      await Share.open({
        title: 'Share your Tip Link',
        message: `Hey! You can tip me easily via this link 💸:\n\n${qrValue}`,
        // ⚠️ Remove `url` property to avoid duplication
      });
    } catch (err) {
      if (err?.message !== 'User did not share') {
        console.error('❌ Error sharing:', err);
        Snackbar.show({
          text: 'Failed to share link.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached data</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      <View style={styles.content}>
        <Text style={styles.title}>Scan or Share to Tip</Text>
        <Text style={styles.subtitle}>Name : {name}</Text>
        <Text style={styles.subtitle}>Phone Number : {phoneNumber}</Text>

        {/* ========== OFFLINE: Data source indicator ========== */}
        {offlineDataAvailable && !isOnline && !isLoading && (
          <View style={styles.cachedIndicator}>
            <Text style={styles.cachedIndicatorText}>📦 Showing cached QR data</Text>
          </View>
        )}
        {/* ========== END OFFLINE INDICATOR ========== */}

        {isLoading ? (
          <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 10 }} />
        ) : qrValue ? (
          <View style={styles.qrWrapper}>
            <QRCode value={qrValue} size={180} />
            <Text style={styles.linkText}>
              {qrValue.replace('https://', '').slice(0, 45)}...
            </Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.button} onPress={handleCopyLink}>
                <Text style={styles.buttonText}>📋 Copy Link</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button} onPress={handleShareLink}>
                <Text style={styles.buttonText}>📤 Share</Text>
              </TouchableOpacity>
            </View>

            {/* ========== OFFLINE: Refresh button when online ========== */}
            {isOnline && (
              <TouchableOpacity style={styles.refreshButton} onPress={handleManualRefresh}>
                <Text style={styles.refreshButtonText}>🔄 Refresh QR</Text>
              </TouchableOpacity>
            )}
            {/* ========== END OFFLINE REFRESH BUTTON ========== */}
          </View>
        ) : (
          <Text style={styles.errorText}>QR code could not be generated.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#000',
    marginBottom: 4,
    textAlign: 'center',
    fontWeight: '400',
  },
  qrWrapper: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    elevation: 2,
  },
  linkText: {
    marginTop: 12,
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  button: {
    backgroundColor: '#FFD700',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    elevation: 1,
  },
  buttonText: {
    fontWeight: '600',
    color: '#333',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginTop: 20,
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
  cachedIndicator: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  cachedIndicatorText: {
    color: '#FF9800',
    fontSize: 11,
    fontWeight: '500',
  },
  refreshButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
    elevation: 1,
  },
  refreshButtonText: {
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: 14,
  },
  // ========== END OFFLINE STYLES ==========
});

export default MpesaPaybillQRCode;
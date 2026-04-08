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


const SECRET_KEY = 'KAZIYANGU_TIP_SECRET_2025';
const BASE_FORM_URL = 'https://kaziyangu.ke/kaziyanguadmin/tip-form.html';

function MpesaPaybillQRCode() {
  const [qrValue, setQrValue] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');


  useFocusEffect(
    React.useCallback(() => {
      fetchUserDetailsData();
    }, [])
  );



const fetchUserDetailsData = async () => {
    try {
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
      generateQr(fetchedPhone);
    } catch (error) {
      console.error('❌ Failed to fetch user details:', error);
      Snackbar.show({
        text: 'Could not fetch user details.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      setIsLoading(false);
    }
  };

  // ✅ Generate QR code URL
  const generateQr = async (phoneNo) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const storedName = await AsyncStorage.getItem('name');

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
      )}&name=${encodeURIComponent(storedName || 'Unnamed User')}&phonenumber=${encodeURIComponent(phoneNo)}`;

      setName(storedName || 'Unnamed User');
      setQrValue(fullUrl);
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
      <View style={styles.content}>
        <Text style={styles.title}>Scan or Share to Tip</Text>
        <Text style={styles.subtitle}>Name : {name}</Text>
        <Text style={styles.subtitle}>Phone Number : {phoneNumber}</Text>

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
});

export default MpesaPaybillQRCode;

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Image,
  ActivityIndicator, Alert, SafeAreaView, ScrollView, Platform
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ✅ Helper function to get language header
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

// ✅ Helper function to make authenticated axios request with retry on 401
const authenticatedAxios = async (axiosInstance, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    const response = await axiosInstance({
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    return response;
  } catch (error) {
    if (error.response?.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedAxios(axiosInstance, config, i18n, 1);
      }
    }
    throw error;
  }
};

const AttachEvidence = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  const { ticketId } = route.params;
  const [photos, setPhotos] = useState([]); // Changed to Array
  const [uploading, setUploading] = useState(false);

  // ✅ Listen for token refresh events
  React.useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in AttachEvidence');
    });
    return () => removeListener();
  }, []);

  const handleTakePhoto = () => {
    launchCamera({ mediaType: 'photo', quality: 0.7 }, (response) => {
      if (response.didCancel) return;
      if (response.assets) {
        // Append new photo to the existing array
        setPhotos([...photos, response.assets[0]]);
      }
    });
  };

  const removePhoto = (index) => {
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };

  const handleUpload = async () => {
      // 1. Guard clause: Ensure at least one photo exists
      if (!photos || photos.length === 0) {
        Alert.alert(
          t('attach_evidence.missing_photo.title', { defaultValue: 'Missing Photo' }),
          t('attach_evidence.missing_photo.message', { defaultValue: 'Please take at least one photo.' })
        );
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();

        // 2. Loop through photos
        photos.forEach((photo, index) => {
          const cleanUri = Platform.OS === 'android'
            ? photo.uri
            : photo.uri.replace('file://', '');

          formData.append('files', {
            uri: cleanUri,
            type: photo.type || 'image/jpeg',
            name: photo.fileName || `evidence_${ticketId}_${index}.jpg`,
          });
        });

        // 3. Sanitize the URL
        const baseUrl = serverUrl.replace(/\/+$/, '');
        const uploadUrl = `${baseUrl}/tickets/${ticketId}/evidence`;

        // 4. Execute the Request using authenticatedAxios
        const response = await authenticatedAxios(
          axios.post,
          {
            url: uploadUrl,
            data: formData,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          },
          i18n
        );

        // 5. Handle Success
        if (response.status === 200 || response.data.success) {
          Alert.alert(
            t('attach_evidence.success.title', { defaultValue: 'Success' }),
            t('attach_evidence.success.message', { defaultValue: 'All evidence uploaded successfully!' }),
            [
              {
                text: 'OK',
                onPress: () => navigation.navigate('Dashboard')
              }
            ]
          );
        }
      } catch (error) {
        // 6. Enhanced Error Logging
        console.log('Upload Error Details:', error.response?.data || error.message);

        const errorMsg = error.response?.data?.message || t('attach_evidence.errors.check_network', { defaultValue: 'Check network or server logs' });
        Alert.alert(
          t('attach_evidence.errors.upload_failed', { defaultValue: 'Upload Failed' }),
          t('attach_evidence.errors.error_message', { defaultValue: 'Error: {{message}}', message: errorMsg }).replace('{{message}}', errorMsg)
        );
      } finally {
        setUploading(false);
      }
    };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t('attach_evidence.ticket_label', { defaultValue: 'Ticket' })} #{ticketId}</Text>
      <Text style={styles.subtitle}>{t('attach_evidence.subtitle', { defaultValue: 'Capture one or more images as evidence' })}</Text>

      {/* MULTI-IMAGE PREVIEW SECTION */}
      <View style={styles.previewContainer}>
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
            {photos.map((p, index) => (
              <View key={index} style={styles.imageWrapper}>
                <Image source={{ uri: p.uri }} style={styles.image} />
                <TouchableOpacity style={styles.removeBadge} onPress={() => removePhoto(index)}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.placeholderText}>{t('attach_evidence.no_photos', { defaultValue: 'No photos taken yet' })}</Text>
        )}
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.camBtn} onPress={handleTakePhoto} disabled={uploading}>
          <Text style={styles.btnText}>{t('attach_evidence.add_photo', { defaultValue: '📸 ADD A PHOTO' })}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadBtn, photos.length === 0 && styles.disabledBtn]}
          onPress={handleUpload}
          disabled={uploading || photos.length === 0}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {t('attach_evidence.upload_button', { defaultValue: 'UPLOAD {{count}} IMAGE', count: photos.length }).replace('{{count}}', photos.length.toString())}
              {photos.length !== 1 ? 'S' : ''}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Tickets')} disabled={uploading}>
          <Text style={styles.skipText}>{t('attach_evidence.cancel_back', { defaultValue: 'Cancel and go back' })}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginTop: 20, textAlign: 'center' },
  subtitle: { color: '#666', marginBottom: 20, textAlign: 'center' },
  previewContainer: { width: '100%', height: 250, backgroundColor: '#f8f9fa', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
  scrollContainer: { padding: 15, alignItems: 'center' },
  imageWrapper: { width: 160, height: 200, marginRight: 15, position: 'relative' },
  image: { width: '100%', height: '100%', borderRadius: 10 },
  removeBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF6B6B', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  removeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  placeholderText: { color: '#999' },
  bottomControls: { width: '100%', gap: 10 },
  camBtn: { backgroundColor: '#444', padding: 15, borderRadius: 8, alignItems: 'center' },
  uploadBtn: { backgroundColor: '#FFA500', padding: 15, borderRadius: 8, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  skipText: { marginTop: 15, color: '#999', fontWeight: '600', textAlign: 'center' }
});

export default AttachEvidence;
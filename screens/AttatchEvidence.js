import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Image,
  ActivityIndicator, Alert, SafeAreaView, ScrollView, Platform
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';

const AttachEvidence = ({ route, navigation }) => {
  const { ticketId } = route.params;
  const [photos, setPhotos] = useState([]); // Changed to Array
  const [uploading, setUploading] = useState(false);

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
        Alert.alert('Missing Photo', 'Please take at least one photo.');
        return;
      }

      setUploading(true);
      try {
        // 2. Retrieve Auth Token
        const token = await AsyncStorage.getItem('accessToken');
        const formData = new FormData();

        // 3. Loop through photos
        // Note: If your backend is PHP/Laravel/Spring, you might need to change
        // 'files' to 'files[]' below.
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

        // 4. Sanitize the URL
        // Removes trailing slashes from config and builds a clean path
        const baseUrl = serverUrl.replace(/\/+$/, '');
        const uploadUrl = `${baseUrl}/tickets/${ticketId}/evidence`;

        // 5. Execute the Request
        // We use the object config to ensure headers and data are handled correctly
        const response = await axios({
          method: 'post',
          url: uploadUrl,
          data: formData,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          // IMPORTANT: Removed transformRequest.
          // Manual transformation often breaks the boundary for single-file uploads.
        });

        // 6. Handle Success
        if (response.status === 200 || response.data.success) {
          Alert.alert('Success', 'All evidence uploaded successfully!', [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Tickets')
            }
          ]);
        }
      } catch (error) {
        // 7. Enhanced Error Logging
        console.log('Upload Error Details:', error.response?.data || error.message);

        const errorMsg = error.response?.data?.message || 'Check network or server logs';
        Alert.alert('Upload Failed', `Error: ${errorMsg}`);
      } finally {
        setUploading(false);
      }
    };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Ticket #{ticketId}</Text>
      <Text style={styles.subtitle}>Capture one or more images as evidence</Text>

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
          <Text style={styles.placeholderText}>No photos taken yet</Text>
        )}
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.camBtn} onPress={handleTakePhoto} disabled={uploading}>
          <Text style={styles.btnText}>📸 ADD A PHOTO</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadBtn, photos.length === 0 && styles.disabledBtn]}
          onPress={handleUpload}
          disabled={uploading || photos.length === 0}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>UPLOAD {photos.length} {photos.length === 1 ? 'IMAGE' : 'IMAGES'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Tickets')} disabled={uploading}>
          <Text style={styles.skipText}>Cancel and go back</Text>
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
import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, Image,
  ActivityIndicator, Alert, SafeAreaView, ScrollView, Platform, TextInput
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

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

const AttachEvidence = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { ticketId, ticketNumber, onResolveComplete } = route.params || {};

  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events
  React.useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in AttachEvidence');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  React.useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Attach Evidence Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            console.log('🌐 Back online in AttachEvidence');
            // Check for any pending resolve operations
            checkPendingResolveOperations();
          }
        });
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

  // ========== OFFLINE: Check pending resolve operations ==========
  const checkPendingResolveOperations = async () => {
    try {
      const pendingResolves = await OfflineDatabaseService.getUserData('pending_resolve_operations');
      if (pendingResolves && pendingResolves.length > 0) {
        Alert.alert(
          t('attach_evidence.pending_sync.title', { defaultValue: 'Pending Sync' }),
          t('attach_evidence.pending_sync.message', { defaultValue: 'You have {{count}} pending resolve operations. They will sync automatically.' }).replace('{{count}}', pendingResolves.length.toString()),
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error checking pending resolves:', error);
    }
  };
  // ========== END OFFLINE PENDING CHECK ==========

  const handleTakePhoto = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      saveToPhotos: true,
    };

    launchCamera(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled camera');
      } else if (response.error) {
        console.log('Camera Error: ', response.error);
        Alert.alert(
          t('attach_evidence.camera_error', { defaultValue: 'Camera Error' }),
          t('attach_evidence.camera_error_msg', { defaultValue: 'Failed to open camera' })
        );
      } else if (response.assets && response.assets[0]) {
        setPhotos([...photos, response.assets[0]]);
      }
    });
  };

  const handleChooseFromGallery = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 5,
    };

    launchImageLibrary(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled gallery');
      } else if (response.error) {
        console.log('Gallery Error: ', response.error);
        Alert.alert(
          t('attach_evidence.gallery_error', { defaultValue: 'Gallery Error' }),
          t('attach_evidence.gallery_error_msg', { defaultValue: 'Failed to open gallery' })
        );
      } else if (response.assets && response.assets.length > 0) {
        setPhotos([...photos, ...response.assets]);
      }
    });
  };

  const showImagePickerOptions = () => {
    Alert.alert(
      t('attach_evidence.add_evidence', { defaultValue: 'Add Evidence' }),
      t('attach_evidence.choose_source', { defaultValue: 'Choose source' }),
      [
        { text: t('attach_evidence.camera', { defaultValue: 'Camera' }), onPress: handleTakePhoto },
        { text: t('attach_evidence.gallery', { defaultValue: 'Gallery' }), onPress: handleChooseFromGallery },
        { text: t('attach_evidence.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      ]
    );
  };

  const removePhoto = (index) => {
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };

  // ========== OFFLINE: Save resolve operation for later sync ==========
  const saveResolveOperationOffline = async () => {
    try {
      // Prepare the resolve data to save offline
      const resolveData = {
        ticketId,
        ticketNumber,
        notes: notes && notes.trim() ? notes : 'Resolved from mobile app with evidence',
        photos: photos.map(photo => ({
          uri: photo.uri,
          type: photo.type || 'image/jpeg',
          fileName: photo.fileName || `evidence_${ticketId}_${Date.now()}.jpg`,
        })),
        timestamp: new Date().toISOString(),
      };

      // Get existing pending resolves
      const existingResolves = await OfflineDatabaseService.getUserData('pending_resolve_operations') || [];
      existingResolves.push(resolveData);

      // Save to offline storage
      await OfflineDatabaseService.saveUserData('pending_resolve_operations', existingResolves);

      // Also add to sync queue for processing when online
      await OfflineDatabaseService.addToSyncQueue('RESOLVE_TICKET', `/tickets/${ticketId}/resolve`, {
        ticketId,
        notes: resolveData.notes,
        photosCount: photos.length,
      });

      console.log('✅ Resolve operation saved offline');
      return true;
    } catch (error) {
      console.error('Failed to save resolve operation offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE OPERATION ==========

  const handleResolve = async () => {
    // 1. Guard clause: Ensure at least one photo exists
    if (!photos || photos.length === 0) {
      Alert.alert(
        t('attach_evidence.missing_photo.title', { defaultValue: 'Missing Photo' }),
        t('attach_evidence.missing_photo.message', { defaultValue: 'Please take at least one photo.' })
      );
      return;
    }

    setUploading(true);

    // ========== OFFLINE: Check network status ==========
    const online = await NetworkMonitorService.isOnline();
    // ========== END OFFLINE CHECK ==========

    try {
      // ========== OFFLINE MODE: Save for later sync ==========
      if (!online) {
        // Save operation offline
        const saved = await saveResolveOperationOffline();

        if (saved) {
          Alert.alert(
            t('attach_evidence.offline_saved.title', { defaultValue: 'Saved Offline' }),
            t('attach_evidence.offline_saved.message', { defaultValue: 'Your evidence has been saved. It will be submitted automatically when you are back online.' }),
            [
              {
                text: 'OK',
                onPress: () => {
                  // Call the callback if provided (to update UI optimistically)
                  if (onResolveComplete && typeof onResolveComplete === 'function') {
                    onResolveComplete(notes, photos, true); // true indicates offline mode
                  }
                  navigation.goBack();
                }
              }
            ]
          );
        } else {
          Alert.alert(
            t('attach_evidence.offline_save_failed.title', { defaultValue: 'Save Failed' }),
            t('attach_evidence.offline_save_failed.message', { defaultValue: 'Failed to save evidence offline. Please try again.' })
          );
        }
        setUploading(false);
        return;
      }
      // ========== END OFFLINE MODE ==========

      const formData = new FormData();

      // Add notes if provided
      if (notes && notes.trim()) {
        formData.append('notes', notes);
      } else {
        formData.append('notes', 'Resolved from mobile app with evidence');
      }

      // 2. Loop through photos and append to formData
      photos.forEach((photo, index) => {
        const cleanUri = Platform.OS === 'android'
          ? photo.uri
          : photo.uri.replace('file://', '');

        formData.append('files', {
          uri: cleanUri,
          type: photo.type || 'image/jpeg',
          name: photo.fileName || `evidence_${ticketId}_${Date.now()}_${index}.jpg`,
        });
      });

      // 3. Fix URL construction - serverUrl already includes /api/v1/
      // Remove any trailing slash and don't add extra /api/v1/
      const baseUrl = serverUrl.replace(/\/+$/, '');
      const resolveUrl = `${baseUrl}/tickets/${ticketId}/resolve`;

      console.log('Calling resolve API:', resolveUrl);
      console.log('Files count:', photos.length);

      // 4. Execute the Request using authenticatedAxios
      const response = await authenticatedAxios(
        axios,
        {
          method: 'POST',
          url: resolveUrl,
          data: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
        i18n
      );

      // 5. Handle Success
      if (response.status === 200 || response.data?.success) {
        Alert.alert(
          t('attach_evidence.success.title', { defaultValue: 'Success' }),
          t('attach_evidence.success.message', { defaultValue: 'Ticket resolved successfully with evidence!' }),
          [
            {
              text: 'OK',
              onPress: () => {
                // Call the callback if provided
                if (onResolveComplete && typeof onResolveComplete === 'function') {
                  onResolveComplete(notes, photos);
                }
                navigation.goBack();
              }
            }
          ]
        );
      } else {
        throw new Error('Unexpected response');
      }
    } catch (error) {
      // 6. Enhanced Error Logging
      console.log('Resolve Error Details:', error.response?.data || error.message);

      let errorMessage = t('attach_evidence.errors.check_network', { defaultValue: 'Check network or server logs' });

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // ========== OFFLINE: Offer to save offline on error ==========
      const isNetworkError = error.message?.includes('network') ||
                            error.message?.includes('offline') ||
                            error.code === 'ERR_NETWORK';

      if (isNetworkError && !online) {
        // Offer to save offline
        Alert.alert(
          t('attach_evidence.offline_option.title', { defaultValue: 'Network Error' }),
          t('attach_evidence.offline_option.message', { defaultValue: 'Unable to reach the server. Would you like to save this evidence offline and submit later?' }),
          [
            {
              text: t('attach_evidence.offline_option.save', { defaultValue: 'Save Offline' }),
              onPress: async () => {
                const saved = await saveResolveOperationOffline();
                if (saved) {
                  Alert.alert(
                    t('attach_evidence.offline_saved.title', { defaultValue: 'Saved Offline' }),
                    t('attach_evidence.offline_saved.message', { defaultValue: 'Evidence saved. Will submit when online.' }),
                    [
                      {
                        text: 'OK',
                        onPress: () => {
                          if (onResolveComplete && typeof onResolveComplete === 'function') {
                            onResolveComplete(notes, photos, true);
                          }
                          navigation.goBack();
                        }
                      }
                    ]
                  );
                } else {
                  Alert.alert(
                    t('attach_evidence.errors.resolve_failed', { defaultValue: 'Resolve Failed' }),
                    t('attach_evidence.errors.error_message', { defaultValue: 'Error: {{message}}' }).replace('{{message}}', errorMessage)
                  );
                }
              }
            },
            {
              text: t('attach_evidence.offline_option.cancel', { defaultValue: 'Cancel' }),
              style: 'cancel'
            }
          ]
        );
      } else {
        Alert.alert(
          t('attach_evidence.errors.resolve_failed', { defaultValue: 'Resolve Failed' }),
          t('attach_evidence.errors.error_message', { defaultValue: 'Error: {{message}}' }).replace('{{message}}', errorMessage)
        );
      }
      // ========== END OFFLINE OFFER ==========
    } finally {
      setUploading(false);
    }
  };

  // ========== OFFLINE: Manual retry for pending resolves ==========
  const retryPendingResolves = async () => {
    if (!isOnline) {
      Alert.alert(
        t('attach_evidence.retry.offline', { defaultValue: 'Offline' }),
        t('attach_evidence.retry.offline_message', { defaultValue: 'Cannot retry while offline. Please connect to the internet.' })
      );
      return;
    }

    setUploading(true);
    try {
      const pendingResolves = await OfflineDatabaseService.getUserData('pending_resolve_operations');
      if (!pendingResolves || pendingResolves.length === 0) {
        Alert.alert(
          t('attach_evidence.retry.none', { defaultValue: 'No Pending' }),
          t('attach_evidence.retry.none_message', { defaultValue: 'No pending resolve operations found.' })
        );
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const resolveData of pendingResolves) {
        try {
          const formData = new FormData();
          formData.append('notes', resolveData.notes);

          // Recreate photos from saved data
          for (let i = 0; i < resolveData.photos.length; i++) {
            const photo = resolveData.photos[i];
            formData.append('files', {
              uri: photo.uri,
              type: photo.type,
              name: photo.fileName,
            });
          }

          const baseUrl = serverUrl.replace(/\/+$/, '');
          const resolveUrl = `${baseUrl}/tickets/${resolveData.ticketId}/resolve`;

          const response = await authenticatedAxios(
            axios,
            {
              method: 'POST',
              url: resolveUrl,
              data: formData,
              headers: { 'Content-Type': 'multipart/form-data' },
            },
            i18n
          );

          if (response.status === 200 || response.data?.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error('Failed to retry resolve:', err);
          failCount++;
        }
      }

      // Clear successful ones from storage
      if (successCount > 0) {
        await OfflineDatabaseService.saveUserData('pending_resolve_operations', []);
      }

      Alert.alert(
        t('attach_evidence.retry.complete', { defaultValue: 'Retry Complete' }),
        t('attach_evidence.retry.complete_message', { defaultValue: 'Success: {{success}}, Failed: {{fail}}' })
          .replace('{{success}}', successCount.toString())
          .replace('{{fail}}', failCount.toString())
      );
    } catch (error) {
      console.error('Retry error:', error);
      Alert.alert(
        t('attach_evidence.retry.error', { defaultValue: 'Error' }),
        t('attach_evidence.retry.error_message', { defaultValue: 'Failed to retry pending operations' })
      );
    } finally {
      setUploading(false);
    }
  };
  // ========== END OFFLINE RETRY ==========

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('attach_evidence.title', { defaultValue: 'Attach Evidence' })}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* ========== OFFLINE: Retry button for pending resolves ========== */}
          <TouchableOpacity onPress={retryPendingResolves} style={styles.retryButton} disabled={uploading}>
            <Text style={styles.retryButtonText}>↻</Text>
          </TouchableOpacity>
          {/* ========== END OFFLINE RETRY BUTTON ========== */}
        </View>
      </View>

      {/* ========== OFFLINE: Network status indicator ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            {t('attach_evidence.offline_banner', { defaultValue: '📴 Offline Mode - Evidence will be saved and submitted when online' })}
          </Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      <View style={styles.ticketInfo}>
        <Text style={styles.ticketLabel}>{t('attach_evidence.ticket_label', { defaultValue: 'Ticket' })}</Text>
        <Text style={styles.ticketNumber}>{ticketNumber || `#${ticketId}`}</Text>
      </View>

      <Text style={styles.subtitle}>{t('attach_evidence.subtitle', { defaultValue: 'Capture one or more images as evidence' })}</Text>

      {/* Notes Section */}
      <View style={styles.notesSection}>
        <Text style={styles.notesLabel}>{t('attach_evidence.resolution_notes', { defaultValue: 'Resolution Notes (Optional)' })}</Text>
        <TextInput
          style={styles.notesInput}
          multiline
          numberOfLines={3}
          placeholder={t('attach_evidence.notes_placeholder', { defaultValue: 'Describe how the issue was resolved...' })}
          value={notes}
          onChangeText={setNotes}
          textAlignVertical="top"
        />
      </View>

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
          <View style={styles.noPhotosContainer}>
            <Text style={styles.placeholderText}>{t('attach_evidence.no_photos', { defaultValue: 'No photos taken yet' })}</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.camBtn} onPress={showImagePickerOptions} disabled={uploading}>
          <Text style={styles.btnText}>{t('attach_evidence.add_photo', { defaultValue: '📸 ADD PHOTO' })}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadBtn, photos.length === 0 && styles.disabledBtn]}
          onPress={handleResolve}
          disabled={uploading || photos.length === 0}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {t('attach_evidence.resolve_button', { defaultValue: 'ATTATCH TICKET EVIDENCE' })}
              {photos.length > 0 ? ` (${photos.length} photo${photos.length !== 1 ? 's' : ''})` : ''}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} disabled={uploading}>
          <Text style={styles.skipText}>{t('attach_evidence.cancel_back', { defaultValue: 'Cancel and go back' })}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 28, color: '#FFA500' },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  retryButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  retryButtonText: { fontSize: 20, color: '#FFA500' },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  ticketInfo: { backgroundColor: '#F8F9FA', padding: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  ticketLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  ticketNumber: { fontSize: 18, fontWeight: 'bold', color: '#FFA500' },
  subtitle: { color: '#666', marginBottom: 20, textAlign: 'center' },
  notesSection: { marginBottom: 20, width: '100%' },
  notesLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  notesInput: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, padding: 12, fontSize: 14, color: '#1A1A1A', backgroundColor: '#FAFAFA', minHeight: 80 },
  previewContainer: { width: '100%', height: 250, backgroundColor: '#f8f9fa', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#eee' },
  scrollContainer: { padding: 15, alignItems: 'center' },
  imageWrapper: { width: 160, height: 200, marginRight: 15, position: 'relative' },
  image: { width: '100%', height: '100%', borderRadius: 10 },
  removeBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF6B6B', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  removeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  noPhotosContainer: { justifyContent: 'center', alignItems: 'center', height: '100%' },
  placeholderText: { color: '#999' },
  bottomControls: { width: '100%', gap: 10, marginTop: 'auto', paddingBottom: 20 },
  camBtn: { backgroundColor: '#444', padding: 15, borderRadius: 8, alignItems: 'center' },
  uploadBtn: { backgroundColor: '#FFA500', padding: 15, borderRadius: 8, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  skipText: { marginTop: 15, color: '#999', fontWeight: '600', textAlign: 'center' }
});

export default AttachEvidence;
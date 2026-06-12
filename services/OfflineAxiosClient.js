import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkMonitorService from './NetworkMonitorService';
import OfflineDatabaseService from './OfflineDatabaseService';

class OfflineAxiosClient {
  constructor() {
    this.pendingRequests = new Map();
  }

  async request(config, offlineDataProvider = null) {
    const isOnline = await NetworkMonitorService.isOnline();

    if (isOnline) {
      try {
        // Online: Make real API call
        const token = await AsyncStorage.getItem('accessToken');
        const response = await axios({
          ...config,
          headers: {
            ...config.headers,
            'Authorization': `Bearer ${token}`,
          },
        });

        // Cache response if needed
        if (config.cache && response.data) {
          await this.cacheResponse(config.url, response.data);
        }

        return response;
      } catch (error) {
        // If API fails but we have offline data, use it
        if (offlineDataProvider) {
          console.log('📱 API failed, using offline data');
          return { data: await offlineDataProvider(), offline: true };
        }
        throw error;
      }
    } else {
      // Offline: Use cached data or offline provider
      console.log('📴 Offline mode: using cached data');

      if (offlineDataProvider) {
        return { data: await offlineDataProvider(), offline: true };
      }

      // Try to get from cache
      const cached = await this.getCachedResponse(config.url);
      if (cached) {
        return { data: cached, offline: true };
      }

      throw new Error('No offline data available');
    }
  }

  async cacheResponse(url, data) {
    try {
      await OfflineDatabaseService.saveUserData(`cache_${url}`, {
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Cache error:', error);
    }
  }

  async getCachedResponse(url) {
    try {
      const cached = await OfflineDatabaseService.getUserData(`cache_${url}`);
      if (cached && (Date.now() - cached.timestamp) < 3600000) { // 1 hour cache
        return cached.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async postWithOfflineSupport(endpoint, data, config = {}) {
    const isOnline = await NetworkMonitorService.isOnline();

    if (isOnline) {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        const response = await axios.post(endpoint, data, {
          ...config,
          headers: {
            ...config.headers,
            'Authorization': `Bearer ${token}`,
          },
        });
        return response;
      } catch (error) {
        // Save to offline queue
        await OfflineDatabaseService.addToSyncQueue('POST', endpoint, data);
        throw new Error('Request queued for offline sync');
      }
    } else {
      // Offline: Save to queue
      await OfflineDatabaseService.addToSyncQueue('POST', endpoint, data);
      throw new Error('Request saved offline. Will sync when online.');
    }
  }
}

export default new OfflineAxiosClient();
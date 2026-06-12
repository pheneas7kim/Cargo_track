import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import Snackbar from 'react-native-snackbar';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollingInterval = useRef(null);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineNotificationsAvailable, setOfflineNotificationsAvailable] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Notification Context');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            console.log('🔄 Back online - syncing notifications...');
            fetchNotifications();
            // Restart polling if it was active
            if (isPolling) {
              stopPolling();
              startPolling();
            }
          } else {
            console.log('📴 Offline mode - using cached notifications');
            loadCachedNotifications();
          }
        });

        // Load cached notifications
        await loadCachedNotifications();

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

  // ========== OFFLINE: Load cached notifications from offline database ==========
  const loadCachedNotifications = async () => {
    try {
      const cachedNotifications = await OfflineDatabaseService.getUserData('cached_notifications');
      if (cachedNotifications && cachedNotifications.notifications && cachedNotifications.notifications.length > 0) {
        setNotifications(cachedNotifications.notifications);
        const unread = cachedNotifications.notifications.filter(n => !n.read).length;
        setUnreadCount(unread);
        setOfflineNotificationsAvailable(true);
        console.log(`📦 Loaded ${cachedNotifications.notifications.length} notifications from offline cache`);
      }
    } catch (error) {
      console.error('Error loading cached notifications:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED NOTIFICATIONS ==========

  // ========== OFFLINE: Save notifications to offline database ==========
  const saveNotificationsToOfflineCache = async (notificationsList) => {
    try {
      await OfflineDatabaseService.saveUserData('cached_notifications', {
        notifications: notificationsList,
        timestamp: Date.now(),
        count: notificationsList.length,
        unreadCount: notificationsList.filter(n => !n.read).length
      });
      console.log(`💾 Saved ${notificationsList.length} notifications to offline cache`);
      setOfflineNotificationsAvailable(true);
    } catch (error) {
      console.error('Error saving notifications to cache:', error);
    }
  };
  // ========== END OFFLINE SAVE TO CACHE ==========

  // ========== OFFLINE: Save pending read status for later sync ==========
  const savePendingReadStatus = async (notificationId, read) => {
    try {
      const pendingReads = await OfflineDatabaseService.getUserData('pending_reads') || [];
      if (!pendingReads.includes(notificationId)) {
        pendingReads.push(notificationId);
        await OfflineDatabaseService.saveUserData('pending_reads', pendingReads);

        // Add to sync queue
        await OfflineDatabaseService.addToSyncQueue('MARK_READ', `/notifications/${notificationId}/read`, { read: true });
        console.log(`📦 Read status for notification ${notificationId} saved offline`);
      }
    } catch (error) {
      console.error('Error saving pending read status:', error);
    }
  };
  // ========== END OFFLINE SAVE PENDING READ STATUS ==========

  // ========== OFFLINE: Sync pending read statuses ==========
  const syncPendingReadStatuses = async () => {
    if (!isOnline) return;

    const pendingReads = await OfflineDatabaseService.getUserData('pending_reads');
    if (!pendingReads || pendingReads.length === 0) return;

    console.log(`🔄 Syncing ${pendingReads.length} pending read statuses...`);
    let successCount = 0;

    for (const notificationId of pendingReads) {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        await axios.put(
          `${serverUrl}/notifications/${notificationId}/read`,
          {},
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        successCount++;
        console.log(`✅ Synced read status for notification ${notificationId}`);
      } catch (error) {
        console.error(`Error syncing read status for ${notificationId}:`, error);
      }
    }

    // Clear processed reads
    await OfflineDatabaseService.saveUserData('pending_reads', []);

    if (successCount > 0) {
      console.log(`✅ Synced ${successCount} read statuses`);
    }
  };
  // ========== END OFFLINE SYNC PENDING READ STATUSES ==========

  // Fetch notifications from API
  const fetchNotifications = async () => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log('📴 Offline - using cached notifications');
        await loadCachedNotifications();
        return;
      }
      // ========== END OFFLINE CHECK ==========

      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return;

      const response = await axios.get(
        `${serverUrl}/notifications?page=0&size=50&sort=createdAt,desc`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.data && response.data.content) {
        const newNotifications = response.data.content;
        setNotifications(newNotifications);
        const unread = newNotifications.filter(n => !n.read).length;
        setUnreadCount(unread);

        // ========== OFFLINE: Save to offline cache ==========
        await saveNotificationsToOfflineCache(newNotifications);
        // ========== END OFFLINE SAVE ==========

        return newNotifications;
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);

      // ========== OFFLINE: Fall back to cached data on error ==========
      const cachedNotifications = await OfflineDatabaseService.getUserData('cached_notifications');
      if (cachedNotifications && cachedNotifications.notifications) {
        setNotifications(cachedNotifications.notifications);
        const unread = cachedNotifications.notifications.filter(n => !n.read).length;
        setUnreadCount(unread);
        console.log('📦 Using cached notifications due to API error');
      }
      // ========== END OFFLINE FALLBACK ==========
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        console.log(`📴 Offline - saving read status for notification ${notificationId} for later sync`);

        // Update local state immediately
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));

        // Save for later sync
        await savePendingReadStatus(notificationId, true);

        // Update cache
        const updatedNotifications = notifications.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        );
        await saveNotificationsToOfflineCache(updatedNotifications);

        Snackbar.show({
          text: 'Marked as read (will sync when online)',
          duration: 2000,
          backgroundColor: '#FF9800',
        });
        return;
      }
      // ========== END OFFLINE CHECK ==========

      const token = await AsyncStorage.getItem('accessToken');
      await axios.put(
        `${serverUrl}/notifications/${notificationId}/read`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));

      // ========== OFFLINE: Update cache ==========
      const updatedNotifications = notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      await saveNotificationsToOfflineCache(updatedNotifications);
      // ========== END OFFLINE UPDATE CACHE ==========

    } catch (error) {
      console.error('Failed to mark as read:', error);

      // ========== OFFLINE: Save for later sync on error ==========
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      await savePendingReadStatus(notificationId, true);

      Snackbar.show({
        text: 'Saved offline - will sync when online',
        duration: 2000,
        backgroundColor: '#FF9800',
      });
      // ========== END OFFLINE SAVE ON ERROR ==========
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(n => !n.read);

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      console.log('📴 Offline - saving all read statuses for later sync');

      // Update local state immediately
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      );
      setUnreadCount(0);

      // Save each for later sync
      for (const notification of unreadNotifications) {
        await savePendingReadStatus(notification.id, true);
      }

      // Update cache
      const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
      await saveNotificationsToOfflineCache(updatedNotifications);

      Snackbar.show({
        text: `Marked ${unreadNotifications.length} as read (will sync when online)`,
        duration: 3000,
        backgroundColor: '#FF9800',
      });
      return;
    }
    // ========== END OFFLINE CHECK ==========

    for (const notification of unreadNotifications) {
      await markAsRead(notification.id);
    }
  };

  // Add local notification (for real-time updates)
  const addLocalNotification = (notification) => {
    setNotifications(prev => {
      const updated = [notification, ...prev];
      // Save to offline cache
      saveNotificationsToOfflineCache(updated);
      return updated;
    });
    if (!notification.read) {
      setUnreadCount(prev => prev + 1);
      // Show snackbar for new notification
      Snackbar.show({
        text: notification.title || 'New notification',
        duration: 3000,
        backgroundColor: '#FFA500',
        action: {
          text: 'View',
          onPress: () => {
            // Navigate to notifications screen
          },
        },
      });
    }
  };

  // Start polling for new notifications
  const startPolling = (interval = 30000) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    setIsPolling(true);
    pollingInterval.current = setInterval(async () => {
      // ========== OFFLINE: Only poll when online ==========
      const online = await NetworkMonitorService.isOnline();
      if (!online) {
        console.log('📴 Offline - skipping notification poll');
        return;
      }
      // ========== END OFFLINE CHECK ==========

      const newNotifications = await fetchNotifications();
      // Check for new unread notifications
      if (newNotifications) {
        const newUnread = newNotifications.filter(n => !n.read);
        const currentUnreadIds = notifications.filter(n => !n.read).map(n => n.id);
        const freshUnread = newUnread.filter(n => !currentUnreadIds.includes(n.id));
        freshUnread.forEach(notification => {
          addLocalNotification(notification);
        });
      }
    }, interval);
  };

  // Stop polling
  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    setIsPolling(false);
  };

  // ========== OFFLINE: Manual sync for notifications ==========
  const manualSyncNotifications = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot sync while offline',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setLoading(true);
    try {
      await syncPendingReadStatuses();
      await fetchNotifications();
      Snackbar.show({
        text: 'Notifications synchronized!',
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: 'Sync failed',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
    startPolling();

    return () => {
      stopPolling();
    };
  }, []);

  const value = {
    notifications,
    unreadCount,
    loading,
    isPolling,
    isOnline, // ✅ Expose online status
    offlineNotificationsAvailable, // ✅ Expose offline availability
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    addLocalNotification,
    startPolling,
    stopPolling,
    manualSyncNotifications, // ✅ Expose manual sync
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
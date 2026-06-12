import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNotifications } from './NotificationContext';
import { formatDistanceToNow } from 'date-fns';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width, height } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;

const NotificationBell = () => {
  const navigation = useNavigation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [offlineNotifications, setOfflineNotifications] = useState([]);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // Pan responder for swipe to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          const newX = DRAWER_WIDTH + gestureState.dx;
          if (newX > 0) {
            slideAnim.setValue(newX);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          closeDrawer();
        } else {
          openDrawer();
        }
      },
    })
  ).current;

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Notification Bell');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            console.log('🌐 Back online in NotificationBell');
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
      OfflineSyncService.stopAutoSync();
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Cache notifications ==========
  const cacheNotifications = async () => {
    try {
      await OfflineDatabaseService.saveUserData('cached_notifications', {
        data: notifications,
        unreadCount: unreadCount,
        timestamp: Date.now()
      });
      console.log('✅ Notifications cached offline');
    } catch (error) {
      console.error('Error caching notifications:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached notifications ==========
  const loadCachedNotifications = async () => {
    try {
      const cached = await OfflineDatabaseService.getUserData('cached_notifications');
      if (cached && cached.data && cached.data.length > 0) {
        setOfflineNotifications(cached.data);
        console.log('📦 Loaded cached notifications');
      }
    } catch (error) {
      console.error('Error loading cached notifications:', error);
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Save read status offline ==========
  const saveReadStatusOffline = async (notificationId) => {
    try {
      const readActions = await OfflineDatabaseService.getUserData('pending_read_actions') || [];
      if (!readActions.includes(notificationId)) {
        readActions.push(notificationId);
        await OfflineDatabaseService.saveUserData('pending_read_actions', readActions);
        await OfflineDatabaseService.addToSyncQueue('MARK_READ', `/notifications/${notificationId}/read`, { id: notificationId });
        console.log(`📦 Mark read action saved offline for notification ${notificationId}`);
      }
      return true;
    } catch (error) {
      console.error('Error saving read status offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE READ STATUS ==========

  // ========== OFFLINE: Save mark all read offline ==========
  const saveMarkAllReadOffline = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      const readActions = await OfflineDatabaseService.getUserData('pending_read_actions') || [];

      for (const id of unreadIds) {
        if (!readActions.includes(id)) {
          readActions.push(id);
          await OfflineDatabaseService.addToSyncQueue('MARK_READ', `/notifications/${id}/read`, { id: id });
        }
      }

      await OfflineDatabaseService.saveUserData('pending_read_actions', readActions);
      console.log(`📦 Mark all read action saved offline for ${unreadIds.length} notifications`);
      return true;
    } catch (error) {
      console.error('Error saving mark all read offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE MARK ALL READ ==========

  // Cache notifications whenever they change
  useEffect(() => {
    if (notifications.length > 0) {
      cacheNotifications();
    }
  }, [notifications, unreadCount]);

  const openDrawer = () => {
    setIsDrawerOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: DRAWER_WIDTH,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setIsDrawerOpen(false));
  };

  const handleNotificationPress = (notification) => {
    if (!notification.read) {
      // ========== OFFLINE: Save read action offline if needed ==========
      if (!isOnline) {
        saveReadStatusOffline(notification.id);
      }
      // ========== END OFFLINE SAVE ==========
      markAsRead(notification.id);
    }
    closeDrawer();
    // Navigate based on notification type
    if (notification.type === 'GEOFENCE_VIOLATION') {
      navigation.navigate('DeviceMap');
    } else if (notification.deviceSerialNumber) {
      navigation.navigate('DeviceDetails', { deviceId: notification.deviceSerialNumber });
    }
  };

  const handleMarkAllAsRead = async () => {
    // ========== OFFLINE: Save mark all read action offline if needed ==========
    if (!isOnline) {
      await saveMarkAllReadOffline();
    }
    // ========== END OFFLINE SAVE ==========
    markAllAsRead();
  };

  const getNotificationIcon = (type, priority) => {
    if (priority === 'CRITICAL') return 'error';
    switch(type) {
      case 'GEOFENCE_VIOLATION': return 'location-on';
      case 'SPEED_VIOLATION': return 'speed';
      case 'FUEL_THEFT': return 'local-gas-station';
      case 'MAINTENANCE': return 'build';
      default: return 'notifications';
    }
  };

  const getNotificationColor = (priority, read) => {
    if (!read) return '#FFA500';
    if (priority === 'CRITICAL') return '#FF6B6B';
    return '#4CAF50';
  };

  const formatTime = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (e) {
      return 'recently';
    }
  };

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadItem]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={[styles.notificationIcon, { backgroundColor: getNotificationColor(item.priority, item.read) + '20' }]}>
        <Icon name={getNotificationIcon(item.type, item.priority)} size={24} color={getNotificationColor(item.priority, item.read)} />
      </View>
      <View style={styles.notificationContent}>
        <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
          {item.title}
        </Text>
        <Text style={styles.notificationMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.notificationTime}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  // Use cached notifications when offline and no real notifications
  const displayNotifications = notifications.length > 0 ? notifications : offlineNotifications;
  const displayUnreadCount = notifications.length > 0 ? unreadCount : offlineNotifications.filter(n => !n.read).length;

  return (
    <>
      <TouchableOpacity style={styles.bellButton} onPress={openDrawer}>
        <Icon name="notifications" size={24} color="#1A1A1A" />
        {displayUnreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {displayUnreadCount > 99 ? '99+' : displayUnreadCount}
            </Text>
          </View>
        )}
        {/* ========== OFFLINE: Offline indicator dot ========== */}
        {!isOnline && (
          <View style={styles.offlineDot} />
        )}
        {/* ========== END OFFLINE INDICATOR ========== */}
      </TouchableOpacity>

      {isDrawerOpen && (
        <>
          <Animated.View
            style={[styles.overlay, { opacity: fadeAnim }]}
            onStartShouldSetResponder={() => true}
            onResponderRelease={closeDrawer}
          />
          <Animated.View
            style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
            {...panResponder.panHandlers}
          >
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Notifications</Text>
              <View style={styles.drawerActions}>
                {/* ========== OFFLINE: Sync indicator ========== */}
                {!isOnline && (
                  <View style={styles.offlineBadge}>
                    <Icon name="wifi-off" size={12} color="#FF9800" />
                    <Text style={styles.offlineBadgeText}>Offline</Text>
                  </View>
                )}
                {/* ========== END OFFLINE INDICATOR ========== */}
                {displayUnreadCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.markAllButton}>
                    <Text style={styles.markAllText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={closeDrawer} style={styles.closeButton}>
                  <Icon name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={displayNotifications}
              keyExtractor={item => item.id.toString()}
              renderItem={renderNotification}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.notificationList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Icon name="notifications-off" size={64} color="#CCC" />
                  <Text style={styles.emptyTitle}>No notifications</Text>
                  <Text style={styles.emptyText}>You're all caught up!</Text>
                </View>
              }
            />

            {/* ========== OFFLINE: Pending actions banner ========== */}
            {!isOnline && displayNotifications.length > 0 && (
              <View style={styles.offlineFooter}>
                <Icon name="sync" size={14} color="#FF9800" />
                <Text style={styles.offlineFooterText}>
                  Offline - Actions will sync when online
                </Text>
              </View>
            )}
            {/* ========== END OFFLINE PENDING BANNER ========== */}
          </Animated.View>
        </>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  bellButton: {
    position: 'relative',
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  offlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF9800',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 101,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  drawerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  offlineBadgeText: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '500',
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  markAllText: {
    fontSize: 12,
    color: '#FFA500',
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  notificationList: {
    padding: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadItem: {
    backgroundColor: '#FFF9E6',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: '700',
    color: '#FFA500',
  },
  notificationMessage: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    lineHeight: 16,
  },
  notificationTime: {
    fontSize: 10,
    color: '#999',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFA500',
    marginLeft: 8,
    alignSelf: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  offlineFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 8,
  },
  offlineFooterText: {
    fontSize: 11,
    color: '#FF9800',
  },
});

export default NotificationBell;
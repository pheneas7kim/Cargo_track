import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  ScrollView,
  Animated,
  Easing
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

const { width } = Dimensions.get('window');

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
const authenticatedAxios = async (method, config, i18n, retryCount = 0) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    // Create a new axios instance for each request
    const axiosInstance = axios.create();

    const response = await axiosInstance({
      method: method, // 'get', 'post', 'put', 'delete', etc.
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    return response;
  } catch (error) {
    console.error('❌ API Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    if (error.response?.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedAxios(method, config, i18n, 1);
      }
    }
    throw error;
  }
};

const NotificationsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalElements, setTotalElements] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filter, setFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in NotificationsScreen');
    });
    return () => removeListener();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchNotifications();

      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const fetchNotifications = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      // ✅ FIXED: Changed to use authenticatedAxios
      const response = await authenticatedAxios(
        'get',  // <-- Use string method name
        {
          url: `${serverUrl}/notifications?page=0&size=1000000000&alarm=false&sort=createdAt,desc`,
        },
        i18n
      );

      if (response.data && response.data.content) {
        setNotifications(response.data.content);
        setTotalElements(response.data.totalElements);

        const unread = response.data.content.filter(n => !n.read).length;
        const critical = response.data.content.filter(n => n.priority === 'CRITICAL').length;
        setUnreadCount(unread);
        setCriticalCount(critical);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      Snackbar.show({
        text: t('notifications.errors.load_failed', { defaultValue: 'Failed to load notifications' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications(true);
  };

  const markAsRead = async (notificationId) => {
    try {
      // ✅ FIXED: Changed to use authenticatedAxios
      await authenticatedAxios(
        'put',  // <-- Use string method name
        {
          url: `${serverUrl}/notifications/${notificationId}/read`,
          data: {},
        },
        i18n
      );

      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );

      setUnreadCount(prev => Math.max(0, prev - 1));

      Snackbar.show({
        text: t('notifications.success.marked_read', { defaultValue: 'Marked as read' }),
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) {
      Snackbar.show({
        text: t('notifications.info.no_unread', { defaultValue: 'No unread notifications' }),
        duration: 2000,
        backgroundColor: '#FFA500',
      });
      return;
    }

    try {
      const unreadNotifications = notifications.filter(n => !n.read);

      for (const notification of unreadNotifications) {
        await authenticatedAxios(
          'put',
          {
            url: `${serverUrl}/notifications/${notification.id}/read`,
            data: {},
          },
          i18n
        );
      }

      setNotifications(prev =>
        prev.map(notif => ({ ...notif, read: true }))
      );
      setUnreadCount(0);

      Snackbar.show({
        text: t('notifications.success.all_marked_read', { defaultValue: 'All notifications marked as read' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      Snackbar.show({
        text: t('notifications.errors.mark_all_failed', { defaultValue: 'Failed to mark all as read' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    }
  };

  const getNotificationIcon = (type, priority) => {
    if (priority === 'CRITICAL') return '🔴';
    switch(type) {
      case 'GEOFENCE_VIOLATION': return '📍';
      case 'SPEED_VIOLATION': return '⚡';
      case 'FUEL_THEFT': return '⛽';
      case 'MAINTENANCE': return '🔧';
      default: return '🔔';
    }
  };

  const getNotificationColor = (priority, read) => {
    if (!read) return '#FFF9E6';
    if (priority === 'CRITICAL') return '#FFEBEE';
    return '#FFFFFF';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('notifications.time.just_now', { defaultValue: 'Just now' });
    if (diffMins < 60) return t('notifications.time.minutes_ago', { defaultValue: '{{count}}m ago' }).replace('{{count}}', diffMins.toString());
    if (diffHours < 24) return t('notifications.time.hours_ago', { defaultValue: '{{count}}h ago' }).replace('{{count}}', diffHours.toString());
    if (diffDays < 7) return t('notifications.time.days_ago', { defaultValue: '{{count}}d ago' }).replace('{{count}}', diffDays.toString());
    return date.toLocaleDateString();
  };

  const getFilteredNotifications = () => {
    switch(filter) {
      case 'unread':
        return notifications.filter(n => !n.read);
      case 'critical':
        return notifications.filter(n => n.priority === 'CRITICAL');
      default:
        return notifications;
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderNotification = ({ item, index }) => {
    const isExpanded = expandedId === item.id;

    return (
      <Animatable.View
        animation="fadeInUp"
        delay={index * 80}
        duration={400}
        style={styles.animationWrapper}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => toggleExpand(item.id)}
          onLongPress={() => {
            setSelectedNotification(item);
            setModalVisible(true);
            if (!item.read) markAsRead(item.id);
          }}
          delayLongPress={200}
        >
          <View style={[styles.notificationCard, { backgroundColor: getNotificationColor(item.priority, item.read) }]}>
            <View style={styles.notificationContent}>
              <View style={styles.notificationHeader}>
                <View style={styles.iconContainer}>
                  <Text style={styles.iconText}>
                    {getNotificationIcon(item.type, item.priority)}
                  </Text>
                </View>
                <View style={styles.titleContainer}>
                  <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
                    {item.title}
                  </Text>
                  {item.priority === 'CRITICAL' && (
                    <View style={styles.criticalBadge}>
                      <Text style={styles.criticalText}>{t('notifications.critical', { defaultValue: 'CRITICAL' })}</Text>
                    </View>
                  )}
                </View>
                {!item.read && <View style={styles.unreadDot} />}
              </View>

              <Text
                style={styles.notificationMessage}
                numberOfLines={isExpanded ? undefined : 2}
              >
                {item.message}
              </Text>

              <View style={styles.notificationFooter}>
                <View style={styles.timeContainer}>
                  <Text style={styles.timeIcon}>🕒</Text>
                  <Text style={styles.notificationTime}>
                    {formatDate(item.createdAt)}
                  </Text>
                </View>
                {item.deviceSerialNumber && (
                  <View style={styles.deviceContainer}>
                    <Text style={styles.deviceIcon}>📱</Text>
                    <Text style={styles.deviceInfo}>
                      {item.deviceSerialNumber}
                    </Text>
                  </View>
                )}
                <Text style={styles.expandIcon}>
                  {isExpanded ? '▲' : '▼'}
                </Text>
              </View>

              {isExpanded && item.alarm && (
                <Animatable.View animation="pulse" iterationCount={1} style={styles.alarmWarning}>
                  <Text style={styles.alarmText}>⚠️ {t('notifications.alarm_triggered', { defaultValue: 'Alarm Triggered' })}</Text>
                </Animatable.View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderHeader = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('notifications.title', { defaultValue: 'Notifications' })}</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
              <Text style={styles.markAllText}>{t('notifications.mark_all_read', { defaultValue: 'Mark all read' })}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalElements}</Text>
            <Text style={styles.statLabel}>{t('notifications.stats.total', { defaultValue: 'Total' })}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMiddle]}>
            <Text style={[styles.statNumber, styles.unreadStat]}>{unreadCount}</Text>
            <Text style={styles.statLabel}>{t('notifications.stats.unread', { defaultValue: 'Unread' })}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, styles.criticalStat]}>{criticalCount}</Text>
            <Text style={styles.statLabel}>{t('notifications.stats.critical', { defaultValue: 'Critical' })}</Text>
          </View>
        </View>

        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.activeFilter]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
              {t('notifications.filters.all', { defaultValue: 'All' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'unread' && styles.activeFilter]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterText, filter === 'unread' && styles.activeFilterText]}>
              {t('notifications.filters.unread', { defaultValue: 'Unread' })}
            </Text>
            {unreadCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'critical' && styles.activeFilter]}
            onPress={() => setFilter('critical')}
          >
            <Text style={[styles.filterText, filter === 'critical' && styles.activeFilterText]}>
              {t('notifications.filters.critical', { defaultValue: 'Critical' })}
            </Text>
            {criticalCount > 0 && (
              <View style={[styles.filterBadge, styles.criticalBadgeSmall]}>
                <Text style={styles.filterBadgeText}>{criticalCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('notifications.loading', { defaultValue: 'Loading notifications...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <FlatList
        data={getFilteredNotifications()}
        keyExtractor={item => item.id.toString()}
        renderItem={renderNotification}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFA500"
            colors={['#FFA500']}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Animatable.View animation="fadeIn" duration={500} style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>{t('notifications.empty.title', { defaultValue: 'No notifications' })}</Text>
            <Text style={styles.emptyText}>
              {filter === 'unread'
                ? t('notifications.empty.no_unread', { defaultValue: 'You have no unread notifications' })
                : filter === 'critical'
                ? t('notifications.empty.no_critical', { defaultValue: 'No critical notifications' })
                : t('notifications.empty.all_caught_up', { defaultValue: 'You\'re all caught up!' })}
            </Text>
          </Animatable.View>
        }
      />

      {/* Notification Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('notifications.modal.title', { defaultValue: 'Notification Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedNotification && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>{t('notifications.modal.title_label', { defaultValue: 'Title' })}</Text>
                  <Text style={styles.detailValue}>{selectedNotification.title}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>{t('notifications.modal.message_label', { defaultValue: 'Message' })}</Text>
                  <Text style={styles.detailValue}>{selectedNotification.message}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>{t('notifications.modal.priority_label', { defaultValue: 'Priority' })}</Text>
                  <View style={[styles.priorityBadge,
                    { backgroundColor: selectedNotification.priority === 'CRITICAL' ? '#FF6B6B20' : '#FFA50020' }]}>
                    <Text style={[styles.priorityText,
                      { color: selectedNotification.priority === 'CRITICAL' ? '#FF6B6B' : '#FFA500' }]}>
                      {selectedNotification.priority}
                    </Text>
                  </View>
                </View>

                {selectedNotification.type && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>{t('notifications.modal.type_label', { defaultValue: 'Type' })}</Text>
                    <Text style={styles.detailValue}>{selectedNotification.type}</Text>
                  </View>
                )}

                {selectedNotification.deviceSerialNumber && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>{t('notifications.modal.device_serial_label', { defaultValue: 'Device Serial' })}</Text>
                    <Text style={styles.detailValue}>{selectedNotification.deviceSerialNumber}</Text>
                  </View>
                )}

                {selectedNotification.geofenceName && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>{t('notifications.modal.geofence_label', { defaultValue: 'Geofence' })}</Text>
                    <Text style={styles.detailValue}>{selectedNotification.geofenceName}</Text>
                  </View>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>{t('notifications.modal.datetime_label', { defaultValue: 'Date & Time' })}</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedNotification.createdAt).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>{t('notifications.modal.status_label', { defaultValue: 'Status' })}</Text>
                  <Text style={[styles.detailValue, selectedNotification.read && styles.readStatus]}>
                    {selectedNotification.read
                      ? t('notifications.status.read', { defaultValue: '✓ Read' })
                      : t('notifications.status.unread', { defaultValue: '○ Unread' })}
                  </Text>
                </View>

                {selectedNotification.alarm && (
                  <Animatable.View animation="shake" iterationCount={2} style={styles.alarmIndicator}>
                    <Text style={styles.alarmText}>⚠️ {t('notifications.alarm_triggered', { defaultValue: 'Alarm Triggered' })}</Text>
                  </Animatable.View>
                )}

                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeModalButtonText}>{t('notifications.modal.close', { defaultValue: 'Close' })}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animatable.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  backButtonText: {
    fontSize: 28,
    color: '#1A1A1A',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFA50010',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFA50030',
  },
  markAllText: {
    fontSize: 12,
    color: '#FFA500',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 12,
    borderRadius: 12,
  },
  statCardMiddle: {
    marginHorizontal: 0,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  unreadStat: {
    color: '#FFA500',
  },
  criticalStat: {
    color: '#FF6B6B',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    position: 'relative',
  },
  activeFilter: {
    backgroundColor: '#FFA50020',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeFilterText: {
    color: '#FFA500',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFA500',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  criticalBadgeSmall: {
    backgroundColor: '#FF6B6B',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 20,
  },
  animationWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  notificationCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  iconText: {
    fontSize: 20,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  unreadTitle: {
    fontWeight: '700',
    color: '#FFA500',
  },
  criticalBadge: {
    backgroundColor: '#FF6B6B20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  criticalText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFA500',
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeIcon: {
    fontSize: 10,
  },
  notificationTime: {
    fontSize: 11,
    color: '#999',
  },
  deviceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deviceIcon: {
    fontSize: 10,
  },
  deviceInfo: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
  },
  expandIcon: {
    fontSize: 12,
    color: '#999',
    paddingHorizontal: 8,
  },
  alarmWarning: {
    backgroundColor: '#FF6B6B20',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  alarmText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#999',
    fontWeight: '300',
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  readStatus: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  alarmIndicator: {
    backgroundColor: '#FF6B6B20',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  closeModalButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  closeModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default NotificationsScreen;
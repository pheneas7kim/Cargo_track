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
  TextInput,
  Alert,
  Platform
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';
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

// ✅ FIXED: Helper function to make authenticated axios request with retry on 401
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

// Helper to format time ago
const formatTimeAgo = (dateString, t) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return t('alerts.time.just_now', { defaultValue: 'Just now' });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('alerts.time.minutes_ago', { defaultValue: '{{count}}m ago' }).replace('{{count}}', minutes.toString());
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('alerts.time.hours_ago', { defaultValue: '{{count}}h ago' }).replace('{{count}}', hours.toString());
  const days = Math.floor(hours / 24);
  if (days < 7) return t('alerts.time.days_ago', { defaultValue: '{{count}}d ago' }).replace('{{count}}', days.toString());
  return date.toLocaleDateString();
};

// Priority order for sorting
const PRIORITY_ORDER = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

const getPriorityStyle = (priority, t) => {
  switch (priority) {
    case 'CRITICAL':
      return { bg: '#fee2e2', color: '#dc2626', icon: 'error', label: t('alerts.priority.critical', { defaultValue: 'CRITICAL' }) };
    case 'HIGH':
      return { bg: '#ffedd5', color: '#f97316', icon: 'warning', label: t('alerts.priority.high', { defaultValue: 'HIGH' }) };
    case 'MEDIUM':
      return { bg: '#fef9c3', color: '#eab308', icon: 'access-time', label: t('alerts.priority.medium', { defaultValue: 'MEDIUM' }) };
    default:
      return { bg: '#e0f2fe', color: '#0284c7', icon: 'info', label: t('alerts.priority.low', { defaultValue: 'LOW' }) };
  }
};

const AlarmsNotigicationScreen = () => {
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
  const [unattendedCount, setUnattendedCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [users, setUsers] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignNotificationId, setAssignNotificationId] = useState(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignComment, setAssignComment] = useState('');
  const [attendModalVisible, setAttendModalVisible] = useState(false);
  const [attendNotificationId, setAttendNotificationId] = useState(null);
  const [attendComment, setAttendComment] = useState('');

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in AlarmsNotigicationScreen');
    });
    return () => removeListener();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();      // load all notifications
      fetchUsers();
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => false);
      return () => backHandler.remove();
    }, [])
  );

  const fetchUsers = async () => {
    try {
      // ✅ FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/users/userList?pageNo=0&pageSize=1000`,
        },
        i18n
      );

      if (response.data) setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);

      // Use a very large page size to fetch all notifications at once
      // ✅ FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/notifications?page=0&size=10000&alarm=false&sort=createdAt,desc`,
        },
        i18n
      );

      if (response.data && response.data.content) {
        const newNotifications = response.data.content;
        setNotifications(newNotifications);
        setTotalElements(response.data.totalElements);

        // Update counts
        const unread = newNotifications.filter(n => !n.read).length;
        const unattended = newNotifications.filter(n => !n.attended).length;
        const critical = newNotifications.filter(n => n.priority === 'CRITICAL').length;
        setUnreadCount(unread);
        setUnattendedCount(unattended);
        setCriticalCount(critical);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      Snackbar.show({
        text: t('alerts.errors.load_failed', { defaultValue: 'Failed to load notifications' }),
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
    fetchNotifications();
  };

  const markAsRead = async (id) => {
    try {
      // ✅ FIXED: Changed from axios.post to 'post' string method
      await authenticatedAxios(
        'post',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/notifications/${id}/read`,
          data: {},
        },
        i18n
      );

      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      Snackbar.show({ text: t('alerts.success.marked_read', { defaultValue: 'Marked as read' }), duration: 2000, backgroundColor: '#4CAF50' });
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) {
      Snackbar.show({ text: t('alerts.no_unread', { defaultValue: 'No unread notifications' }), duration: 2000, backgroundColor: '#FFA500' });
      return;
    }
    try {
      await Promise.all(
        unreadIds.map(id =>
          authenticatedAxios(
            'post',  // <-- FIXED: Use string method name
            {
              url: `${serverUrl}/notifications/${id}/read`,
              data: {},
            },
            i18n
          )
        )
      );
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      Snackbar.show({ text: t('alerts.success.all_marked_read', { defaultValue: 'All marked as read' }), duration: 2000, backgroundColor: '#4CAF50' });
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  };

  const markAsAttended = async (id, comments) => {
    try {
      // ✅ FIXED: Changed from axios.post to 'post' string method
      await authenticatedAxios(
        'post',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/notifications/${id}/attend`,
          data: { comments },
        },
        i18n
      );

      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, attended: true } : n))
      );
      setUnattendedCount(prev => Math.max(0, prev - 1));
      Snackbar.show({ text: t('alerts.success.marked_attended', { defaultValue: 'Marked as attended' }), duration: 2000, backgroundColor: '#4CAF50' });
    } catch (error) {
      console.error('Failed to mark as attended', error);
    }
  };

  const assignNotification = async () => {
    if (!assignUserId) {
      Snackbar.show({ text: t('alerts.errors.select_user', { defaultValue: 'Please select a user' }), duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }
    try {
      // ✅ FIXED: Changed from axios.post to 'post' string method
      await authenticatedAxios(
        'post',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/notifications/${assignNotificationId}/assign`,
          data: { assigneeId: parseInt(assignUserId), comments: assignComment },
        },
        i18n
      );

      Snackbar.show({ text: t('alerts.success.assigned', { defaultValue: 'Notification assigned' }), duration: 2000, backgroundColor: '#4CAF50' });
      setAssignModalVisible(false);
      setAssignUserId('');
      setAssignComment('');
    } catch (error) {
      console.error('Failed to assign', error);
      Snackbar.show({ text: t('alerts.errors.assign_failed', { defaultValue: 'Assignment failed' }), duration: 2000, backgroundColor: '#FF6B6B' });
    }
  };

  const openAssignModal = (id) => {
    setAssignNotificationId(id);
    setAssignModalVisible(true);
  };

  const openAttendModal = (id) => {
    setAttendNotificationId(id);
    setAttendModalVisible(true);
  };

  const submitAttend = () => {
    if (!attendComment.trim()) {
      Snackbar.show({ text: t('alerts.errors.comment_required', { defaultValue: 'Please enter comments' }), duration: 2000, backgroundColor: '#FF6B6B' });
      return;
    }
    markAsAttended(attendNotificationId, attendComment);
    setAttendModalVisible(false);
    setAttendComment('');
  };

  const viewOnMap = (deviceSerialNumber) => {
    navigation.navigate('DeviceMapScreen', { focusDevice: deviceSerialNumber });
  };

  const getFilteredNotifications = () => {
    let filtered = [...notifications];
    switch (filter) {
      case 'unread':
        filtered = filtered.filter(n => !n.read);
        break;
      case 'unattended':
        filtered = filtered.filter(n => !n.attended);
        break;
      case 'critical':
        filtered = filtered.filter(n => n.priority === 'CRITICAL');
        break;
      default:
        break;
    }
    // Sort by priority and then by date (newest first)
    filtered.sort((a, b) => {
      const p1 = PRIORITY_ORDER[a.priority] || 99;
      const p2 = PRIORITY_ORDER[b.priority] || 99;
      if (p1 !== p2) return p1 - p2;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return filtered;
  };

  const renderNotificationItem = ({ item }) => {
    const priorityStyle = getPriorityStyle(item.priority, t);
    const isUnread = !item.read;
    const isUnattended = !item.attended;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.card, isUnread && styles.unreadCard]}
        onPress={() => {
          setSelectedNotification(item);
          setModalVisible(true);
          if (isUnread) markAsRead(item.id);
        }}
      >
        {/* Priority bar */}
        <View style={[styles.priorityBar, { backgroundColor: priorityStyle.color }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <Icon name={priorityStyle.icon} size={20} color={priorityStyle.color} />
              <Text style={styles.cardTitle}>{item.title || t('alerts.notification', { defaultValue: 'Notification' })}</Text>
            </View>
            <Text style={styles.timeText}>{formatTimeAgo(item.createdAt, t)}</Text>
          </View>

          {/* Message */}
          <Text numberOfLines={2} style={styles.messageText}>
            {item.message || t('alerts.no_message', { defaultValue: 'No message content' })}
          </Text>

          {/* Metadata */}
          <View style={styles.metadata}>
            <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bg }]}>
              <Text style={[styles.priorityText, { color: priorityStyle.color }]}>
                {priorityStyle.label}
              </Text>
            </View>
            {item.type && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{item.type}</Text>
              </View>
            )}
          </View>

          {/* Footer actions */}
          <View style={styles.cardFooter}>
            <View style={styles.footerButtons}>
              {isUnread && (
                <TouchableOpacity
                  style={styles.footerButton}
                  onPress={() => markAsRead(item.id)}
                >
                  <Icon name="check" size={16} color="#666" />
                  <Text style={styles.footerButtonText}>{t('alerts.buttons.read', { defaultValue: 'Read' })}</Text>
                </TouchableOpacity>
              )}
              {isUnattended && (
                <TouchableOpacity
                  style={styles.footerButton}
                  onPress={() => openAttendModal(item.id)}
                >
                  <Icon name="edit" size={16} color="#666" />
                  <Text style={styles.footerButtonText}>{t('alerts.buttons.attend', { defaultValue: 'Attend' })}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.footerButton}
                onPress={() => openAssignModal(item.id)}
              >
                <Icon name="person-add" size={16} color="#666" />
                <Text style={styles.footerButtonText}>{t('alerts.buttons.assign', { defaultValue: 'Assign' })}</Text>
              </TouchableOpacity>
              {item.deviceSerialNumber && (
                <TouchableOpacity
                  style={styles.footerButton}
                  onPress={() => viewOnMap(item.deviceSerialNumber)}
                >
                  <Icon name="map" size={16} color="#1976d2" />
                  <Text style={[styles.footerButtonText, { color: '#1976d2' }]}>{t('alerts.buttons.view', { defaultValue: 'View' })}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStats = () => (
    <View style={styles.statsContainer}>
      <View style={styles.statCard}>
        <Icon name="bell" size={16} color="#1a1f36" />
        <Text style={styles.statNumber}>{totalElements}</Text>
        <Text style={styles.statLabel}>{t('alerts.stats.total', { defaultValue: 'Total' })}</Text>
      </View>
      <View style={styles.statCard}>
        <Icon name="mark-email-unread" size={16} color="#1976d2" />
        <Text style={[styles.statNumber, styles.unreadStat]}>{unreadCount}</Text>
        <Text style={styles.statLabel}>{t('alerts.stats.unread', { defaultValue: 'Unread' })}</Text>
      </View>
      <View style={styles.statCard}>
        <Icon name="access-time" size={16} color="#ed6c02" />
        <Text style={[styles.statNumber, styles.unattendedStat]}>{unattendedCount}</Text>
        <Text style={styles.statLabel}>{t('alerts.stats.unattended', { defaultValue: 'Unattended' })}</Text>
      </View>
      <View style={styles.statCard}>
        <Icon name="error" size={16} color="#dc2626" />
        <Text style={[styles.statNumber, styles.criticalStat]}>{criticalCount}</Text>
        <Text style={styles.statLabel}>{t('alerts.stats.critical', { defaultValue: 'Critical' })}</Text>
      </View>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <TouchableOpacity
        style={[styles.filterChip, filter === 'all' && styles.activeFilter]}
        onPress={() => setFilter('all')}
      >
        <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>{t('alerts.filters.all', { defaultValue: 'All' })}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.filterChip, filter === 'unattended' && styles.activeFilter]}
        onPress={() => setFilter('unattended')}
      >
        <Text style={[styles.filterText, filter === 'unattended' && styles.activeFilterText]}>{t('alerts.filters.unattended', { defaultValue: 'Unattended' })}</Text>
        {unattendedCount > 0 && <View style={styles.filterBadge}><Text style={styles.badgeText}>{unattendedCount}</Text></View>}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.filterChip, filter === 'critical' && styles.activeFilter]}
        onPress={() => setFilter('critical')}
      >
        <Text style={[styles.filterText, filter === 'critical' && styles.activeFilterText]}>{t('alerts.filters.critical', { defaultValue: 'Critical' })}</Text>
        {criticalCount > 0 && <View style={[styles.filterBadge, styles.criticalBadge]}><Text style={styles.badgeText}>{criticalCount}</Text></View>}
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('alerts.title', { defaultValue: 'Alerts' })}</Text>
        <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
          <Icon name="done-all" size={20} color="#FFA500" />
          <Text style={styles.markAllText}>{t('alerts.mark_all_read', { defaultValue: 'Mark all read' })}</Text>
        </TouchableOpacity>
      </View>
      {renderStats()}
      {renderFilters()}
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('alerts.loading', { defaultValue: 'Loading...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredData = getFilteredNotifications();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <FlatList
        data={filteredData}
        keyExtractor={item => item.id.toString()}
        renderItem={renderNotificationItem}
        ListHeaderComponent={renderHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFA500" />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        numColumns={width > 768 ? 2 : 1}
        columnWrapperStyle={width > 768 ? styles.row : null}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="notifications-off" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>{t('alerts.empty.title', { defaultValue: 'No notifications' })}</Text>
            <Text style={styles.emptyText}>
              {filter === 'unread' ? t('alerts.empty.no_unread', { defaultValue: 'No unread notifications' }) :
               filter === 'unattended' ? t('alerts.empty.no_unattended', { defaultValue: 'No unattended notifications' }) :
               filter === 'critical' ? t('alerts.empty.no_critical', { defaultValue: 'No critical notifications' }) :
               t('alerts.empty.all_caught', { defaultValue: 'All caught up!' })}
            </Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('alerts.modal.title', { defaultValue: 'Notification Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            {selectedNotification && (
              <ScrollView style={styles.modalBody}>
                <Text style={styles.detailLabel}>{t('alerts.modal.title_label', { defaultValue: 'Title' })}</Text>
                <Text style={styles.detailValue}>{selectedNotification.title}</Text>
                <Text style={styles.detailLabel}>{t('alerts.modal.message_label', { defaultValue: 'Message' })}</Text>
                <Text style={styles.detailValue}>{selectedNotification.message}</Text>
                <Text style={styles.detailLabel}>{t('alerts.modal.priority_label', { defaultValue: 'Priority' })}</Text>
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityStyle(selectedNotification.priority, t).bg, alignSelf: 'flex-start' }]}>
                  <Text style={[styles.priorityText, { color: getPriorityStyle(selectedNotification.priority, t).color }]}>
                    {getPriorityStyle(selectedNotification.priority, t).label}
                  </Text>
                </View>
                {selectedNotification.type && (
                  <>
                    <Text style={styles.detailLabel}>{t('alerts.modal.type_label', { defaultValue: 'Type' })}</Text>
                    <Text style={styles.detailValue}>{selectedNotification.type}</Text>
                  </>
                )}
                {selectedNotification.deviceSerialNumber && (
                  <>
                    <Text style={styles.detailLabel}>{t('alerts.modal.device_serial_label', { defaultValue: 'Device Serial' })}</Text>
                    <Text style={styles.detailValue}>{selectedNotification.deviceSerialNumber}</Text>
                  </>
                )}
                {selectedNotification.geofenceName && (
                  <>
                    <Text style={styles.detailLabel}>{t('alerts.modal.geofence_label', { defaultValue: 'Geofence' })}</Text>
                    <Text style={styles.detailValue}>{selectedNotification.geofenceName}</Text>
                  </>
                )}
                <Text style={styles.detailLabel}>{t('alerts.modal.date_time_label', { defaultValue: 'Date & Time' })}</Text>
                <Text style={styles.detailValue}>{new Date(selectedNotification.createdAt).toLocaleString()}</Text>
                <Text style={styles.detailLabel}>{t('alerts.modal.status_label', { defaultValue: 'Status' })}</Text>
                <Text style={[styles.detailValue, selectedNotification.read && styles.readStatus]}>
                  {selectedNotification.read ? t('alerts.status.read', { defaultValue: 'Read' }) : t('alerts.status.unread', { defaultValue: 'Unread' })} • {selectedNotification.attended ? t('alerts.status.attended', { defaultValue: 'Attended' }) : t('alerts.status.unattended', { defaultValue: 'Unattended' })}
                </Text>
                <TouchableOpacity style={styles.closeModalButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeModalButtonText}>{t('alerts.modal.close', { defaultValue: 'Close' })}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Assign Modal */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('alerts.assign_modal.title', { defaultValue: 'Assign Notification' })}</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t('alerts.assign_modal.select_user', { defaultValue: 'Select User' })}</Text>
              <View style={styles.pickerContainer}>
                {users.length === 0 ? (
                  <ActivityIndicator size="small" color="#FFA500" />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {users.map(user => (
                      <TouchableOpacity
                        key={user.userId}
                        style={[styles.userChip, assignUserId === user.userId.toString() && styles.userChipSelected]}
                        onPress={() => setAssignUserId(user.userId.toString())}
                      >
                        <Text style={[styles.userChipText, assignUserId === user.userId.toString() && styles.userChipTextSelected]}>
                          {user.firstName} {user.lastName} ({user.username})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
              <Text style={styles.inputLabel}>{t('alerts.assign_modal.comment', { defaultValue: 'Comment (optional)' })}</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder={t('alerts.assign_modal.comment_placeholder', { defaultValue: 'Add a comment...' })}
                value={assignComment}
                onChangeText={setAssignComment}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setAssignModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>{t('alerts.assign_modal.cancel', { defaultValue: 'Cancel' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitButton} onPress={assignNotification}>
                  <Text style={styles.submitButtonText}>{t('alerts.assign_modal.assign', { defaultValue: 'Assign' })}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Attend Modal */}
      <Modal
        visible={attendModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAttendModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('alerts.attend_modal.title', { defaultValue: 'Attend Notification' })}</Text>
              <TouchableOpacity onPress={() => setAttendModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t('alerts.attend_modal.comments', { defaultValue: 'Comments' })}</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder={t('alerts.attend_modal.comment_placeholder', { defaultValue: 'Enter comments...' })}
                value={attendComment}
                onChangeText={setAttendComment}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setAttendModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>{t('alerts.attend_modal.cancel', { defaultValue: 'Cancel' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitButton} onPress={submitAttend}>
                  <Text style={styles.submitButtonText}>{t('alerts.attend_modal.submit', { defaultValue: 'Submit' })}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
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
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A1A' },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFA50010',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFA50030',
    gap: 4,
  },
  markAllText: { fontSize: 12, color: '#FFA500', fontWeight: '500' },
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
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  statNumber: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginVertical: 4 },
  unreadStat: { color: '#1976d2' },
  unattendedStat: { color: '#ed6c02' },
  criticalStat: { color: '#dc2626' },
  statLabel: { fontSize: 8, color: '#666' },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 40,
    backgroundColor: '#F5F5F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilter: { backgroundColor: '#FFA50020', borderWidth: 1, borderColor: '#FFA500' },
  filterText: { fontSize: 10, fontWeight: '500', color: '#666' },
  activeFilterText: { color: '#FFA500' },
  filterBadge: {
    backgroundColor: '#FFA500',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  criticalBadge: { backgroundColor: '#dc2626' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  listContent: { paddingBottom: 20 },
  row: { justifyContent: 'space-between', paddingHorizontal: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    flex: 1,
  },
  unreadCard: { borderColor: '#FFA500' },
  priorityBar: { height: 4, width: '100%' },
  cardContent: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1A1F36', flexShrink: 1 },
  timeText: { fontSize: 11, color: '#999' },
  messageText: { fontSize: 14, color: '#666', marginBottom: 12, lineHeight: 20 },
  metadata: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  priorityText: { fontSize: 11, fontWeight: '600' },
  typeBadge: { backgroundColor: '#F0F2F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontSize: 11, color: '#5B677C' },
  cardFooter: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12 },
  footerButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  footerButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerButtonText: { fontSize: 12, color: '#666' },
  loadMoreButton: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, marginHorizontal: 16, marginVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0' },
  loadMoreText: { color: '#FFA500', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#1A1A1A', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: 20 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: '#999', marginBottom: 4, marginTop: 12 },
  detailValue: { fontSize: 14, color: '#333', marginBottom: 8 },
  readStatus: { color: '#4CAF50', fontWeight: '500' },
  closeModalButton: { backgroundColor: '#FFA500', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  closeModalButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  pickerContainer: { marginBottom: 16 },
  userChip: { backgroundColor: '#F5F5F5', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  userChipSelected: { backgroundColor: '#FFA50020', borderWidth: 1, borderColor: '#FFA500' },
  userChipText: { fontSize: 13, color: '#666' },
  userChipTextSelected: { color: '#FFA500', fontWeight: '500' },
  textArea: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, padding: 12, fontSize: 14, color: '#1A1A1A', backgroundColor: '#FAFAFA', minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20, marginBottom: 20 },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#E5E5E5' },
  cancelButtonText: { fontSize: 14, color: '#666' },
  submitButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#FFA500' },
  submitButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});

export default AlarmsNotigicationScreen;
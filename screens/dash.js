import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');

// API Base URL
const API_BASE = 'https://demo2.bsl.co.ke';

// Helper: Format date to relative time (e.g., "2 hours ago")
const formatRelativeTime = (timestamp, t) => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return t('common.time.just_now', { defaultValue: 'Just now' });
  if (diffMins < 60) return `${diffMins} ${t('common.time.min_ago', { defaultValue: 'min ago' })}`;
  if (diffHours < 24) return `${diffHours} ${t('common.time.hours_ago', { defaultValue: 'hours ago' })}`;
  if (diffDays < 7) return `${diffDays} ${t('common.time.days_ago', { defaultValue: 'days ago' })}`;
  return date.toLocaleDateString();
};

// Helper: Map tracking status to color and display text
const getTicketStatusInfo = (status, t) => {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return { text: t('common.ticket_status.open', { defaultValue: 'Open' }), color: '#FF6B6B' };
    case 'IN_PROGRESS':
      return { text: t('common.ticket_status.in_progress', { defaultValue: 'In Progress' }), color: '#FFA500' };
    case 'ACKNOWLEDGED':
      return { text: t('common.ticket_status.acknowledged', { defaultValue: 'Acknowledged' }), color: '#2196F3' };
    case 'RESOLVED':
      return { text: t('common.ticket_status.resolved', { defaultValue: 'Resolved' }), color: '#4CAF50' };
    case 'CLOSED':
      return { text: t('common.ticket_status.closed', { defaultValue: 'Closed' }), color: '#2196F3' };
    default:
      return { text: status || t('common.ticket_status.unknown', { defaultValue: 'Unknown' }), color: '#999' };
  }
};

const formatDate = (dateString, t) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('common.time.just_now', { defaultValue: 'Just now' });
    if (diffMins < 60) return `${diffMins}m ${t('common.time.ago', { defaultValue: 'ago' })}`;
    if (diffHours < 24) return `${diffHours}h ${t('common.time.ago', { defaultValue: 'ago' })}`;
    if (diffDays < 7) return `${diffDays}d ${t('common.time.ago', { defaultValue: 'ago' })}`;
    return date.toLocaleDateString();
  };

const getPriorityIcon = (priority) => {
    switch(priority?.toUpperCase()) {
      case 'CRITICAL': return '🔴';
      case 'HIGH': return '🟠';
      case 'MEDIUM': return '🟡';
      case 'LOW': return '🟢';
      default: return '⚪';
    }
  };

const getStatusInfo = (status, t) => {
  switch (status) {
    case 'IN_TRANSIT':
      return { text: t('common.shipment_status.in_transit', { defaultValue: 'In Transit' }), color: '#FFA500', icon: '🚚', progress: 50 };
    case 'DELIVERED':
      return { text: t('common.shipment_status.delivered', { defaultValue: 'Delivered' }), color: '#4CAF50', icon: '✅', progress: 100 };
    case 'PENDING':
      return { text: t('common.shipment_status.pending', { defaultValue: 'Pending' }), color: '#FF6B6B', icon: '⏳', progress: 0 };
    default:
      return { text: status || t('common.shipment_status.unknown', { defaultValue: 'Unknown' }), color: '#999', icon: '📦', progress: 0 };
  }
};

// Helper: Map priority to color
const cleanTicketDescription = (text) => {
  if (!text) return '';

  return text
    .replace(/Location:\s*.*$/gim, '')
    .replace(/Map:\s*https?:\/\/\S+/gim, '')
    .replace(/https?:\/\/maps\.google\.com\/\S+/gim, '')
    .replace(/-?\d{1,2}\.\d+,\s*-?\d{1,3}\.\d+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
};

const getPriorityColor = (priority) => {
  switch (priority?.toUpperCase()) {
    case 'CRITICAL':
      return '#FF6B6B';
    case 'HIGH':
      return '#FFA500';
    case 'MEDIUM':
      return '#FFC107';
    default:
      return '#4CAF50';
  }
};

// Helper: Get stored authentication token
const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    return token;
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

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

// Add this function to fetch store ID for the logged-in user
const fetchUserStore = async (i18n) => {
  try {
    const userId = await AsyncStorage.getItem('id');

    if (!userId) {
      console.log('No user ID found');
      return null;
    }

    console.log('Fetching store for user:', userId);

    try {
      const response = await authenticatedAxios(
        'get',
        {
          url: `${API_BASE}/api/v1/users/getUserByID?users_id=${userId}`,
        },
        i18n
      );

      const data = response.data;
      console.log('Store data:', data);

      // Extract store ID based on response structure
      let storeId = null;
      let storeName = null;

      if (data.stores && Array.isArray(data.stores) && data.stores.length > 0) {
        storeId = data.stores[0].id;
        storeName = data.stores[0].name;
      } else if (data.id) {
        storeId = data.id;
        storeName = data.name;
      } else if (data.storeId) {
        storeId = data.storeId;
        storeName = data.storeName;
      }

      if (storeId) {
        await AsyncStorage.setItem('storeId', storeId.toString());
        if (storeName) {
          await AsyncStorage.setItem('storeName', storeName);
        }
        console.log('Store saved:', { storeId, storeName });
        return { storeId, storeName };
      }
      return null;
    } catch (err) {
      console.log('Error fetching store:', err.message);
      return null;
    }
  } catch (error) {
    console.error('Error fetching store:', error);
    return null;
  }
};

const acknowledgeTicket = async (ticketId, i18n) => {
  const response = await authenticatedAxios(
    'post',
    {
      url: `${API_BASE}/api/v1/tickets/acknowledge`,
      data: {
        ticketId: Number(ticketId),
        content: 'Acknowledged from mobile app',
      },
    },
    i18n
  );

  return response.data;
};

// Updated resolveTicket function to accept notes and files
const resolveTicket = async (ticketId, notes, files, i18n) => {
  const formData = new FormData();
  formData.append('notes', notes || 'Resolved from mobile app');

  // Append each file
  if (files && files.length > 0) {
    files.forEach((file, index) => {
      formData.append('files', {
        uri: file.uri,
        type: file.type || 'image/jpeg',
        name: file.fileName || `evidence_${Date.now()}_${index}.jpg`,
      });
    });
  }

  const token = await AsyncStorage.getItem('accessToken');
  const language = await getLanguageHeader(i18n);

  const response = await fetch(`${API_BASE}/api/v1/tickets/${ticketId}/resolve`, {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Language': language,
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to resolve ticket: ${errorData}`);
  }
  return await response.json();
};

// ========== CLAIM TICKET FUNCTION ==========
const claimTicket = async (ticketId, i18n) => {
  const response = await authenticatedAxios(
    'post',
    {
      url: `${API_BASE}/api/v1/tickets/${ticketId}/claim`,
      data: {},
      headers: { 'Content-Type': 'application/json' },
    },
    i18n
  );
  return response.data;
};
// ========== END CLAIM TICKET FUNCTION ==========

function HomeScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('shipments');

  // State for API data
  const [shipments, setShipments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Loading states
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  // UI states
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isTrackingModalVisible, setIsTrackingModalVisible] = useState(false);
  const [trackedShipment, setTrackedShipment] = useState(null);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [commandModalVisible, setCommandModalVisible] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isModalVisibleWithdraw, setIsModalVisibleWithdraw] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [phoneNumber2, setPhoneNumber2] = useState('');
  const [amount2, setAmount2] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const route = useRoute();
  const [roleId, setRoleId] = useState(null);
  const [acknowledgingTicketId, setAcknowledgingTicketId] = useState(null);
  const [resolvingTicketId, setResolvingTicketId] = useState(null);
  const [claimingTicketId, setClaimingTicketId] = useState(null); // New state for claim action

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataLoadError, setDataLoadError] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in HomeScreen');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Home Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('common.back_online', { defaultValue: 'Back online! Syncing data...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Auto-refresh when coming back online
            if (roleId !== null) {
              loadAllData();
            }
          } else {
            Snackbar.show({
              text: t('common.offline_mode', { defaultValue: 'Offline mode - using cached data' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
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

  // ========== OFFLINE: Cache data helper ==========
  const cacheDashboardData = async (shipmentsData, ticketsData, alertsData, notificationsData) => {
    try {
      if (shipmentsData) await OfflineDatabaseService.saveUserData('home_shipments', { data: shipmentsData, timestamp: Date.now() });
      if (ticketsData) await OfflineDatabaseService.saveUserData('home_tickets', { data: ticketsData, timestamp: Date.now() });
      if (alertsData) await OfflineDatabaseService.saveUserData('home_alerts', { data: alertsData, timestamp: Date.now() });
      if (notificationsData) await OfflineDatabaseService.saveUserData('home_notifications', { data: notificationsData, timestamp: Date.now() });
      console.log('✅ Home screen data cached offline');
    } catch (error) {
      console.error('Error caching home data:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached data ==========
  const loadCachedData = async () => {
    try {
      const cachedShipments = await OfflineDatabaseService.getUserData('home_shipments');
      if (cachedShipments && cachedShipments.data) {
        setShipments(cachedShipments.data);
        console.log('📦 Loaded cached shipments');
      }

      const cachedTickets = await OfflineDatabaseService.getUserData('home_tickets');
      if (cachedTickets && cachedTickets.data) {
        setTickets(cachedTickets.data);
        console.log('📦 Loaded cached tickets');
      }

      const cachedAlerts = await OfflineDatabaseService.getUserData('home_alerts');
      if (cachedAlerts && cachedAlerts.data) {
        setAlerts(cachedAlerts.data);
        console.log('📦 Loaded cached alerts');
      }

      const cachedNotifications = await OfflineDatabaseService.getUserData('home_notifications');
      if (cachedNotifications && cachedNotifications.data) {
        setNotifications(cachedNotifications.data);
        console.log('📦 Loaded cached notifications');
      }
      setDataLoadError(false);
    } catch (error) {
      console.error('Error loading cached data:', error);
      setDataLoadError(true);
    } finally {
      setLoadingShipments(false);
      setLoadingTickets(false);
      setLoadingAlerts(false);
      setLoadingNotifications(false);
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Manual sync function ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('common.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await loadAllData();
      Snackbar.show({
        text: t('common.sync_complete', { defaultValue: 'Sync completed successfully!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('common.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSyncing(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  useEffect(() => {
    const loadRole = async () => {
      let id = route.params?.roleId;
      if (!id) {
        const stored = await AsyncStorage.getItem('roleId');
        id = stored ? parseInt(stored, 10) : null;
      }
      setRoleId(id);
      // FOR ROLE 257: Force activeTab to 'tickets' only
      if (id === 257) {
        setActiveTab('tickets');
      } else if (id === 255) {
        setActiveTab('tickets');
      }

      // ✅ FIXED: Fetch store ID for STORE role (202) AND ADMIN role (1)
      if (id === 202 || id === 1) {
        console.log(`${id === 202 ? 'STORE' : 'ADMIN'} role detected, fetching store info...`);
        await fetchUserStore(i18n);
      }
    };
    loadRole();
  }, [route.params?.roleId]);

  // Helper to decide if an icon should be shown
  const shouldShowIcon = (iconName) => {
    if (roleId === 1) return true;
    if (roleId === 102) {
      const forbidden = ['Random Stop', 'Request Eseals', 'Return Eseals', 'Assigned Eseals'];
      return !forbidden.includes(iconName);
    }
    return false; // any other role or missing → nothing
  };

  // Commands list with translations
  const commands = [
    { id: 'CMD-001', name: t('common.commands.check_status', { defaultValue: 'Check Status' }), description: t('common.commands.check_status_desc', { defaultValue: 'Get real-time status of your shipment' }) },
    { id: 'CMD-002', name: t('common.commands.share_location', { defaultValue: 'Share Location' }), description: t('common.commands.share_location_desc', { defaultValue: 'Share current location with support' }) },
    { id: 'CMD-003', name: t('common.commands.request_support', { defaultValue: 'Request Support' }), description: t('common.commands.request_support_desc', { defaultValue: 'Request immediate assistance' }) },
    { id: 'CMD-004', name: t('common.commands.update_delivery', { defaultValue: 'Update Delivery' }), description: t('common.commands.update_delivery_desc', { defaultValue: 'Update delivery preferences' }) },
    { id: 'CMD-005', name: t('common.commands.report_issue', { defaultValue: 'Report Issue' }), description: t('common.commands.report_issue_desc', { defaultValue: 'Report a problem with your shipment' }) }
  ];

  // ---------------------- API Calls with Bearer Token ----------------------
  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'OPEN':
        return '#FF6B6B';
      case 'IN_PROGRESS':
        return '#FFA500';
      case 'RESOLVED':
        return '#4CAF50';
      case 'CLOSED':
        return '#2196F3';
      default:
        return '#999';
    }
  };

  // ✅ FIXED: fetchShipments using authenticatedAxios
  const fetchShipments = async () => {
    try {
      setLoadingShipments(true);

      // Fetch both telemetry and T1 declarations in parallel
      const [telemetryResponse, t1Response] = await Promise.all([
        authenticatedAxios('get', { url: `${API_BASE}/api/v1/telemetry/latest-t1s` }, i18n),
        authenticatedAxios('get', { url: `${API_BASE}/api/v1/customs/t1` }, i18n),
      ]);

      const telemetryData = telemetryResponse.data;
      const t1Data = t1Response.data;

      // Create a map of t1Number to T1 declaration for easy lookup
      const t1Map = {};
      t1Data.forEach(t1 => {
        t1Map[t1.t1Number] = t1;
      });

      // Transform telemetry data into shipment format
      const transformed = telemetryData.map(item => {
        const t1 = t1Map[item.t1Number] || {};
        const status = t1.trackingStatus || 'IN_TRANSIT';
        const statusInfo = getStatusInfo(status, t);

        return {
          id: item.id?.toString() || `device-${item.deviceSn}`,
          trackingNumber: item.t1Number,
          deviceSn: item.deviceSn,
          deviceName: item.deviceName,
          origin: t1.origin || t('common.unknown', { defaultValue: 'Unknown' }),
          destination: t1.destination || t('common.unknown', { defaultValue: 'Unknown' }),
          status: statusInfo.text,
          statusColor: statusInfo.color,
          estimatedDelivery: t1.estimatedDelivery || 'N/A',
          lastUpdate: item.timestamp,
          location: item.address || `${item.latitude}, ${item.longitude}`,
          progress: statusInfo.progress,
          latitude: item.latitude,
          longitude: item.longitude,
          speedKmh: item.speedKmh,
          truckReg: t1.truckRegistrationNumber,
        };
      });

      setShipments(transformed);
      return transformed;
    } catch (error) {
      console.error('Error fetching shipments:', error);
      return null;
    } finally {
      setLoadingShipments(false);
    }
  };

  // ✅ FIXED: fetchTickets using authenticatedAxios
  const fetchTickets = async () => {
    try {
      setLoadingTickets(true);

      const storedId = await AsyncStorage.getItem('id');
      const userId = storedId ? parseInt(storedId, 10) : 1;

      const response = await authenticatedAxios(
        'get',
        {
          url: `${API_BASE}/api/v1/tickets/assignee/${userId}?page=0&size=100&sort=createdAt,desc`,
        },
        i18n
      );

      const data = response.data;

      const transformed = (data.content || []).map(ticket => {
        const latestStatusFromComments =
          ticket.comments && ticket.comments.length > 0
            ? ticket.comments[ticket.comments.length - 1].newStatus
            : null;

        const finalStatus = latestStatusFromComments || ticket.status;

        return {
          id: ticket.id?.toString(),
          ticketNumber: ticket.ticketNumber,
          subject: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          status: finalStatus?.toUpperCase(),
          createdAt: ticket.createdAt
            ? new Date(ticket.createdAt).toLocaleDateString()
            : null,
          updatedAt: ticket.updatedAt,
          t1Number: ticket.t1Number,
          truckReg: ticket.truckRegistrationNumber,
          assignee: ticket.assignee, // Store assignee object
        };
      });

      setTickets(transformed);
      return transformed;
    } catch (error) {
      console.error('Error fetching tickets:', error);
      return null;
    } finally {
      setLoadingTickets(false);
    }
  };

  // ✅ FIXED: fetchAlerts using authenticatedAxios
  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);

      const response = await authenticatedAxios(
        'get',
        {
          url: `${API_BASE}/api/v1/notifications?page=0&size=100&alarm=true&sort=createdAt,desc`,
        },
        i18n
      );

      const data = response.data;
      const notificationsArray = data.content || data;
      const transformed = (Array.isArray(notificationsArray) ? notificationsArray : []).map(alert => ({
        id: alert.id.toString(),
        title: alert.title || t('common.alert', { defaultValue: 'Alert' }),
        message: alert.message || alert.description,
        severity: alert.severity || (alert.type === 'ALARM' ? t('common.warning', { defaultValue: 'Warning' }) : t('common.info', { defaultValue: 'Info' })),
        timestamp: alert.createdAt,
      }));
      setAlerts(transformed);
      return transformed;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      return null;
    } finally {
      setLoadingAlerts(false);
    }
  };

  // ✅ FIXED: fetchNotifications using authenticatedAxios
  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);

      const response = await authenticatedAxios(
        'get',
        {
          url: `${API_BASE}/api/v1/notifications?page=0&size=100&sort=createdAt,desc`,
        },
        i18n
      );

      const data = response.data;
      const notificationsArray = data.content || data;
      const transformed = (Array.isArray(notificationsArray) ? notificationsArray : []).map(notif => ({
        id: notif.id.toString(),
        title: notif.title || t('common.notification', { defaultValue: 'Notification' }),
        message: notif.message || notif.description,
        time: formatRelativeTime(notif.createdAt, t),
        read: notif.read || false,
        type: notif.type?.toLowerCase() === 'alarm' ? 'alert' : 'info',
      }));
      setNotifications(transformed);
      return transformed;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
      return [];
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadAllData = async () => {
    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online && roleId !== null) {
      // Load cached data
      await loadCachedData();
      return;
    }
    // ========== END OFFLINE CHECK ==========

    try {
      setDataLoadError(false);
      if (roleId === 257) {
        const ticketsData = await fetchTickets();
        if (ticketsData) await cacheDashboardData(null, ticketsData, null, null);
      }
      else {
        const [shipmentsData, ticketsData, alertsData, notificationsData] = await Promise.all([
          fetchShipments(),
          fetchTickets(),
          fetchAlerts(),
          fetchNotifications(),
        ]);

        // ========== OFFLINE: Cache fetched data ==========
        await cacheDashboardData(shipmentsData, ticketsData, alertsData, notificationsData);
        // ========== END OFFLINE CACHE ==========
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setDataLoadError(true);
      // Try to load cached data as fallback
      await loadCachedData();
    }
  };

  // ---------------------- Lifecycle ----------------------
  useEffect(() => {
    if (roleId !== null) {
      loadAllData();
    }
  }, [roleId]);

  useFocusEffect(
    React.useCallback(() => {
      const backAction = () => false;
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (roleId === 257) {
      await fetchTickets();
    } else {
      await loadAllData();
    }
    setRefreshing(false);
  };

  // ---------------------- Handlers ----------------------
  const getCurrentTime = () => {
    const date = new Date();
    const hours = date.getHours();
    if (hours < 12) return t('common.greeting.morning', { defaultValue: 'Good Morning' });
    if (hours < 17) return t('common.greeting.afternoon', { defaultValue: 'Good Afternoon' });
    return t('common.greeting.evening', { defaultValue: 'Good Evening' });
  };

  const handleTrackShipment = () => {
    if (!trackingNumber.trim()) {
      Snackbar.show({ text: t('common.errors.enter_tracking', { defaultValue: 'Please enter a tracking number' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    const found = shipments.find(s => s.trackingNumber === trackingNumber);
    if (found) {
      setTrackedShipment(found);
      setIsTrackingModalVisible(true);
    } else {
      Snackbar.show({ text: t('common.errors.shipment_not_found', { defaultValue: 'Shipment not found' }), duration: 3000, backgroundColor: '#FF6B6B' });
    }
    setTrackingNumber('');
  };

  const handleCreateTicket = () => {
    navigation.navigate('CreateTicket');
  };

  const handleViewTicket = (ticket) => {
    navigation.navigate('TicketDetails', { ticket });
  };

  const handleViewOnMap = (shipment) => {
    navigation.navigate('TrackOnMap', { shipment });
  };

  const handleSendCommand = (command) => {
    setSelectedCommand(command.name);
    setCommandModalVisible(false);
  };

  const handleMarkNotificationRead = (notificationId) => {
    setNotifications(prev =>
      prev.map(notif => (notif.id === notificationId ? { ...notif, read: true } : notif))
    );
  };

  const handleNotificationsScreen = () => navigation.navigate('AlertsNotigicationScreen');
  const handleAlarmsNotigicationScreen = () => navigation.navigate('AlarmsNotigicationScreen');
  const handleTicketsScreen = () => navigation.navigate('TicketsScreen');
  const handleStationsScreen = () => navigation.navigate('StationsScreen');
  const handleGeofencesScreen = () => navigation.navigate('GeofencesScreen');
  const handleDevicesScreen = () => navigation.navigate('DevicesScreen');
  const handleDeviceMapScreen = () => navigation.navigate('DeviceMapScreen');
  const handleCommandsScreen = () => navigation.navigate('CommandsScreen');
  const handleAlertsNotigicationScreen = () => navigation.navigate('AlertsNotigicationScreen');
  const handleHotspotsScreen = () => navigation.navigate('HotspotsScreen');
  const handleRandomStopScreen = () => navigation.navigate('RandomStopScreen');
  const handleQrPaymentScanner = () => navigation.navigate('QrPaymentScanner');
  const handleMasterSlaveMapper = () => navigation.navigate('MasterSlaveMapper')
  const handleRequestEsealsList = () => navigation.navigate('RequestEsealsList');
  const handleAssignedEseals = () => navigation.navigate('AssignedEseals');
  const handleInventoryScan = () => navigation.navigate('InventoryScan');

  // ========== SCAN TO CONFIRM ARRIVAL HANDLER - FOR ROLE 255 ==========
  const handleScanConfirmArrival = () => {
    navigation.navigate('ScanConfirmArrival');
  };
  // ========== END SCAN TO CONFIRM ARRIVAL HANDLER ==========

  // ✅ FIXED: Updated to pass storeId and storeName to ReceiveDevicesScreen
  const handleReceiveDevicesScreen = () => {
    const getStoreInfoAndNavigate = async () => {
      try {
        const storeId = await AsyncStorage.getItem('storeId');
        const storeName = await AsyncStorage.getItem('storeName');

        console.log('Navigating to ReceiveDevicesScreen with store:', { storeId, storeName });

        navigation.navigate('ReceiveDevicesScreen', {
          storeId: storeId ? parseInt(storeId, 10) : null,
          storeName: storeName || null
        });
      } catch (error) {
        console.error('Error getting store info:', error);
        navigation.navigate('ReceiveDevicesScreen');
      }
    };

    getStoreInfoAndNavigate();
  };

  const handleEsealsReplacement = () => navigation.navigate('EsealsReplacement');
  const handleSensorList = () => navigation.navigate('SensorList');
  const TopUpModal = () => setIsModalVisible(true);
  const withdrawModal = () => setIsModalVisibleWithdraw(true);

  const closeModal = () => {
    setIsModalVisible(false);
    setPhoneNumber('');
    setAmount('');
  };

  const closeModalWithdraw = () => {
    setIsModalVisibleWithdraw(false);
    setPhoneNumber2('');
    setAmount2('');
  };

  const handleAcknowledge = async (ticketId) => {
    if (acknowledgingTicketId) return;

    setAcknowledgingTicketId(ticketId);
    try {
      await acknowledgeTicket(ticketId, i18n);
      Snackbar.show({
        text: t('common.ticket_acknowledged', { defaultValue: 'Ticket acknowledged successfully' }),
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
      setModalVisible(false);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (e) {
      Snackbar.show({
        text: t('common.ticket_acknowledge_failed', { defaultValue: 'Failed to acknowledge ticket' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setAcknowledgingTicketId(null);
    }
  };

  // ========== CLAIM TICKET HANDLER ==========
  const handleClaimTicket = async (ticketId) => {
    if (claimingTicketId) return;
    setClaimingTicketId(ticketId);
    try {
      await claimTicket(ticketId, i18n);
      Snackbar.show({
        text: t('common.ticket_claimed', { defaultValue: 'Ticket claimed successfully!' }),
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
      setModalVisible(false);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (error) {
      console.error('Claim error:', error);
      Snackbar.show({
        text: error.response?.data?.message || t('common.ticket_claim_failed', { defaultValue: 'Failed to claim ticket' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setClaimingTicketId(null);
    }
  };
  // ========== END CLAIM TICKET HANDLER ==========

  // Updated handleResolve to navigate to AttachEvidence screen with proper params
  const handleResolve = (ticket) => {
    // Navigate to AttachEvidence screen with only serializable data
    navigation.navigate('AttatchEvidence', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      onResolveComplete: (notes, files) => {
        // This callback will be called from AttachEvidence after successful upload
        resolveTicketWithEvidence(ticket.id, notes, files);
      }
    });
  };

  // Separate function to handle the resolve API call
  const resolveTicketWithEvidence = async (ticketId, notes, files) => {
    setResolvingTicketId(ticketId);
    try {
      await resolveTicket(ticketId, notes, files, i18n);
      Snackbar.show({
        text: t('common.ticket_resolved', { defaultValue: 'Ticket resolved successfully with evidence' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
      setModalVisible(false);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (e) {
      console.error('Resolve error:', e);
      Snackbar.show({
        text: t('common.ticket_resolve_failed', { defaultValue: 'Failed to resolve ticket' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setResolvingTicketId(null);
    }
  };

  const handleLogout = async () => {
    Alert.alert(t('common.logout', { defaultValue: 'Logout' }), t('common.logout_confirm', { defaultValue: 'Are you sure you want to logout?' }), [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('common.logout', { defaultValue: 'Logout' }),
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.multiRemove(['accessToken', 'roleId', 'id', 'refreshToken']);
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (error) {
            Snackbar.show({ text: t('common.logout_failed', { defaultValue: 'Failed to logout' }), duration: 3000, backgroundColor: '#FF6B6B' });
          }
        },
      },
    ]);
  };

  const handleSubmit = async () => {
    if (!phoneNumber.trim()) {
      Snackbar.show({ text: t('common.errors.phone_required', { defaultValue: 'Phone number is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!amount.trim()) {
      Snackbar.show({ text: t('common.errors.amount_required', { defaultValue: 'Amount is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsModalVisible(false);
      Snackbar.show({ text: t('common.topup_success', { defaultValue: 'Top up successful!' }), duration: 3000, backgroundColor: '#4CAF50' });
      setPhoneNumber('');
      setAmount('');
    }, 1500);
  };

  const handleSubmitWithdraw = async () => {
    if (!phoneNumber2.trim()) {
      Snackbar.show({ text: t('common.errors.phone_required', { defaultValue: 'Phone number is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!amount2.trim()) {
      Snackbar.show({ text: t('common.errors.amount_required', { defaultValue: 'Amount is required' }), duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsModalVisibleWithdraw(false);
      Snackbar.show({ text: t('common.withdraw_success', { defaultValue: 'Withdrawal initiated successfully!' }), duration: 3000, backgroundColor: '#4CAF50' });
      setPhoneNumber2('');
      setAmount2('');
    }, 1500);
  };

  // ---------------------- Render Helpers ----------------------
  const renderShipment = ({ item, index }) => (
    <Animatable.View animation="fadeInUp" delay={index * 100} style={styles.shipmentCard}>
      <View style={styles.shipmentHeader}>
        <View style={styles.trackingInfo}>
          <Text style={styles.trackingNumber}>{item.trackingNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: item.statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: item.statusColor }]}>
              {getStatusInfo(item.status, t).icon} {item.status}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => handleViewOnMap(item)}>
          <Image source={require('../assets/map.png')} style={styles.mapIcon} />
        </TouchableOpacity>
      </View>

      <View style={styles.routeInfo}>
        <View style={styles.locationPoint}>
          <View style={styles.pointCircle} />
          <View style={styles.pointLine} />
          <Text style={styles.locationText}>{item.origin}</Text>
        </View>
        <View style={styles.locationPoint}>
          <View style={styles.pointCircleDestination} />
          <Text style={styles.locationText}>{item.destination}</Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${item.progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{item.progress}% {t('common.complete', { defaultValue: 'Complete' })}</Text>
      </View>

      <View style={styles.shipmentDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📍 {t('common.location', { defaultValue: 'Location' })}</Text>
          <Text style={styles.detailValue}>{item.location || t('common.unknown', { defaultValue: 'Unknown' })}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📅 {t('common.last_update', { defaultValue: 'Last Update' })}</Text>
          <Text style={styles.detailValue}>{formatRelativeTime(item.lastUpdate, t)}</Text>
        </View>
      </View>

      <View style={styles.shipmentDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📱 {t('common.device', { defaultValue: 'Device' })}</Text>
          <Text style={styles.detailValue}>{item.deviceName || item.deviceSn}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>💨 {t('common.speed', { defaultValue: 'Speed' })}</Text>
          <Text style={styles.detailValue}>{item.speedKmh} km/h</Text>
        </View>
      </View>

      <View style={styles.shipmentActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleViewOnMap(item)}>
          <Text style={styles.actionBtnText}>{t('common.track_on_map', { defaultValue: 'Track on Map' })}</Text>
        </TouchableOpacity>
      </View>
    </Animatable.View>
  );

  const renderTicket = ({ item, index }) => {
    const statusColor = getTicketStatusInfo(item.status, t).color;
    const priorityColor = getPriorityColor(item.priority);
    const statusInfo = getTicketStatusInfo(item.status, t);
    // Detect broadcast ticket: assignee is null and status is OPEN (or just assignee null)
    const isBroadcast = !item.assignee && item.status === 'OPEN';

    return (
      <Animatable.View
        animation="fadeInUp"
        delay={index * 80}
        duration={400}
        style={styles.animationWrapper}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            setSelectedTicket(item);
            setModalVisible(true);
          }}
        >
          <View style={styles.ticketCard}>
            {/* Row 1: Ticket Number + Priority + Broadcast Badge */}
            <View style={styles.ticketHeaderRow}>
              <Text style={styles.ticketNumberLabel}>Ticket Number:</Text>
              <Text style={styles.ticketNumber}>{item.ticketNumber || `#${item.id}`}</Text>
              <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                <Text style={styles.priorityIcon}>{getPriorityIcon(item.priority)}</Text>
                <Text style={[styles.priorityText, { color: priorityColor }]}>
                  {item.priority}
                </Text>
              </View>
              {isBroadcast && (
                <View style={styles.broadcastBadge}>
                  <Text style={styles.broadcastBadgeText}>📢 Broadcast</Text>
                </View>
              )}
            </View>

            {/* Row 2: Status */}
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status:</Text>
              <View style={[styles.statusBadgeSmall, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusTextSmall, { color: statusColor }]}>
                  {statusInfo.text}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.ticketTitle}>{item.subject}</Text>

            {/* Description with label */}
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionLabel}>Description:</Text>
              <Text style={styles.ticketDescription} numberOfLines={2}>
                {cleanTicketDescription(item.description) || 'No description provided'}
              </Text>
            </View>

            {/* Footer with field names */}
            <View style={styles.ticketFooterRow}>
              <View style={styles.footerItem}>
                <Text style={styles.footerIcon}>🕒</Text>
                <Text style={styles.footerLabel}>Updated:</Text>
                <Text style={styles.footerValue}>{formatDate(item.updatedAt, t)}</Text>
              </View>

              {item.t1Number && (
                <View style={styles.footerItem}>
                  <Text style={styles.footerIcon}>📄</Text>
                  <Text style={styles.footerLabel}>T1:</Text>
                  <Text style={styles.footerValue}>{item.t1Number}</Text>
                </View>
              )}

              {item.truckReg && (
                <View style={styles.footerItem}>
                  <Text style={styles.footerIcon}>📱</Text>
                  <Text style={styles.footerLabel}>Device:</Text>
                  <Text style={styles.footerValue}>{item.truckReg}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderAlert = ({ item, index }) => (
    <Animatable.View
      animation="fadeInUp"
      delay={index * 100}
      style={[styles.alertCard, { borderLeftColor: item.severity === 'Warning' ? '#FF6B6B' : '#4CAF50' }]}
    >
      <Text style={styles.alertTitle}>{item.title}</Text>
      <Text style={styles.alertMessage}>{item.message}</Text>
      <Text style={styles.alertTime}>{item.timestamp ? formatRelativeTime(item.timestamp, t) : item.timestamp}</Text>
    </Animatable.View>
  );

  // HeaderComponent
  const HeaderComponent = () => (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getCurrentTime()}</Text>
        </View>
        <View style={styles.headerActions}>
          {/* ========== OFFLINE: Sync button ========== */}
          {isSyncing ? (
            <ActivityIndicator size="small" color="#FFA500" style={styles.syncIndicator} />
          ) : (
            <TouchableOpacity style={styles.iconButton} onPress={manualSync}>
              <Image source={require('../assets/refresh.png')} style={[styles.headerIcon, { tintColor: isOnline ? '#4CAF50' : '#999' }]} />
            </TouchableOpacity>
          )}
          {/* ========== END OFFLINE SYNC BUTTON ========== */}

          <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
            <Image source={require('../assets/logout.png')} style={styles.headerIcon} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={handleNotificationsScreen}>
            <Image source={require('../assets/bell.png')} style={styles.headerIcon} />
            {notifications.filter(n => !n.read).length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notifications.filter(n => !n.read).length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached data</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      {/* Quick Actions Grid - 4 columns */}
      {(roleId === 1 || roleId === 102 || roleId === 255 || roleId === 103 || roleId === 257) && (
        <View style={styles.quickActionsGrid}>
          <View style={styles.actionsContainer}>

            {/* ROLE 102 - 5 icons (4 columns, last row has 1) */}
            {roleId === 102 && (
              <>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionCard} onPress={handleTicketsScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                      <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.tickets', { defaultValue: 'Tickets' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleRandomStopScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                      <Image source={require('../assets/randomstop.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.random_stop', { defaultValue: 'Random Stop' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleRequestEsealsList}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#FF6B6B20' }]}>
                      <Image source={require('../assets/alarm.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.request_eseals', { defaultValue: 'Request Eseals' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleAssignedEseals}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                      <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.assigned_eseals', { defaultValue: 'Assigned Eseals' })}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionCard} onPress={handleEsealsReplacement}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#4CAF5020' }]}>
                      <Image source={require('../assets/bell.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.eseals_replacement', { defaultValue: 'Eseals Replacement' })}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ROLE 1 - 4x3 grid (12 icons) */}
            {roleId === 1 && (
              <>
                {/* Row 1 */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionCard} onPress={handleQrPaymentScanner}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#9C27B020' }]}>
                      <Image source={require('../assets/trk.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.scan_to_unlock', { defaultValue: 'Scan to Unlock' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleMasterSlaveMapper}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#FF980020' }]}>
                      <Image source={require('../assets/geo.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.sensors_mapping', { defaultValue: 'Sensors Mapping' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleSensorList}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#E91E6320' }]}>
                      <Image source={require('../assets/location.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.mapped_sensors', { defaultValue: 'Mapped Sensors' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleTicketsScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                      <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.tickets', { defaultValue: 'Tickets' })}</Text>
                  </TouchableOpacity>
                </View>

                {/* Row 2 */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionCard} onPress={handleRandomStopScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                      <Image source={require('../assets/randomstop.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.random_stop', { defaultValue: 'Random Stop' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleRequestEsealsList}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#FF6B6B20' }]}>
                      <Image source={require('../assets/alarm.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.request_eseals', { defaultValue: 'Request Eseals' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleGeofencesScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#FF980020' }]}>
                      <Image source={require('../assets/geo.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.geofences', { defaultValue: 'Geofences' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleHotspotsScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#E91E6320' }]}>
                      <Image source={require('../assets/location.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.hotspots', { defaultValue: 'Hotspots' })}</Text>
                  </TouchableOpacity>
                </View>

                {/* Row 3 */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionCard} onPress={handleDeviceMapScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#FFA50020' }]}>
                      <Image source={require('../assets/monitor.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.shipments', { defaultValue: 'Shipments' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleStationsScreen}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#00BCD420' }]}>
                      <Image source={require('../assets/station.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.stations', { defaultValue: 'Stations' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleAssignedEseals}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                      <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.assigned_eseals', { defaultValue: 'Assigned Eseals' })}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionCard} onPress={handleInventoryScan}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#9C27B020' }]}>
                      <Image source={require('../assets/trk.png')} style={styles.actionIcon} />
                    </View>
                    <Text style={styles.actionLabel}>{t('common.actions.scan_to_add', { defaultValue: 'Scan to Add Devices' })}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ROLE 103 - only Tickets */}
            {roleId === 103 && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionCard} onPress={handleTicketsScreen}>
                  <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                    <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                  </View>
                  <Text style={styles.actionLabel}>{t('common.actions.tickets', { defaultValue: 'Tickets' })}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ========== UPDATED: ROLE 255 - Tickets + Scan to Confirm Arrival SIDE BY SIDE ========== */}
            {roleId === 255 && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionCard} onPress={handleTicketsScreen}>
                  <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                    <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                  </View>
                  <Text style={styles.actionLabel}>{t('common.actions.tickets', { defaultValue: 'Tickets' })}</Text>
                </TouchableOpacity>

                {/* Scan to Confirm Arrival Icon - For Role 255 */}
                <TouchableOpacity style={styles.actionCard} onPress={handleScanConfirmArrival}>
                  <View style={[styles.actionIconBg, { backgroundColor: '#4CAF5020' }]}>
                    {/* Using emoji as fallback if icon not available - replace with actual image if needed */}
                    <Text style={{ fontSize: 24 }}>📦</Text>
                    {/* Uncomment below if you have the icon asset */}
                    {/* <Image source={require('../assets/scan_confirm.png')} style={styles.actionIcon} /> */}
                  </View>
                  <Text style={styles.actionLabel}>{t('common.actions.scan_confirm', { defaultValue: 'Scan to Confirm Arrival' })}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* ========== END ROLE 255 UPDATES ========== */}
          </View>
        </View>
      )}

      {/* Receive Devices Section - Moved outside the grid for proper placement */}
      {(roleId === 1 || roleId === 202) && (
        <View style={styles.actionRow}>
          {(roleId === 202 || roleId === 1) && (
            <TouchableOpacity style={styles.actionCard} onPress={handleReceiveDevicesScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#9C27B020' }]}>
                <Image source={require('../assets/trk.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>{t('common.actions.receive', { defaultValue: 'Receive' })}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.tabs}>
        {roleId !== 255 && roleId !== 103 && roleId !== 257 && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'shipments' && styles.activeTab]}
            onPress={() => setActiveTab('shipments')}
          >
            <Text style={[styles.tabText, activeTab === 'shipments' && styles.activeTabText]}>
              {t('common.tabs.shipments', { defaultValue: 'Shipments' })}
            </Text>
          </TouchableOpacity>
        )}

        {(roleId !== 103) && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'tickets' && styles.activeTab]}
            onPress={() => setActiveTab('tickets')}
          >
            <Text style={[styles.tabText, activeTab === 'tickets' && styles.activeTabText]}>
              {t('common.tabs.tickets', { defaultValue: 'Tickets' })}
            </Text>
          </TouchableOpacity>
        )}

        {roleId !== 255 && roleId !== 103 && roleId !== 257 && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'alerts' && styles.activeTab]}
            onPress={() => setActiveTab('alerts')}
          >
            <Text style={[styles.tabText, activeTab === 'alerts' && styles.activeTabText]}>
              {t('common.tabs.alerts', { defaultValue: 'Alerts' })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  const renderContent = () => {
    if (roleId === 257 || roleId === 255) {
      return (
        <FlatList
          data={tickets}
          keyExtractor={item => item.id}
          renderItem={renderTicket}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={HeaderComponent}
          ListEmptyComponent={
            loadingTickets ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#FFA500" />
                <Text style={styles.loaderText}>{t('common.loading_tickets', { defaultValue: 'Loading tickets...' })}</Text>
              </View>
            ) : dataLoadError ? (
              <View style={styles.emptyContainer}>
                <Image source={require('../assets/refresh.png')} style={styles.errorIcon} />
                <Text style={styles.emptyTitle}>Connection Error</Text>
                <Text style={styles.emptyText}>Unable to load data. Please check your connection.</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadAllData}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('common.no_tickets', { defaultValue: 'No tickets found' })}</Text>
              </View>
            )
          }
        />
      );
    }

    const isLoading = activeTab === 'shipments' ? loadingShipments :
                      activeTab === 'tickets' ? loadingTickets :
                      loadingAlerts;
    const data = activeTab === 'shipments' ? shipments :
                 activeTab === 'tickets' ? tickets :
                 alerts;
    const renderItem = activeTab === 'shipments' ? renderShipment :
                       activeTab === 'tickets' ? renderTicket :
                       renderAlert;

    return (
      <FlatList
        data={data}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={HeaderComponent}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#FFA500" />
              <Text style={styles.loaderText}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
            </View>
          ) : dataLoadError ? (
            <View style={styles.emptyContainer}>
              <Image source={require('../assets/refresh.png')} style={styles.errorIcon} />
              <Text style={styles.emptyTitle}>Connection Error</Text>
              <Text style={styles.emptyText}>Unable to load data. Please check your connection.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadAllData}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('common.no_data', { defaultValue: 'No data found' })}</Text>
            </View>
          )
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {renderContent()}

      {/* Tracking Modal */}
      <Modal
        visible={isTrackingModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTrackingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('common.shipment_details', { defaultValue: 'Shipment Details' })}</Text>
              <TouchableOpacity onPress={() => setIsTrackingModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {trackedShipment && (
              <ScrollView style={styles.modalBody}>
                <Text style={styles.detailTitle}>{t('common.tracking_number', { defaultValue: 'Tracking Number' })}</Text>
                <Text style={styles.detailValueLarge}>{trackedShipment.trackingNumber}</Text>

                <Text style={styles.detailTitle}>{t('common.status', { defaultValue: 'Status' })}</Text>
                <Text style={styles.detailValue}>{trackedShipment.status}</Text>

                <Text style={styles.detailTitle}>{t('common.current_location', { defaultValue: 'Current Location' })}</Text>
                <Text style={styles.detailValue}>{trackedShipment.location || t('common.unknown', { defaultValue: 'Unknown' })}</Text>

                <Text style={styles.detailTitle}>{t('common.origin', { defaultValue: 'Origin' })}</Text>
                <Text style={styles.detailValue}>{trackedShipment.origin}</Text>

                <Text style={styles.detailTitle}>{t('common.destination', { defaultValue: 'Destination' })}</Text>
                <Text style={styles.detailValue}>{trackedShipment.destination}</Text>

                <Text style={styles.detailTitle}>{t('common.last_update', { defaultValue: 'Last Update' })}</Text>
                <Text style={styles.detailValue}>{trackedShipment.lastUpdate}</Text>

                <View style={styles.progressContainer}>
                  <Text style={styles.detailTitle}>{t('common.progress', { defaultValue: 'Progress' })}</Text>
                  <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarFill, { width: `${trackedShipment.progress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{trackedShipment.progress}%</Text>
                </View>

                <TouchableOpacity
                  style={styles.mapButton}
                  onPress={() => {
                    setIsTrackingModalVisible(false);
                    handleViewOnMap(trackedShipment);
                  }}
                >
                  <Text style={styles.mapButtonText}>{t('common.view_on_map', { defaultValue: 'View on Map' })}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animatable.View>
        </View>
      </Modal>

      {/* Command Modal */}
      <Modal
        visible={commandModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCommandModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('common.commands', { defaultValue: 'Commands' })}</Text>
              <TouchableOpacity onPress={() => setCommandModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={commands}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.commandItem}
                  onPress={() => handleSendCommand(item)}
                >
                  <Text style={styles.commandName}>{item.name}</Text>
                  <Text style={styles.commandDescription}>{item.description}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.commandList}
            />
          </Animatable.View>
        </View>
      </Modal>

      {roleId === 255 && (
        <TouchableOpacity style={styles.fab} onPress={handleCreateTicket}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Ticket Details Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('common.ticket_details', { defaultValue: 'Ticket Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedTicket && (
              <>
                <ScrollView style={styles.modalBody}>
                  <View style={styles.ticketDetailHeader}>
                    <Text style={styles.ticketDetailNumber}>
                      {selectedTicket.ticketNumber || `#${selectedTicket.id}`}
                    </Text>
                    <View style={[styles.statusBadgeLarge,
                      { backgroundColor: getTicketStatusInfo(selectedTicket.status, t).color + '20' }]}>
                      <Text style={[styles.statusTextLarge, { color: getTicketStatusInfo(selectedTicket.status, t).color }]}>
                        {getTicketStatusInfo(selectedTicket.status, t).text}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.ticketDetailTitle}>{selectedTicket.subject}</Text>
                  <Text style={styles.ticketDetailDescription}>
                    {cleanTicketDescription(selectedTicket.description)}
                  </Text>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>{t('common.priority', { defaultValue: 'Priority' })}</Text>
                      <View style={[styles.priorityBadgeLarge,
                        { backgroundColor: getPriorityColor(selectedTicket.priority) + '20' }]}>
                        <Text style={[styles.priorityTextLarge, { color: getPriorityColor(selectedTicket.priority) }]}>
                          {selectedTicket.priority}
                        </Text>
                      </View>
                    </View>

                    {selectedTicket.t1Number && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('common.t1_number', { defaultValue: 'T1 Number' })}</Text>
                        <Text style={styles.infoValue}>{selectedTicket.t1Number}</Text>
                      </View>
                    )}

                    {selectedTicket.truckReg && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('common.device', { defaultValue: 'Device' })}</Text>
                        <Text style={styles.infoValue}>{selectedTicket.truckReg}</Text>
                      </View>
                    )}

                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>{t('common.created', { defaultValue: 'Created' })}</Text>
                      <Text style={styles.infoValue}>
                        {selectedTicket.createdAt}
                      </Text>
                    </View>

                    {selectedTicket.updatedAt && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('common.last_updated', { defaultValue: 'Last Updated' })}</Text>
                        <Text style={styles.infoValue}>
                          {new Date(selectedTicket.updatedAt).toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>

                  {selectedTicket.t1Number && (
                    <TouchableOpacity
                      style={[styles.mapButton, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                      onPress={() => {
                        setModalVisible(false);
                        const shipment = shipments.find(s => s.trackingNumber === selectedTicket.t1Number);
                        if (shipment) {
                          navigation.navigate('DeviceMapScreen', { shipment });
                        } else {
                          navigation.navigate('DeviceMapScreen', { t1Number: selectedTicket.t1Number });
                        }
                      }}
                    >
                      <Image source={require('../assets/map.png')} style={{ width: 20, height: 20 }} />
                      <Text style={styles.mapButtonText}>{t('common.track_on_map', { defaultValue: 'Track on Map' })}</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>

                {/* Modal action buttons */}
                <View style={styles.modalActions}>
                  {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') ? (
                    <View style={[styles.submitButton, { backgroundColor: '#4CAF50', flex: 1 }]}>
                      <Text style={styles.submitButtonText}>
                        {selectedTicket.status === 'RESOLVED' ? t('common.resolved', { defaultValue: '✓ Resolved' }) : t('common.closed', { defaultValue: '✓ Closed' })}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Show Claim button only for broadcast tickets (assignee null) and ticket is OPEN */}
                      {!selectedTicket.assignee && selectedTicket.status === 'OPEN' && (
                        <TouchableOpacity
                          style={[styles.submitButton, { backgroundColor: '#8B5CF6', flex: 1 }]}
                          onPress={() => handleClaimTicket(selectedTicket.id)}
                          disabled={claimingTicketId === selectedTicket.id}
                        >
                          {claimingTicketId === selectedTicket.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.submitButtonText}>{t('common.claim', { defaultValue: 'Claim Ticket' })}</Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {selectedTicket.status === 'ACKNOWLEDGED' ? (
                        <TouchableOpacity
                          style={[styles.submitButton, { flex: 1 }]}
                          onPress={() => handleResolve(selectedTicket)}
                          disabled={resolvingTicketId === selectedTicket.id}
                        >
                          {resolvingTicketId === selectedTicket.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.submitButtonText}>{t('common.resolve', { defaultValue: 'Resolve' })}</Text>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[
                              styles.submitButton,
                              (acknowledgingTicketId === selectedTicket.id) && styles.submitButtonDisabled
                            ]}
                            onPress={() => handleAcknowledge(selectedTicket.id)}
                            disabled={acknowledgingTicketId === selectedTicket.id}
                          >
                            {acknowledgingTicketId === selectedTicket.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.submitButtonText}>{t('common.acknowledge', { defaultValue: 'Acknowledge' })}</Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.submitButton,
                              (resolvingTicketId === selectedTicket.id) && styles.submitButtonDisabled
                            ]}
                            onPress={() => handleResolve(selectedTicket)}
                            disabled={resolvingTicketId === selectedTicket.id}
                          >
                            {resolvingTicketId === selectedTicket.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.submitButtonText}>{t('common.resolve', { defaultValue: 'Resolve' })}</Text>
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}
                </View>
              </>
            )}
          </Animatable.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  greeting: { fontSize: 18, color: '#1A1A1A', fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { marginLeft: 16, position: 'relative' },
  headerIcon: { width: 24, height: 24 },
  badge: { position: 'absolute', top: -5, right: -8, backgroundColor: '#FFA500', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  syncIndicator: { marginLeft: 16 },
  offlineBanner: { backgroundColor: '#FF9800', padding: 8, marginHorizontal: 20, marginBottom: 12, borderRadius: 8, alignItems: 'center' },
  offlineBannerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
  trackingCard: { backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 20, padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 1 },
  trackingTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 },
  trackingSearch: { flexDirection: 'row' },
  searchInput: { flex: 1, borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, backgroundColor: '#FAFAFA', marginRight: 12 },
  trackButton: { backgroundColor: '#FFA500', borderRadius: 12, paddingHorizontal: 24, justifyContent: 'center', shadowColor: '#FFA500', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3 },
  trackButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  quickActionsGrid: { marginHorizontal: 20, marginBottom: 20, marginTop: 16 },
  actionsContainer: { gap: 16 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  actionCard: {
    width: (width - 56) / 4,
    alignItems: 'center',
    minHeight: 80,
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIcon: { width: 24, height: 24 },
  actionLabel: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  alarmCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 16, padding: 16, borderRadius: 12, shadowOpacity: 0.05, elevation: 1 },
  alarmInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  alarmIcon: { width: 32, height: 32, marginRight: 12, tintColor: '#FFA500' },
  alarmTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  alarmSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#FFA500' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#666' },
  activeTabText: { color: '#FFA500', fontWeight: '600' },
  listContent: { paddingBottom: 100 },

  // Broadcast badge style
  broadcastBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  broadcastBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Shipment Card Styles
  shipmentCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  shipmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  trackingInfo: { flex: 1 },
  trackingNumber: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '500' },
  mapIcon: { width: 24, height: 24 },
  routeInfo: { marginBottom: 12 },
  locationPoint: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pointCircle: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFA500', marginRight: 12 },
  pointCircleDestination: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginRight: 12 },
  pointLine: { position: 'absolute', left: 3, top: 12, width: 2, height: 20, backgroundColor: '#E0E0E0' },
  locationText: { fontSize: 14, color: '#666' },
  progressContainer: { marginBottom: 12 },
  progressBarBackground: { height: 8, backgroundColor: '#F0F0F0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: '#FFA500', borderRadius: 4 },
  progressText: { fontSize: 12, color: '#666', marginTop: 4 },
  shipmentDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#666', marginTop: 10 },
  detailValue: { fontSize: 16, color: '#333', marginBottom: 5 },
  shipmentActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { fontSize: 14, color: '#FFA500', fontWeight: '500' },

  // Ticket Card Styles
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0,
    borderColor: '#F0F0F0',
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 8,
  },
  ticketNumberLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
  },
  ticketNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFA500',
    marginRight: 'auto',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  priorityIcon: {
    fontSize: 10,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTextSmall: {
    fontSize: 10,
    fontWeight: '600',
  },
  ticketTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  descriptionContainer: {
    marginBottom: 10,
  },
  descriptionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
    marginBottom: 4,
  },
  ticketDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
  },
  ticketFooterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
    marginBottom: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#999',
  },
  footerIcon: {
    fontSize: 11,
  },
  footerValue: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  commentsCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
    marginTop: 2,
  },
  commentsIcon: {
    fontSize: 11,
  },
  commentsText: {
    fontSize: 10,
    color: '#FFA500',
  },

  // Alert Card Styles
  alertCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  alertTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  alertMessage: { fontSize: 12, color: '#666', marginBottom: 8 },
  alertTime: { fontSize: 10, color: '#999' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  closeButtonText: { fontSize: 24, color: '#999' },
  modalBody: { padding: 20 },
  detailTitle: { fontSize: 12, fontWeight: '600', color: '#999', marginTop: 12, marginBottom: 4 },
  detailValueLarge: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  mapButton: { backgroundColor: '#FFA500', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  mapButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

  // FAB
  fab: { position: 'absolute', bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFA500', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  fabText: { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },

  // Command Modal
  commandItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  commandName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  commandDescription: { fontSize: 12, color: '#666' },
  commandList: { paddingBottom: 20 },

  // Input Styles
  inputContainer: { paddingHorizontal: 20, marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333333', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1A1A1A', backgroundColor: '#FAFAFA' },

  // Modal Actions
  modalActions: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5E5', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#666666' },
  submitButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FFA500', alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#CCCCCC' },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  // Loading & Empty States
  loaderContainer: { padding: 40, alignItems: 'center' },
  loaderText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#999' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
  errorIcon: {
    width: 64,
    height: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  retryButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },

  // Ticket Detail Modal Styles
  ticketDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  ticketDetailNumber: { fontSize: 14, fontWeight: '600', color: '#666' },
  statusBadgeLarge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusTextLarge: { fontSize: 12, fontWeight: '600' },
  ticketDetailTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  ticketDetailDescription: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 24 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  infoItem: { flex: 1, minWidth: '45%' },
  infoLabel: { fontSize: 11, fontWeight: '600', color: '#999', marginBottom: 6 },
  infoValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  priorityBadgeLarge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 6 },
  priorityTextLarge: { fontSize: 12, fontWeight: '600' },

  // Animation Wrapper
  animationWrapper: { marginHorizontal: 8, marginBottom: 8 },

  // Additional Ticket Styles
  ticketId: { fontSize: 12, color: '#999', fontWeight: '500' },
  ticketSubject: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  ticketDate: { fontSize: 10, color: '#999' },

  // Notification Styles
  notificationCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  unreadNotification: { backgroundColor: '#FFF9E6' },
  notificationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notificationIconText: { fontSize: 20 },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  notificationMessage: { fontSize: 12, color: '#666', marginBottom: 4 },
  notificationTime: { fontSize: 10, color: '#999' },
});

export default HomeScreen;
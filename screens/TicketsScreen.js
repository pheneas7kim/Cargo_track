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
  Animated,
  Alert,
  Image
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import { useTranslation } from 'react-i18next';
// ✅ Import global token refresh service
import { refreshAccessToken, addTokenRefreshListener } from '../services/TokenService';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');

// Priority order for sorting
const PRIORITY_ORDER = {
  'CRITICAL': 1,
  'HIGH': 2,
  'MEDIUM': 3,
  'LOW': 4
};

// Helper: Get ticket status info (matching HomeScreen)
const getTicketStatusInfo = (status, t) => {
  switch (status?.toUpperCase()) {
    case 'REPORTED':
      return { text: t('tickets.status.reported', { defaultValue: 'Reported' }), color: '#FFA500' };
    case 'ACKNOWLEDGED':
      return { text: t('tickets.status.acknowledged', { defaultValue: 'Acknowledged' }), color: '#2196F3' };
    case 'RESOLVED':
      return { text: t('tickets.status.resolved', { defaultValue: 'Resolved' }), color: '#4CAF50' };
    case 'CLOSED':
      return { text: t('tickets.status.closed', { defaultValue: 'Closed' }), color: '#2196F3' };
    default:
      return { text: status || t('tickets.status.unknown', { defaultValue: 'Unknown' }), color: '#999' };
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

// ✅ Helper function for fetch requests with retry on 401 (kept for form data)
const authenticatedFetch = async (url, options, i18n, retryCount = 0) => {
  try {
    let token = await AsyncStorage.getItem('accessToken');
    const language = await getLanguageHeader(i18n);

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': language,
      },
    });

    if (response.status === 401 && retryCount === 0) {
      console.log('🔐 Token expired, attempting refresh...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        console.log('✅ Token refreshed, retrying request...');
        return authenticatedFetch(url, options, i18n, 1);
      }
    }

    return response;
  } catch (error) {
    console.error('❌ Authenticated fetch error:', error);
    throw error;
  }
};

const TicketsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [tickets, setTickets] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [acknowledgingTicketId, setAcknowledgingTicketId] = useState(null);
  const [resolvingTicketId, setResolvingTicketId] = useState(null);

  // Comments state
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingActions, setPendingActions] = useState([]);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ✅ Listen for token refresh events
  useEffect(() => {
    const removeListener = addTokenRefreshListener((newToken) => {
      console.log('📡 Token refreshed in TicketsScreen');
    });
    return () => removeListener();
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Tickets Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: t('tickets.back_online', { defaultValue: 'Back online! Syncing data...' }),
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Auto-refresh when coming back online
            fetchTickets();
            fetchShipments();
            processPendingActions();
          } else {
            Snackbar.show({
              text: t('tickets.offline_mode', { defaultValue: 'Offline mode - using cached tickets' }),
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load pending actions from storage
        await loadPendingActions();

        // Load initial data
        await fetchTickets();
        await fetchShipments();
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

  // ========== OFFLINE: Cache tickets data ==========
  const cacheTicketsData = async (ticketsData) => {
    try {
      await OfflineDatabaseService.saveUserData('tickets_list', {
        data: ticketsData,
        timestamp: Date.now()
      });
      console.log('✅ Tickets data cached offline');
    } catch (error) {
      console.error('Error caching tickets:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached tickets ==========
  const loadCachedTickets = async () => {
    try {
      const cached = await OfflineDatabaseService.getUserData('tickets_list');
      if (cached && cached.data && cached.data.length > 0) {
        setTickets(cached.data);
        console.log('📦 Loaded cached tickets');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading cached tickets:', error);
      return false;
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Cache shipments data ==========
  const cacheShipmentsData = async (shipmentsData) => {
    try {
      await OfflineDatabaseService.saveUserData('shipments_list', {
        data: shipmentsData,
        timestamp: Date.now()
      });
      console.log('✅ Shipments data cached offline');
    } catch (error) {
      console.error('Error caching shipments:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached shipments ==========
  const loadCachedShipments = async () => {
    try {
      const cached = await OfflineDatabaseService.getUserData('shipments_list');
      if (cached && cached.data && cached.data.length > 0) {
        setShipments(cached.data);
        console.log('📦 Loaded cached shipments');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading cached shipments:', error);
      return false;
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Load pending actions ==========
  const loadPendingActions = async () => {
    try {
      const pending = await OfflineDatabaseService.getUserData('pending_ticket_actions');
      if (pending && pending.length > 0) {
        setPendingActions(pending);
        console.log('📦 Found pending ticket actions:', pending.length);
      }
    } catch (error) {
      console.error('Error loading pending actions:', error);
    }
  };
  // ========== END OFFLINE LOAD PENDING ==========

  // ========== OFFLINE: Save ticket action offline ==========
  const saveTicketActionOffline = async (action, ticketId, data = {}) => {
    try {
      const offlineAction = {
        id: Date.now(),
        action: action,
        ticketId: ticketId,
        data: data,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        syncStatus: 'PENDING'
      };

      const existingActions = await OfflineDatabaseService.getUserData('pending_ticket_actions') || [];
      // Avoid duplicates
      const exists = existingActions.some(a => a.ticketId === ticketId && a.action === action);
      if (!exists) {
        existingActions.push(offlineAction);
        await OfflineDatabaseService.saveUserData('pending_ticket_actions', existingActions);
        setPendingActions(existingActions);

        // Also add to sync queue
        if (action === 'ACKNOWLEDGE') {
          await OfflineDatabaseService.addToSyncQueue('ACKNOWLEDGE', `/tickets/acknowledge`, {
            ticketId: Number(ticketId),
            content: t('tickets.acknowledge_content', { defaultValue: 'Acknowledged from mobile app' })
          });
        } else if (action === 'RESOLVE') {
          await OfflineDatabaseService.addToSyncQueue('RESOLVE', `/tickets/${ticketId}/resolve`, {
            notes: t('tickets.resolve_notes', { defaultValue: 'Resolved from mobile app' })
          });
        } else if (action === 'COMMENT') {
          await OfflineDatabaseService.addToSyncQueue('COMMENT', `/tickets/${ticketId}/comments`, {
            content: data.content
          });
        }

        console.log(`📦 ${action} action saved offline for ticket ${ticketId}`);
      }
      return true;
    } catch (error) {
      console.error('Error saving ticket action offline:', error);
      return false;
    }
  };
  // ========== END OFFLINE SAVE ACTION ==========

  // ========== OFFLINE: Process pending actions ==========
  const processPendingActions = async () => {
    if (!isOnline) return;

    const pending = await OfflineDatabaseService.getUserData('pending_ticket_actions');
    if (!pending || pending.length === 0) return;

    console.log(`🔄 Processing ${pending.length} pending ticket actions...`);
    let successCount = 0;
    let failCount = 0;

    for (const action of pending) {
      try {
        if (action.action === 'ACKNOWLEDGE') {
          await authenticatedAxios(
            'post',
            {
              url: `${serverUrl}/tickets/acknowledge`,
              data: { ticketId: Number(action.ticketId), content: t('tickets.acknowledge_content', { defaultValue: 'Acknowledged from mobile app' }) },
              headers: { 'Content-Type': 'application/json' },
            },
            i18n
          );
          successCount++;
          console.log(`✅ Synced ACKNOWLEDGE for ticket ${action.ticketId}`);
        } else if (action.action === 'RESOLVE') {
          const formData = new FormData();
          formData.append('notes', t('tickets.resolve_notes', { defaultValue: 'Resolved from mobile app' }));

          const response = await authenticatedFetch(
            `${serverUrl}/tickets/${action.ticketId}/resolve`,
            { method: 'POST', body: formData },
            i18n
          );

          if (response.ok) {
            successCount++;
            console.log(`✅ Synced RESOLVE for ticket ${action.ticketId}`);
          } else {
            failCount++;
          }
        } else if (action.action === 'COMMENT') {
          await authenticatedAxios(
            'post',
            {
              url: `${serverUrl}/tickets/${action.ticketId}/comments`,
              data: { content: action.data.content },
              headers: { 'Content-Type': 'application/json' },
            },
            i18n
          );
          successCount++;
          console.log(`✅ Synced COMMENT for ticket ${action.ticketId}`);
        }
      } catch (error) {
        console.error(`Failed to sync action for ticket ${action.ticketId}:`, error);
        failCount++;
      }
    }

    // Clear processed actions from storage
    await OfflineDatabaseService.saveUserData('pending_ticket_actions', []);
    setPendingActions([]);

    if (successCount > 0) {
      Snackbar.show({
        text: t('tickets.synced_actions', { defaultValue: 'Synced {{count}} ticket action(s)', count: successCount }).replace('{{count}}', successCount.toString()),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
      await fetchTickets();
    }
  };
  // ========== END OFFLINE PROCESS PENDING ==========

  // ========== OFFLINE: Manual sync function ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: t('tickets.cannot_sync_offline', { defaultValue: 'Cannot sync while offline' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await processPendingActions();
      await fetchTickets();
      await fetchShipments();
      Snackbar.show({
        text: t('tickets.sync_complete', { defaultValue: 'Sync completed successfully!' }),
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: t('tickets.sync_failed', { defaultValue: 'Sync failed' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSyncing(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchTickets();
      fetchShipments();

      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  // Fetch shipments for tracking
  const fetchShipments = async () => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        const hasCached = await loadCachedShipments();
        if (hasCached) {
          return;
        }
      }
      // ========== END OFFLINE CHECK ==========

      // ✅ FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/telemetry/latest-t1s`,
        },
        i18n
      );

      if (response.data) {
        setShipments(response.data);
        // ========== OFFLINE: Cache fetched shipments ==========
        await cacheShipmentsData(response.data);
        // ========== END OFFLINE CACHE ==========
      }
    } catch (error) {
      console.error('Failed to fetch shipments:', error);
      // ========== OFFLINE: Fallback to cached shipments on error ==========
      await loadCachedShipments();
      // ========== END OFFLINE FALLBACK ==========
    }
  };

  // Acknowledge ticket function - FIXED
  const acknowledgeTicket = async (ticketId) => {
    const response = await authenticatedAxios(
      'post',  // <-- FIXED: Use string method name
      {
        url: `${serverUrl}/tickets/acknowledge`,
        data: { ticketId: Number(ticketId), content: t('tickets.acknowledge_content', { defaultValue: 'Acknowledged from mobile app' }) },
        headers: { 'Content-Type': 'application/json' },
      },
      i18n
    );
    return response.data;
  };

  // Resolve ticket function - uses fetch for form data
  const resolveTicket = async (ticketId) => {
    const formData = new FormData();
    formData.append('notes', t('tickets.resolve_notes', { defaultValue: 'Resolved from mobile app' }));

    const response = await authenticatedFetch(
      `${serverUrl}/tickets/${ticketId}/resolve`,
      {
        method: 'POST',
        body: formData,
      },
      i18n
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resolve error:', errorText);
      throw new Error(t('tickets.errors.resolve_failed', { defaultValue: 'Failed to resolve ticket' }));
    }
    return await response.json();
  };

  // Add comment function - FIXED
  const addComment = async () => {
    if (!commentText.trim()) {
      Snackbar.show({
        text: t('tickets.errors.comment_required', { defaultValue: 'Please enter a comment' }),
        duration: 2000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      // Save comment offline
      const saved = await saveTicketActionOffline('COMMENT', selectedTicket.id, { content: commentText });
      if (saved) {
        Snackbar.show({
          text: t('tickets.success.comment_saved_offline', { defaultValue: 'Comment saved offline. Will sync when online.' }),
          duration: 3000,
          backgroundColor: '#FF9800',
        });
        setCommentText('');
        // Refresh tickets to show optimistic update?
        await fetchTickets();
      } else {
        Snackbar.show({
          text: t('tickets.errors.comment_failed', { defaultValue: 'Failed to add comment' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      return;
    }
    // ========== END OFFLINE CHECK ==========

    setSubmitting(true);
    try {
      await authenticatedAxios(
        'post',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/tickets/${selectedTicket.id}/comments`,
          data: { content: commentText },
          headers: { 'Content-Type': 'application/json' },
        },
        i18n
      );

      // Refresh tickets
      await fetchTickets();

      // Update selected ticket
      const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }

      setCommentText('');
      Snackbar.show({
        text: t('tickets.success.comment_added', { defaultValue: 'Comment added successfully' }),
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Failed to add comment:', error);

      // ========== OFFLINE: Offer to save offline on error ==========
      if (!isOnline) {
        const saved = await saveTicketActionOffline('COMMENT', selectedTicket.id, { content: commentText });
        if (saved) {
          Snackbar.show({
            text: t('tickets.success.comment_saved_offline', { defaultValue: 'Comment saved offline. Will sync when online.' }),
            duration: 3000,
            backgroundColor: '#FF9800',
          });
          setCommentText('');
          await fetchTickets();
        } else {
          Snackbar.show({
            text: t('tickets.errors.comment_failed', { defaultValue: 'Failed to add comment' }),
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
        }
      } else {
        Snackbar.show({
          text: t('tickets.errors.comment_failed', { defaultValue: 'Failed to add comment' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      // ========== END OFFLINE OFFER ==========
    } finally {
      setSubmitting(false);
    }
  };

  const fetchTickets = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        const hasCached = await loadCachedTickets();
        if (hasCached) {
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
      // ========== END OFFLINE CHECK ==========

      const userObj = await AsyncStorage.getItem('user');
      const user = userObj ? JSON.parse(userObj) : null;
      const userId = user?.id || await AsyncStorage.getItem('id');

      if (!userId) {
        console.error('No user ID found');
        return;
      }

      // ✅ FIXED: Changed from axios.get to 'get' string method
      const response = await authenticatedAxios(
        'get',  // <-- FIXED: Use string method name
        {
          url: `${serverUrl}/tickets/assignee/${userId}?page=0&size=10000&sort=createdAt,desc`,
        },
        i18n
      );

      if (response.data && response.data.content) {
        const ticketsData = response.data.content.map(t => {
          // Get latest status from comments if available
          const latestStatusFromComments = t.comments && t.comments.length > 0
            ? t.comments[t.comments.length - 1].newStatus
            : null;
          const finalStatus = latestStatusFromComments || t.status;

          return {
            id: t.id,
            ticketNumber: t.ticketNumber,
            title: t.title,
            description: t.description,
            priority: t.priority,
            status: finalStatus?.toUpperCase(),
            t1Number: t.t1Number,
            assignedTo: t.assignee ? {
              id: t.assignee.userId,
              name: (t.assignee.firstName && t.assignee.lastName)
                ? `${t.assignee.firstName} ${t.assignee.lastName}`
                : (t.assignee.username || t.assignee.email || `User ${t.assignee.userId}`)
            } : null,
            reporter: t.reporter ? {
              id: t.reporter.userId,
              name: (t.reporter.firstName && t.reporter.lastName)
                ? `${t.reporter.firstName} ${t.reporter.lastName}`
                : (t.reporter.username || t.reporter.email || `User ${t.reporter.userId}`)
            } : null,
            sourceNotificationId: t.sourceNotificationId,
            deviceSerialNumber: t.deviceSerialNumber,
            geofenceName: t.geofenceName,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            resolvedAt: t.resolvedAt,
            closedAt: t.closedAt,
            comments: t.comments ? t.comments.map(c => ({
              id: c.id,
              user: c.author ? {
                id: c.author.userId,
                name: (c.author.firstName && c.author.lastName)
                  ? `${c.author.firstName} ${c.author.lastName}`
                  : (c.author.username || c.author.email || `User ${c.author.userId}`)
              } : { name: 'System' },
              text: c.content,
              oldStatus: c.oldStatus,
              newStatus: c.newStatus,
              createdAt: c.createdAt
            })) : [],
            read: false
          };
        }).sort((a, b) => {
          const p1 = PRIORITY_ORDER[a.priority] || 99;
          const p2 = PRIORITY_ORDER[b.priority] || 99;
          if (p1 !== p2) return p1 - p2;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        setTickets(ticketsData);

        // ========== OFFLINE: Cache fetched tickets ==========
        await cacheTicketsData(ticketsData);
        // ========== END OFFLINE CACHE ==========
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);

      // ========== OFFLINE: Fallback to cached tickets on error ==========
      const hasCached = await loadCachedTickets();
      if (!hasCached) {
        Snackbar.show({
          text: t('tickets.errors.load_failed', { defaultValue: 'Failed to load tickets' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      } else {
        Snackbar.show({
          text: t('tickets.using_cached', { defaultValue: 'Using cached tickets (offline mode)' }),
          duration: 3000,
          backgroundColor: '#FF9800',
        });
      }
      // ========== END OFFLINE FALLBACK ==========
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // ========== OFFLINE: Manual sync on refresh ==========
    if (isOnline) {
      manualSync();
    } else {
      fetchTickets(true);
    }
    // ========== END OFFLINE MANUAL SYNC ==========
  };

  const getPriorityColor = (priority) => {
    switch(priority?.toUpperCase()) {
      case 'CRITICAL': return '#FF6B6B';
      case 'HIGH': return '#FFA500';
      case 'MEDIUM': return '#FFC107';
      case 'LOW': return '#4CAF50';
      default: return '#666';
    }
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

  const formatDate = (dateString) => {
    if (!dateString) return t('tickets.na', { defaultValue: 'N/A' });
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('tickets.time.just_now', { defaultValue: 'Just now' });
    if (diffMins < 60) return t('tickets.time.minutes_ago', { defaultValue: '{{count}}m ago' }).replace('{{count}}', diffMins.toString());
    if (diffHours < 24) return t('tickets.time.hours_ago', { defaultValue: '{{count}}h ago' }).replace('{{count}}', diffHours.toString());
    if (diffDays < 7) return t('tickets.time.days_ago', { defaultValue: '{{count}}d ago' }).replace('{{count}}', diffDays.toString());
    return date.toLocaleDateString();
  };

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

  const getStatusCounts = () => {
    return {
      all: tickets.length,
      reported: tickets.filter(t => t.status?.toUpperCase() === 'REPORTED').length,
      acknowledged: tickets.filter(t => t.status?.toUpperCase() === 'ACKNOWLEDGED').length,
      resolved: tickets.filter(t => t.status?.toUpperCase() === 'RESOLVED').length,
    };
  };

  const getFilteredTickets = () => {
    let filtered = [...tickets];

    switch (filter) {
      case 'all':
        filtered = [...tickets];
        break;
      case 'reported':
        filtered = filtered.filter(t => t.status?.toUpperCase() === 'REPORTED');
        break;
      case 'acknowledged':
        filtered = filtered.filter(t => t.status?.toUpperCase() === 'ACKNOWLEDGED');
        break;
      case 'resolved':
        filtered = filtered.filter(t => t.status?.toUpperCase() === 'RESOLVED');
        break;
      default:
        filtered = [...tickets];
        break;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.title?.toLowerCase().includes(query) ||
        t.ticketNumber?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.deviceSerialNumber?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const handleAcknowledge = async (ticketId) => {
    if (acknowledgingTicketId) return;

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      // Save acknowledge action offline
      const saved = await saveTicketActionOffline('ACKNOWLEDGE', ticketId);
      if (saved) {
        Snackbar.show({
          text: t('tickets.success.acknowledged_offline', { defaultValue: 'Acknowledgment saved offline. Will sync when online.' }),
          duration: 3000,
          backgroundColor: '#FF9800',
        });
        setModalVisible(false);
        setSelectedTicket(null);
        // Optimistically update local state
        const updatedTickets = tickets.map(t =>
          t.id === ticketId ? { ...t, status: 'ACKNOWLEDGED' } : t
        );
        setTickets(updatedTickets);
        await cacheTicketsData(updatedTickets);
      } else {
        Snackbar.show({
          text: t('tickets.errors.acknowledge_failed', { defaultValue: 'Failed to acknowledge ticket' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      return;
    }
    // ========== END OFFLINE CHECK ==========

    setAcknowledgingTicketId(ticketId);
    try {
      await acknowledgeTicket(ticketId);
      Snackbar.show({ text: t('tickets.success.acknowledged', { defaultValue: 'Ticket acknowledged successfully' }), duration: 2000, backgroundColor: '#4CAF50' });
      setModalVisible(false);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (e) {
      Snackbar.show({ text: t('tickets.errors.acknowledge_failed', { defaultValue: 'Failed to acknowledge ticket' }), duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
      setAcknowledgingTicketId(null);
    }
  };

  const handleResolve = async (ticketId) => {
    if (resolvingTicketId) return;

    // ========== OFFLINE: Check if online ==========
    const online = await NetworkMonitorService.isOnline();

    if (!online) {
      // Save resolve action offline
      const saved = await saveTicketActionOffline('RESOLVE', ticketId);
      if (saved) {
        Snackbar.show({
          text: t('tickets.success.resolved_offline', { defaultValue: 'Resolution saved offline. Will sync when online.' }),
          duration: 3000,
          backgroundColor: '#FF9800',
        });
        setModalVisible(false);
        setSelectedTicket(null);
        // Optimistically update local state
        const updatedTickets = tickets.map(t =>
          t.id === ticketId ? { ...t, status: 'RESOLVED' } : t
        );
        setTickets(updatedTickets);
        await cacheTicketsData(updatedTickets);
      } else {
        Snackbar.show({
          text: t('tickets.errors.resolve_failed', { defaultValue: 'Failed to resolve ticket' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
      }
      return;
    }
    // ========== END OFFLINE CHECK ==========

    setResolvingTicketId(ticketId);
    try {
      await resolveTicket(ticketId);
      Snackbar.show({ text: t('tickets.success.resolved', { defaultValue: 'Ticket resolved successfully' }), duration: 2000, backgroundColor: '#4CAF50' });
      setModalVisible(false);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (e) {
      Snackbar.show({ text: t('tickets.errors.resolve_failed', { defaultValue: 'Failed to resolve ticket' }), duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
      setResolvingTicketId(null);
    }
  };

  const renderTicket = ({ item, index }) => {
    const statusInfo = getTicketStatusInfo(item.status, t);
    const statusColor = statusInfo.color;
    const priorityColor = getPriorityColor(item.priority);

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
            {/* Top Row: Ticket Number | Priority | Status */}
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketNumber}>{item.ticketNumber || `#${item.id}`}</Text>
              <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                <Text style={styles.priorityIcon}>{getPriorityIcon(item.priority)}</Text>
                <Text style={[styles.priorityText, { color: priorityColor }]}>
                  {item.priority}
                </Text>
              </View>
              <View style={[styles.statusBadgeSmall, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusTextSmall, { color: statusColor }]}>
                  {statusInfo.text}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.ticketTitle}>{item.title}</Text>

            {/* Description */}
            <Text style={styles.ticketDescription} numberOfLines={2}>
              {cleanTicketDescription(item.description)}
            </Text>

            {/* Bottom Row: Time, T1, Device */}
            <View style={styles.ticketFooter}>
              <View style={styles.footerItem}>
                <Text style={styles.footerIcon}>🕒</Text>
                <Text style={styles.footerText}>{formatDate(item.updatedAt || item.createdAt)}</Text>
              </View>

              {item.t1Number && (
                <View style={styles.footerItem}>
                  <Text style={styles.footerIcon}>📄</Text>
                  <Text style={styles.footerText}>{item.t1Number}</Text>
                </View>
              )}

              {item.deviceSerialNumber && (
                <View style={styles.footerItem}>
                  <Text style={styles.footerIcon}>📱</Text>
                  <Text style={styles.footerText}>{item.deviceSerialNumber}</Text>
                </View>
              )}
            </View>

            {item.comments && item.comments.length > 0 && (
              <View style={styles.commentsCount}>
                <Text style={styles.commentsIcon}>💬</Text>
                <Text style={styles.commentsText}>{item.comments.length} {t('tickets.comments', { defaultValue: 'comments' })}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderHeader = () => {
    const counts = getStatusCounts();
    const totalTickets = tickets.length;

    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('tickets.header_title', { defaultValue: 'Tickets' })}</Text>
            <View style={styles.headerRight}>
              {/* ========== OFFLINE: Manual sync button ========== */}
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFA500" style={styles.syncIndicator} />
              ) : (
                <TouchableOpacity onPress={manualSync} style={styles.syncButton}>
                  <Icon name="sync" size={20} color={isOnline ? "#4CAF50" : "#999"} />
                </TouchableOpacity>
              )}
              {/* ========== END OFFLINE SYNC BUTTON ========== */}
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => navigation.navigate('CreateTicket')}
              >
                <Text style={styles.createButtonText}>{t('tickets.new_button', { defaultValue: '+ New' })}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ========== OFFLINE: Network status banner ========== */}
          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached tickets</Text>
            </View>
          )}
          {/* ========== END OFFLINE BANNER ========== */}

          {/* ========== OFFLINE: Pending actions banner ========== */}
          {pendingActions.length > 0 && isOnline && (
            <TouchableOpacity style={styles.pendingBanner} onPress={processPendingActions}>
              <Icon name="pending" size={16} color="#FF9800" />
              <Text style={styles.pendingBannerText}>
                {pendingActions.length} pending action(s) to sync. Tap to sync now.
              </Text>
            </TouchableOpacity>
          )}
          {/* ========== END OFFLINE PENDING BANNER ========== */}

          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={t('tickets.search_placeholder', { defaultValue: 'Search tickets....' })}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsContainer}
          >
            {/* All Filter */}
            <TouchableOpacity
              style={[styles.statCard, filter === 'all' && styles.activeStatCard]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.statNumber, { color: '#1A1A1A' }]}>{counts.all}</Text>
              <Text style={styles.statLabel}>{t('tickets.filters.all', { defaultValue: 'All' })}</Text>
            </TouchableOpacity>

            {/* Reported Filter */}
            <TouchableOpacity
              style={[styles.statCard, filter === 'reported' && styles.activeStatCard]}
              onPress={() => setFilter('reported')}
            >
              <Text style={[styles.statNumber, { color: '#FFA500' }]}>{counts.reported}</Text>
              <Text style={styles.statLabel}>{t('tickets.filters.reported', { defaultValue: 'Reported' })}</Text>
            </TouchableOpacity>

            {/* Acknowledged Filter */}
            <TouchableOpacity
              style={[styles.statCard, filter === 'acknowledged' && styles.activeStatCard]}
              onPress={() => setFilter('acknowledged')}
            >
              <Text style={[styles.statNumber, { color: '#2196F3' }]}>{counts.acknowledged}</Text>
              <Text style={styles.statLabel}>{t('tickets.filters.acknowledged', { defaultValue: 'Acknowledged' })}</Text>
            </TouchableOpacity>

            {/* Resolved Filter */}
            <TouchableOpacity
              style={[styles.statCard, filter === 'resolved' && styles.activeStatCard]}
              onPress={() => setFilter('resolved')}
            >
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{counts.resolved}</Text>
              <Text style={styles.statLabel}>{t('tickets.filters.resolved', { defaultValue: 'Resolved' })}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Show total count */}
          <View style={styles.totalContainer}>
            <Text style={styles.totalText}>{t('tickets.total', { defaultValue: 'Total' })}: {totalTickets} {t('tickets.tickets_label', { defaultValue: 'tickets' })}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('tickets.loading', { defaultValue: 'Loading tickets...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      <FlatList
        data={getFilteredTickets()}
        keyExtractor={item => item.id.toString()}
        renderItem={renderTicket}
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
            <Text style={styles.emptyIcon}>🎫</Text>
            <Text style={styles.emptyTitle}>{t('tickets.empty_title', { defaultValue: 'No tickets found' })}</Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? t('tickets.empty_search', { defaultValue: 'Try adjusting your search' })
                : filter !== 'all'
                ? t('tickets.empty_filter', { defaultValue: 'No {{filter}} tickets available' }).replace('{{filter}}', filter)
                : t('tickets.empty_default', { defaultValue: 'Create a new ticket to get started' })}
            </Text>
          </Animatable.View>
        }
      />

      {/* Ticket Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('tickets.modal_title', { defaultValue: 'Ticket Details' })}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedTicket && (
              <>
                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  {/* Ticket Header */}
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

                  <Text style={styles.ticketDetailTitle}>{selectedTicket.title}</Text>
                  <Text style={styles.ticketDetailDescription}>
                    {cleanTicketDescription(selectedTicket.description)}
                  </Text>

                  {/* Ticket Info Grid */}
                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>{t('tickets.priority', { defaultValue: 'Priority' })}</Text>
                      <View style={[styles.priorityBadgeLarge,
                        { backgroundColor: getPriorityColor(selectedTicket.priority) + '20' }]}>
                        <Text style={styles.priorityIconLarge}>
                          {getPriorityIcon(selectedTicket.priority)}
                        </Text>
                        <Text style={[styles.priorityTextLarge, { color: getPriorityColor(selectedTicket.priority) }]}>
                          {selectedTicket.priority}
                        </Text>
                      </View>
                    </View>

                    {selectedTicket.t1Number && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('tickets.t1_number', { defaultValue: 'T1 Number' })}</Text>
                        <Text style={styles.infoValue}>{selectedTicket.t1Number}</Text>
                      </View>
                    )}

                    {selectedTicket.deviceSerialNumber && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('tickets.device', { defaultValue: 'Device' })}</Text>
                        <Text style={styles.infoValue}>{selectedTicket.deviceSerialNumber}</Text>
                      </View>
                    )}

                    {selectedTicket.geofenceName && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('tickets.geofence', { defaultValue: 'Geofence' })}</Text>
                        <Text style={styles.infoValue}>{selectedTicket.geofenceName}</Text>
                      </View>
                    )}

                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>{t('tickets.created', { defaultValue: 'Created' })}</Text>
                      <Text style={styles.infoValue}>
                        {new Date(selectedTicket.createdAt).toLocaleString()}
                      </Text>
                    </View>

                    {selectedTicket.updatedAt && (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>{t('tickets.last_updated', { defaultValue: 'Last Updated' })}</Text>
                        <Text style={styles.infoValue}>
                          {new Date(selectedTicket.updatedAt).toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Track on Map Button - with map.png icon */}
                  {selectedTicket.t1Number && (
                    <TouchableOpacity
                      style={[styles.mapButton, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                      onPress={() => {
                        setModalVisible(false);
                        const shipment = shipments.find(s => s.t1Number === selectedTicket.t1Number);
                        if (shipment) {
                          navigation.navigate('DeviceMapScreen', { shipment });
                        } else {
                          navigation.navigate('DeviceMapScreen', { t1Number: selectedTicket.t1Number });
                        }
                      }}
                    >
                      <Image source={require('../assets/map.png')} style={{ width: 20, height: 20 }} />
                      <Text style={styles.mapButtonText}>{t('tickets.track_on_map', { defaultValue: 'Track on Map' })}</Text>
                    </TouchableOpacity>
                  )}

                  {/* COMMENTS SECTION - PRESERVED */}
                  <View style={styles.commentsSection}>
                    <TouchableOpacity
                      style={styles.commentsHeader}
                      onPress={() => setShowComments(!showComments)}
                    >
                      <Text style={styles.sectionTitle}>
                        {t('tickets.comments_title', { defaultValue: 'Comments' })} ({selectedTicket.comments?.length || 0})
                      </Text>
                      <Text style={styles.expandIcon}>
                        {showComments ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>

                    {showComments && (
                      <View style={styles.commentsList}>
                        {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                          selectedTicket.comments.map((comment, index) => (
                            <View key={comment.id || index} style={styles.commentItem}>
                              <View style={styles.commentHeader}>
                                <Text style={styles.commentUser}>{comment.user?.name || t('tickets.system', { defaultValue: 'System' })}</Text>
                                <Text style={styles.commentTime}>{formatDate(comment.createdAt)}</Text>
                              </View>
                              <Text style={styles.commentText}>{comment.text}</Text>
                              {comment.oldStatus && comment.newStatus && (
                                <Text style={styles.statusChangeText}>
                                  {t('tickets.status_change', { defaultValue: 'Status changed from {{old}} to {{new}}' }).replace('{{old}}', comment.oldStatus).replace('{{new}}', comment.newStatus)}
                                </Text>
                              )}
                            </View>
                          ))
                        ) : (
                          <Text style={styles.noCommentsText}>{t('tickets.no_comments', { defaultValue: 'No comments yet' })}</Text>
                        )}
                      </View>
                    )}

                    <View style={styles.addCommentSection}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder={t('tickets.comment_placeholder', { defaultValue: 'Add a comment...' })}
                        placeholderTextColor="#999"
                        value={commentText}
                        onChangeText={setCommentText}
                        multiline
                        numberOfLines={3}
                      />

                      <TouchableOpacity
                        style={[styles.submitCommentButton, submitting && styles.disabledButton]}
                        onPress={addComment}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.submitCommentText}>{t('tickets.post_comment', { defaultValue: 'Post Comment' })}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>

                {/* ACTION BUTTONS - Consolidated Logic */}
                <View style={styles.modalActions}>
                  {/* Case 1: Ticket is RESOLVED or CLOSED */}
                  {(selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED') ? (
                    <View style={[styles.submitButton, { backgroundColor: '#4CAF50', flex: 1 }]}>
                      <Text style={styles.submitButtonText}>
                        {selectedTicket.status === 'RESOLVED' ? t('tickets.resolved', { defaultValue: '✓ Resolved' }) : t('tickets.closed', { defaultValue: '✓ Closed' })}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Case 2: Ticket is ACKNOWLEDGED - only show Resolve button */}
                      {selectedTicket.status === 'ACKNOWLEDGED' ? (
                        <TouchableOpacity
                          style={[styles.submitButton, { flex: 1 }]}
                          onPress={() => handleResolve(selectedTicket.id)}
                          disabled={resolvingTicketId === selectedTicket.id}
                        >
                          {resolvingTicketId === selectedTicket.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.submitButtonText}>{t('tickets.resolve', { defaultValue: 'Resolve' })}</Text>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <>
                          {/* Case 3: Ticket is OPEN/IN_PROGRESS - show both buttons */}
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
                              <Text style={styles.submitButtonText}>{t('tickets.acknowledge', { defaultValue: 'Acknowledge' })}</Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.submitButton,
                              (resolvingTicketId === selectedTicket.id) && styles.submitButtonDisabled
                            ]}
                            onPress={() => handleResolve(selectedTicket.id)}
                            disabled={resolvingTicketId === selectedTicket.id}
                          >
                            {resolvingTicketId === selectedTicket.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.submitButtonText}>{t('tickets.resolve', { defaultValue: 'Resolve' })}</Text>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
  },
  syncIndicator: {
    width: 36,
    height: 36,
  },
  createButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFA500',
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  pendingBannerText: {
    fontSize: 12,
    color: '#FF9800',
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#999',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
  },
  clearIcon: {
    fontSize: 16,
    color: '#999',
    padding: 8,
  },
  statsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 70,
  },
  activeStatCard: {
    backgroundColor: '#FFA50010',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  totalContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  totalText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 20,
  },
  animationWrapper: {
    marginHorizontal: 8,
    marginBottom: 6,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  ticketNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  priorityIcon: {
    fontSize: 9,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '600',
  },
  statusBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTextSmall: {
    fontSize: 9,
    fontWeight: '600',
  },
  ticketTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  ticketDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    marginBottom: 10,
  },
  ticketFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerIcon: {
    fontSize: 10,
  },
  footerText: {
    fontSize: 10,
    color: '#999',
  },
  commentsCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 2,
  },
  commentsIcon: {
    fontSize: 11,
  },
  commentsText: {
    fontSize: 10,
    color: '#FFA500',
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
  ticketDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ticketDetailNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextLarge: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketDetailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  ticketDetailDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 24,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  priorityBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  priorityIconLarge: {
    fontSize: 12,
  },
  priorityTextLarge: {
    fontSize: 12,
    fontWeight: '600',
  },
  mapButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  // Comments Section Styles
  commentsSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  expandIcon: {
    fontSize: 12,
    color: '#999',
  },
  commentsList: {
    marginBottom: 16,
  },
  commentItem: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentUser: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFA500',
  },
  commentTime: {
    fontSize: 10,
    color: '#999',
  },
  commentText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    marginBottom: 4,
  },
  statusChangeText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  noCommentsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  addCommentSection: {
    marginTop: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#333',
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 12,
  },
  submitCommentButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  submitCommentText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 12,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFA500',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default TicketsScreen;
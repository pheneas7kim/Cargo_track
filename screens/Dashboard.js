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
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

// API Base URL
const API_BASE = 'https://demo2.bsl.co.ke';

// Helper: Format date to relative time (e.g., "2 hours ago")
const formatRelativeTime = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

// Helper: Map tracking status to color and display text
const getTicketStatusInfo = (status) => {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return { text: 'Open', color: '#FF6B6B' };
    case 'IN_PROGRESS':
      return { text: 'In Progress', color: '#FFA500' };
    case 'RESOLVED':
      return { text: 'Resolved', color: '#4CAF50' };
    case 'CLOSED':
      return { text: 'Closed', color: '#2196F3' };
    default:
      return { text: status || 'Unknown', color: '#999' };
  }
};



const getStatusInfo = (status) => {
  switch (status) {
    case 'IN_TRANSIT':
      return { text: 'In Transit', color: '#FFA500', icon: '🚚', progress: 50 };
    case 'DELIVERED':
      return { text: 'Delivered', color: '#4CAF50', icon: '✅', progress: 100 };
    case 'PENDING':
      return { text: 'Pending', color: '#FF6B6B', icon: '⏳', progress: 0 };
    default:
      return { text: status || 'Unknown', color: '#999', icon: '📦', progress: 0 };
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
const acknowledgeTicket = async (ticketId) => {
  const token = await getAuthToken();

  const response = await fetch(
    `${API_BASE}/api/v1/tickets/${ticketId}/acknowledge`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) throw new Error('Failed to acknowledge ticket');
  return await response.json();
};

const resolveTicket = async (ticketId, payload = {}) => {
  const token = await getAuthToken();

  const response = await fetch(
    `${API_BASE}/api/v1/tickets/${ticketId}/resolve`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) throw new Error('Failed to resolve ticket');
  return await response.json();
};
function HomeScreen() {
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

  // Commands list
  const commands = [
    { id: 'CMD-001', name: 'Check Status', description: 'Get real-time status of your shipment' },
    { id: 'CMD-002', name: 'Share Location', description: 'Share current location with support' },
    { id: 'CMD-003', name: 'Request Support', description: 'Request immediate assistance' },
    { id: 'CMD-004', name: 'Update Delivery', description: 'Update delivery preferences' },
    { id: 'CMD-005', name: 'Report Issue', description: 'Report a problem with your shipment' }
  ];

  // ---------------------- API Calls with Bearer Token ----------------------
  const fetchShipments = async () => {
    try {
      setLoadingShipments(true);
      const token = await getAuthToken();
      if (!token) {
        Snackbar.show({
          text: 'Please log in again',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        return;
      }

      // Fetch both telemetry and T1 declarations in parallel
      const [telemetryResponse, t1Response] = await Promise.all([
        fetch(`${API_BASE}/api/v1/telemetry/latest-t1s`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${API_BASE}/api/v1/customs/t1`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
      ]);

      if (telemetryResponse.status === 401 || t1Response.status === 401) {
        Snackbar.show({
          text: 'Session expired. Please log in again.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        return;
      }

      if (!telemetryResponse.ok) throw new Error('Failed to fetch telemetry');
      if (!t1Response.ok) throw new Error('Failed to fetch T1 declarations');

      const telemetryData = await telemetryResponse.json();
      const t1Data = await t1Response.json();

      // Create a map of t1Number to T1 declaration for easy lookup
      const t1Map = {};
      t1Data.forEach(t1 => {
        t1Map[t1.t1Number] = t1;
      });

      // Transform telemetry data into shipment format
      const transformed = telemetryData.map(item => {
        const t1 = t1Map[item.t1Number] || {};
        const status = t1.trackingStatus || 'IN_TRANSIT';
        const statusInfo = getStatusInfo(status);

        return {
          id: item.id?.toString() || `device-${item.deviceSn}`,
          trackingNumber: item.t1Number,
          deviceSn: item.deviceSn,
          deviceName: item.deviceName,
          origin: t1.origin || 'Unknown',
          destination: t1.destination || 'Unknown',
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
    } catch (error) {
      // console.error('Error fetching shipments:', error);
      // Snackbar.show({
      //   text: 'Failed to load devices. Pull to refresh.',
      //   duration: 3000,
      //   backgroundColor: '#FF6B6B',
      // });
    } finally {
      setLoadingShipments(false);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoadingTickets(true);

      // 1. Retrieve the Auth Token and the flat 'id' key
      const token = await getAuthToken();
      const storedId = await AsyncStorage.getItem('id');

      // 2. Fallback logic
      // Since you saved it as 'id' in Login.tsx, we use storedId directly.
      // If it's missing, we default to 1 (but log a warning).
      const userId = storedId ? parseInt(storedId, 10) : 1;

      if (!token) {
        console.warn('No token found, skipping ticket fetch');
        return;
      }

      // 3. Fetch using the dynamic ID
      const response = await fetch(
        `${API_BASE}/api/v1/tickets/assignee/${userId}?page=0&size=100&sort=createdAt,desc`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 401) return;
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();

      // 4. Transform data for UI
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
        };
      });

      setTickets(transformed);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoadingTickets(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE}/api/v1/notifications?page=0&size=100&alarm=true&sort=createdAt,desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const data = await response.json();

      const notificationsArray = data.content || data;
      const transformed = (Array.isArray(notificationsArray) ? notificationsArray : []).map(alert => ({
        id: alert.id.toString(),
        title: alert.title || 'Alert',
        message: alert.message || alert.description,
        severity: alert.severity || (alert.type === 'ALARM' ? 'Warning' : 'Info'),
        timestamp: alert.createdAt,
      }));
      setAlerts(transformed);
    } catch (error) {
      // console.error('Error fetching alerts:', error);
      // Snackbar.show({ text: 'Failed to load alerts. Pull to refresh.', duration: 3000, backgroundColor: '#FF6B6B' });
    } finally {
      setLoadingAlerts(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE}/api/v1/notifications?page=0&size=100&sort=createdAt,desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();

      const notificationsArray = data.content || data;
      const transformed = (Array.isArray(notificationsArray) ? notificationsArray : []).map(notif => ({
        id: notif.id.toString(),
        title: notif.title || 'Notification',
        message: notif.message || notif.description,
        time: formatRelativeTime(notif.createdAt),
        read: false,
        type: notif.type?.toLowerCase() === 'alarm' ? 'alert' : 'info',
      }));
      setNotifications(transformed);
    } catch (error) {
      // console.error('Error fetching notifications:', error);
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadAllData = async () => {
    await Promise.all([
      fetchShipments(),
      fetchTickets(),
      fetchAlerts(),
      fetchNotifications(),
    ]);
  };

  // ---------------------- Lifecycle ----------------------
  useEffect(() => {
    loadAllData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const backAction = () => false;
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
    // Snackbar.show({ text: 'Dashboard refreshed', duration: 2000, backgroundColor: '#4CAF50' });
  };

  // ---------------------- Handlers ----------------------
  const getCurrentTime = () => {
    const date = new Date();
    const hours = date.getHours();
    if (hours < 12) return 'Good Morning';
    if (hours < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleTrackShipment = () => {
    if (!trackingNumber.trim()) {
      Snackbar.show({ text: 'Please enter a tracking number', duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    const found = shipments.find(s => s.trackingNumber === trackingNumber);
    if (found) {
      setTrackedShipment(found);
      setIsTrackingModalVisible(true);
    } else {
      Snackbar.show({ text: 'Shipment not found', duration: 3000, backgroundColor: '#FF6B6B' });
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
    // Snackbar.show({ text: `Command "${command.name}" sent successfully`, duration: 3000, backgroundColor: '#4CAF50' });
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
    try {
      await acknowledgeTicket(ticketId);
      Snackbar.show({
        text: 'Ticket acknowledged',
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
      fetchTickets();
    } catch (e) {
      Snackbar.show({
        text: 'Failed to acknowledge ticket',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    }
  };

  const handleResolve = async (ticketId) => {
    try {
      await resolveTicket(ticketId, {
        content: 'Resolved from mobile app',
        evidenceUrls: [], // we’ll wire images here next
      });

      Snackbar.show({
        text: 'Ticket resolved',
        duration: 2000,
        backgroundColor: '#4CAF50',
      });

      fetchTickets();
    } catch (e) {
      Snackbar.show({
        text: 'Failed to resolve ticket',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    }
  };

  const handleSubmit = async () => {
    if (!phoneNumber.trim()) {
      Snackbar.show({ text: 'Phone number is required', duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!amount.trim()) {
      Snackbar.show({ text: 'Amount is required', duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsModalVisible(false);
      Snackbar.show({ text: 'Top up successful!', duration: 3000, backgroundColor: '#4CAF50' });
      setPhoneNumber('');
      setAmount('');
    }, 1500);
  };

  const handleSubmitWithdraw = async () => {
    if (!phoneNumber2.trim()) {
      Snackbar.show({ text: 'Phone number is required', duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    if (!amount2.trim()) {
      Snackbar.show({ text: 'Amount is required', duration: 3000, backgroundColor: '#FF6B6B' });
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsModalVisibleWithdraw(false);
      Snackbar.show({ text: 'Withdrawal initiated successfully!', duration: 3000, backgroundColor: '#4CAF50' });
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
              {getStatusInfo(item.status).icon} {item.status}
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
        <Text style={styles.progressText}>{item.progress}% Complete</Text>
      </View>

      <View style={styles.shipmentDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📍 Location</Text>
          <Text style={styles.detailValue}>{item.location || 'Unknown'}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📅 Last Update</Text>
          <Text style={styles.detailValue}>{formatRelativeTime(item.lastUpdate)}</Text>
        </View>
      </View>

      <View style={styles.shipmentDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>📱 Device</Text>
          <Text style={styles.detailValue}>{item.deviceName || item.deviceSn}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>💨 Speed</Text>
          <Text style={styles.detailValue}>{item.speedKmh} km/h</Text>
        </View>
      </View>

      <View style={styles.shipmentActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleViewOnMap(item)}>
          <Text style={styles.actionBtnText}>Track on Map</Text>
        </TouchableOpacity>
      </View>
    </Animatable.View>
  );

  const renderTicket = ({ item, index }) => {
    const getTicketStatusInfo = (status) => {
      switch (status?.toUpperCase()) {
        case 'OPEN':
          return { text: 'Open', color: '#FF6B6B' };

        case 'DISPATCHED':
          return { text: 'Dispatched', color: '#9C27B0' };

        case 'ACKNOWLEDGED':
          return { text: 'Acknowledged', color: '#FFA500' };

        case 'IN_PROGRESS':
          return { text: 'In Progress', color: '#FFC107' };

        case 'RESOLVED':
          return { text: 'Resolved', color: '#4CAF50' };

        case 'CLOSED':
          return { text: 'Closed', color: '#2196F3' };

        default:
          return { text: status || 'Unknown', color: '#999' };
      }
    };
    const statusInfo = getTicketStatusInfo(item.status);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          setSelectedTicket(item);
          setModalVisible(true);
        }}
      >
        <Animatable.View animation="fadeInLeft" delay={index * 100} style={styles.ticketCard}>
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketId}>{item.ticketNumber}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) + '20' }]}>
              <Text style={[styles.priorityText, { color: getPriorityColor(item.priority) }]}>
                {item.priority}
              </Text>
            </View>
          </View>

          <Text style={styles.ticketSubject}>{item.subject}</Text>

          <Text style={styles.ticketDescription} numberOfLines={3}>
            {cleanTicketDescription(item.description)}
          </Text>

          <View style={styles.ticketFooter}>
            <Text style={styles.ticketDate}>{item.createdAt}</Text>

            <View
              style={[
                styles.statusBadgeSmall,
                { backgroundColor: statusInfo.color + '20' }
              ]}
            >
              <Text
                style={[
                  styles.statusTextSmall,
                  { color: statusInfo.color }
                ]}
              >
                {statusInfo.text}
              </Text>
            </View>
          </View>
        </Animatable.View>
      </TouchableOpacity>
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
      <Text style={styles.alertTime}>{item.timestamp ? formatRelativeTime(item.timestamp) : item.timestamp}</Text>
    </Animatable.View>
  );

  // HeaderComponent (unchanged except for the tracking card label)
  const HeaderComponent = () => (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getCurrentTime()}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={handleNotificationsScreen}>
            <Image source={require('../assets/bell.png')} style={styles.headerIcon} />
            {notifications.filter(n => !n.read).length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notifications.filter(n => !n.read).length}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/*
          <TouchableOpacity style={styles.iconButton} onPress={handleCommandsScreen}>
            <Image source={require('../assets/command.png')} style={styles.headerIcon} />
          </TouchableOpacity>
          */}
        </View>
      </View>

      <View style={styles.trackingCard}>
      {/*
        <Text style={styles.trackingTitle}>Track Your Device</Text>
        <View style={styles.trackingSearch}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter tracking number"
            placeholderTextColor="#9AA9B3"
            value={trackingNumber}
            onChangeText={setTrackingNumber}
          />
          <TouchableOpacity style={styles.trackButton} onPress={handleTrackShipment}>
            <Text style={styles.trackButtonText}>Track</Text>
          </TouchableOpacity>
          */}
      </View>

      <View style={styles.quickActionsGrid}>
        <View style={styles.actionsContainer}>
          <View style={styles.actionRow}>

          <TouchableOpacity style={styles.actionCard} onPress={handleTicketsScreen}>
                       <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                         <Image source={require('../assets/phone.png')} style={styles.actionIcon} />
                      </View>
                      <Text style={styles.actionLabel}>Tickets</Text>
                    </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleRandomStopScreen}>
                          <View style={[styles.actionIconBg, { backgroundColor: '#2196F320' }]}>
                            <Image source={require('../assets/randomstop.png')} style={styles.actionIcon} />
                          </View>
                          <Text style={styles.actionLabel}>Random Stop</Text>
                        </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleAlarmsNotigicationScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#FF6B6B20' }]}>
                <Image source={require('../assets/alarm.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>Alarms</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleAlertsNotigicationScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#4CAF5020' }]}>
                <Image source={require('../assets/bell.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>Alerts</Text>
            </TouchableOpacity>
          </View>


         </View>

            <View style={styles.actionRow}>
            {/*
            <TouchableOpacity style={styles.actionCard} onPress={handleDevicesScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#9C27B020' }]}>
                <Image source={require('../assets/trk.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>Devices</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleGeofencesScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#FF980020' }]}>
                <Image source={require('../assets/geo.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>Geofences</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleHotspotsScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#E91E6320' }]}>
                <Image source={require('../assets/location.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>Hotspots</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleDeviceMapScreen}>
                          <View style={[styles.actionIconBg, { backgroundColor: '#FFA50020' }]}>
                            <Image source={require('../assets/monitor.png')} style={styles.actionIcon} />
                          </View>
                          <Text style={styles.actionLabel}>Shipments</Text>
                        </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={handleStationsScreen}>
              <View style={[styles.actionIconBg, { backgroundColor: '#00BCD420' }]}>
                <Image source={require('../assets/station.png')} style={styles.actionIcon} />
              </View>
              <Text style={styles.actionLabel}>Stations</Text>
            </TouchableOpacity>
          </View>
          */}
        </View>
      </View>

      <View style={styles.alarmCard}>
        <View style={styles.alarmInfo}>
          <Image source={require('../assets/alarm.png')} style={styles.alarmIcon} />
          <View>
            <Text style={styles.alarmTitle}>Delivery Alarms</Text>
            <Text style={styles.alarmSubtitle}>Get notified about your shipments</Text>
          </View>
        </View>
        <Switch
          value={alarmEnabled}
          onValueChange={setAlarmEnabled}
          trackColor={{ false: '#767577', true: '#FFA500' }}
          thumbColor={alarmEnabled ? '#FFFFFF' : '#f4f3f4'}
        />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'shipments' && styles.activeTab]}
          onPress={() => setActiveTab('shipments')}
        >
          <Text style={[styles.tabText, activeTab === 'shipments' && styles.activeTabText]}>
            Shipments
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tickets' && styles.activeTab]}
          onPress={() => setActiveTab('tickets')}
        >
          <Text style={[styles.tabText, activeTab === 'tickets' && styles.activeTabText]}>
            Tickets
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'alerts' && styles.activeTab]}
          onPress={() => setActiveTab('alerts')}
        >
          <Text style={[styles.tabText, activeTab === 'alerts' && styles.activeTabText]}>
            Alerts
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderContent = () => {
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
              <Text style={styles.loaderText}>Loading {activeTab}...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No {activeTab} found</Text>
            </View>
          )
        }
      />
    );
  };

  // ---------------------- Render ----------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {renderContent()}

      {/* Modals (unchanged) */}
      <Modal
        visible={isTrackingModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTrackingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Shipment Details</Text>
              <TouchableOpacity onPress={() => setIsTrackingModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {trackedShipment && (
              <ScrollView style={styles.modalBody}>
                <Text style={styles.detailTitle}>Tracking Number</Text>
                <Text style={styles.detailValueLarge}>{trackedShipment.trackingNumber}</Text>

                <Text style={styles.detailTitle}>Status</Text>
                <Text style={styles.detailValue}>{trackedShipment.status}</Text>

                <Text style={styles.detailTitle}>Current Location</Text>
                <Text style={styles.detailValue}>{trackedShipment.location || 'Unknown'}</Text>

                <Text style={styles.detailTitle}>Origin</Text>
                <Text style={styles.detailValue}>{trackedShipment.origin}</Text>

                <Text style={styles.detailTitle}>Destination</Text>
                <Text style={styles.detailValue}>{trackedShipment.destination}</Text>

                <Text style={styles.detailTitle}>Last Update</Text>
                <Text style={styles.detailValue}>{trackedShipment.lastUpdate}</Text>

                <View style={styles.progressContainer}>
                  <Text style={styles.detailTitle}>Progress</Text>
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
                  <Text style={styles.mapButtonText}>View on Map</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animatable.View>
        </View>
      </Modal>

      <Modal
        visible={commandModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCommandModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Commands</Text>
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

      {activeTab === 'tickets' && (
        <>
          <TouchableOpacity style={styles.fab} onPress={handleCreateTicket}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>

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
                  <Text style={styles.modalTitle}>Ticket Details</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {selectedTicket && modalVisible && (
                  <ScrollView style={styles.modalBody}>
                    <Text style={styles.detailLabel}>Ticket ID</Text>
                    <Text style={styles.detailValue}>{selectedTicket.ticketNumber}</Text>

                    <Text style={styles.detailLabel}>Subject</Text>
                    <Text style={styles.detailValue}>{selectedTicket.subject}</Text>

                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>
                      {cleanTicketDescription(selectedTicket.description)}
                    </Text>

                    <Text style={styles.detailLabel}>Priority</Text>
                    <Text style={[styles.detailValue, { color: getPriorityColor(selectedTicket.priority) }]}>
                      {selectedTicket.priority}
                    </Text>

                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={styles.detailValue}>{selectedTicket.status}</Text>

                    <Text style={styles.detailLabel}>Created At</Text>
                    <Text style={styles.detailValue}>{selectedTicket.createdAt}</Text>
                  </ScrollView>
                )}
              </Animatable.View>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

// Styles (unchanged – same as provided)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  greeting: { fontSize: 18, color: '#1A1A1A', fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { marginLeft: 16, position: 'relative' },
  headerIcon: { width: 24, height: 24 },
  badge: { position: 'absolute', top: -5, right: -8, backgroundColor: '#FFA500', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  trackingCard: { backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 20, padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 1 },
  trackingTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 },
  trackingSearch: { flexDirection: 'row' },
  searchInput: { flex: 1, borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, backgroundColor: '#FAFAFA', marginRight: 12 },
  trackButton: { backgroundColor: '#FFA500', borderRadius: 12, paddingHorizontal: 24, justifyContent: 'center', shadowColor: '#FFA500', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3 },
  trackButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  quickActionsGrid: { marginHorizontal: 20, marginBottom: 20 },
  actionsContainer: { gap: 16 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionCard: { alignItems: 'center', width: (width - 56) / 4 },
  actionIconBg: { width: 46, height: 46, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionIcon: { width: 24, height: 24 },
  actionLabel: { fontSize: 11, color: '#333', fontWeight: '500', textAlign: 'center' },
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
  detailLabel: { fontSize: 12, color: '#666',  marginTop: 10,},
  detailValue: { fontSize: 16, color: '#333',  marginBottom: 5,},
  shipmentActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { fontSize: 13, color: '#FFA500', fontWeight: '500' },
  notificationCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  unreadNotification: { backgroundColor: '#FFF9E6' },
  notificationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notificationIconText: { fontSize: 20 },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  notificationMessage: { fontSize: 12, color: '#666', marginBottom: 4 },
  notificationTime: { fontSize: 10, color: '#999' },
  ticketCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketId: { fontSize: 12, color: '#999', fontWeight: '500' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  priorityText: { fontSize: 10, fontWeight: '600' },
  ticketSubject: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  ticketDescription: { fontSize: 12, color: '#666', marginBottom: 8 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketDate: { fontSize: 10, color: '#999' },
  statusBadgeSmall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusTextSmall: { fontSize: 10, fontWeight: '600' },
  alertCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  alertTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  alertMessage: { fontSize: 12, color: '#666', marginBottom: 8 },
  alertTime: { fontSize: 10, color: '#999' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%',},
  modalHeader: { flexDirection: 'row',  justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, },
  modalTitle: { fontSize: 18, fontWeight: 'bold', },
  closeButtonText: { fontSize: 24, color: '#999' },
  modalBody: { padding: 20 },
  detailTitle: { fontSize: 12, fontWeight: '600', color: '#999', marginTop: 12, marginBottom: 4 },
  detailValueLarge: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  mapButton: { backgroundColor: '#FFA500', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  mapButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  fab: { position: 'absolute', bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFA500', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  fabText: { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },
  commandItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  commandName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  commandDescription: { fontSize: 12, color: '#666' },
  commandList: { paddingBottom: 20 },
  inputContainer: { paddingHorizontal: 20, marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333333', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1A1A1A', backgroundColor: '#FAFAFA' },
  modalActions: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5E5', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#666666' },
  submitButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FFA500', alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#CCCCCC' },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  closeButtonText: { fontSize: 20, color: '#333', },
  loaderContainer: { padding: 40, alignItems: 'center' },
  loaderText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#999' },
});

export default HomeScreen;
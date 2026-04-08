import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';
import Snackbar from 'react-native-snackbar';

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

  // Fetch notifications from API
  const fetchNotifications = async () => {
    try {
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
        return newNotifications;
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
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
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(n => !n.read);
    for (const notification of unreadNotifications) {
      await markAsRead(notification.id);
    }
  };

  // Add local notification (for real-time updates)
  const addLocalNotification = (notification) => {
    setNotifications(prev => [notification, ...prev]);
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
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    addLocalNotification,
    startPolling,
    stopPolling,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
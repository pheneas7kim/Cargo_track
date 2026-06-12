import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

// ========== OFFLINE: Snackbar queue for offline messages ==========
let snackbarQueue = [];
let isShowingQueue = false;

const processQueue = async (setForceUpdate) => {
  if (isShowingQueue || snackbarQueue.length === 0) return;

  isShowingQueue = true;
  const nextSnackbar = snackbarQueue.shift();

  // Show the queued snackbar
  if (nextSnackbar.showFn) {
    nextSnackbar.showFn(nextSnackbar.props);
  }

  // Wait for duration before showing next
  setTimeout(() => {
    isShowingQueue = false;
    if (setForceUpdate) setForceUpdate(Date.now());
    processQueue(setForceUpdate);
  }, nextSnackbar.props?.duration || 3000);
};

const addToQueue = (props, showFn, setForceUpdate) => {
  snackbarQueue.push({ props, showFn });
  processQueue(setForceUpdate);
};
// ========== END OFFLINE SNACKBAR QUEUE ==========

const Snackbar = ({
  message,
  actionText,
  onActionPress,
  duration = 3000, // Default duration in milliseconds
  position = "top", // Default position
  containerStyle,
  messageStyle,
  actionTextStyle,
  backgroundColor,
  textColor,
  actionTextColor,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  // ========== OFFLINE: Track online status ==========
  const [isOnline, setIsOnline] = useState(true);
  const [pendingMessages, setPendingMessages] = useState([]);
  // ========== END OFFLINE STATE ==========

  // ========== OFFLINE: Network monitoring for offline snackbars ==========
  useEffect(() => {
    const initOfflineSnackbar = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Snackbar component');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online && pendingMessages.length > 0) {
            // Show pending offline messages when back online
            Snackbar.show({
              text: `📡 You have ${pendingMessages.length} pending notification(s) from offline period`,
              duration: 4000,
              backgroundColor: '#4CAF50',
            });
            // Clear pending messages after showing
            setPendingMessages([]);
          }
        });

        // Load pending offline messages
        await loadPendingOfflineMessages();

      } catch (error) {
        console.error('❌ Offline snackbar init error:', error);
      }
    };

    initOfflineSnackbar();

    return () => {
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE INIT ==========

  // ========== OFFLINE: Load pending offline messages ==========
  const loadPendingOfflineMessages = async () => {
    try {
      const pendingMessagesData = await OfflineDatabaseService.getUserData('pending_snackbar_messages');
      if (pendingMessagesData && pendingMessagesData.messages && pendingMessagesData.messages.length > 0) {
        setPendingMessages(pendingMessagesData.messages);
        console.log(`📦 Loaded ${pendingMessagesData.messages.length} pending snackbar messages`);
      }
    } catch (error) {
      console.error('Error loading pending messages:', error);
    }
  };
  // ========== END OFFLINE LOAD PENDING ==========

  // ========== OFFLINE: Save pending message ==========
  const savePendingMessage = async (messageText) => {
    try {
      const pendingMessagesData = await OfflineDatabaseService.getUserData('pending_snackbar_messages') || { messages: [] };
      pendingMessagesData.messages.push({
        id: Date.now().toString(),
        message: messageText,
        timestamp: new Date().toISOString(),
        read: false
      });
      // Keep only last 50 messages
      if (pendingMessagesData.messages.length > 50) {
        pendingMessagesData.messages = pendingMessagesData.messages.slice(-50);
      }
      await OfflineDatabaseService.saveUserData('pending_snackbar_messages', pendingMessagesData);
      setPendingMessages(pendingMessagesData.messages);
    } catch (error) {
      console.error('Error saving pending message:', error);
    }
  };
  // ========== END OFFLINE SAVE PENDING ==========

  // ========== OFFLINE: Clear pending messages ==========
  const clearPendingMessages = async () => {
    try {
      await OfflineDatabaseService.saveUserData('pending_snackbar_messages', { messages: [] });
      setPendingMessages([]);
    } catch (error) {
      console.error('Error clearing pending messages:', error);
    }
  };
  // ========== END OFFLINE CLEAR PENDING ==========

  useEffect(() => {
    if (isVisible) {
      const timeout = setTimeout(() => {
        setIsVisible(false);
      }, duration);

      return () => clearTimeout(timeout);
    }
  }, [isVisible, duration]);

  return isVisible ? (
    <View
      style={[
        styles.container,
        position === "top" ? styles.topContainer : styles.bottomContainer,
        containerStyle,
        { backgroundColor: backgroundColor || (isOnline ? "#333333" : "#FF9800") },
      ]}
    >
      <Text style={[styles.messageText, messageStyle, { color: textColor || "#FFFFFF" }]}>
        {message}
        {/* ========== OFFLINE: Add offline indicator ========== */}
        {!isOnline && (
          <Text style={styles.offlineIndicator}> 📴</Text>
        )}
        {/* ========== END OFFLINE INDICATOR ========== */}
      </Text>
      {actionText && (
        <TouchableOpacity onPress={onActionPress}>
          <Text
            style={[
              styles.actionText,
              actionTextStyle,
              { color: actionTextColor || "#FFD700" },
            ]}
          >
            {actionText}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;
};

// ========== OFFLINE: Static methods for queue management ==========
let forceUpdateFn = null;

Snackbar.show = (props) => {
  // Check if we can show immediately or need to queue
  const showImmediately = () => {
    // This is a simplified approach - in real implementation,
    // you'd need to integrate with your app's state management
    if (global.snackbarRef && global.snackbarRef.current) {
      // If we have a ref to a visible snackbar, queue this one
      if (forceUpdateFn) {
        addToQueue(props, Snackbar.show, forceUpdateFn);
      } else {
        // Show directly - this would need proper integration
        console.log('Snackbar:', props.text);
      }
    } else {
      console.log('Snackbar:', props.text);
    }
  };

  showImmediately();
};

Snackbar.setForceUpdate = (fn) => {
  forceUpdateFn = fn;
};
// ========== END OFFLINE STATIC METHODS ==========

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  topContainer: {
    top: 15,
  },
  bottomContainer: {
    bottom: 15,
  },
  messageText: {
    fontSize: 16,
    flex: 1,
  },
  actionText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  // ========== OFFLINE STYLES ==========
  offlineIndicator: {
    fontSize: 14,
    marginLeft: 4,
  },
  // ========== END OFFLINE STYLES ==========
});

export default Snackbar;
import NetInfo from '@react-native-community/netinfo';
import { DeviceEventEmitter } from 'react-native';

class NetworkMonitorService {
  constructor() {
    this.isConnected = true;
    this.connectionType = 'unknown';
    this.isInitialized = false;
    this.listeners = [];
  }

  init() {
    if (this.isInitialized) return;

    // Subscribe to network changes
    this.unsubscribe = NetInfo.addEventListener(state => {
      const wasConnected = this.isConnected;
      this.isConnected = state.isConnected;
      this.connectionType = state.type;

      if (wasConnected !== this.isConnected) {
        this.emit('connectionChange', this.isConnected);
        console.log(`🌐 Network connection changed: ${this.isConnected ? 'ONLINE' : 'OFFLINE'}`);

        if (this.isConnected) {
          this.emit('online');
        } else {
          this.emit('offline');
        }
      }
    });

    this.isInitialized = true;
  }

  // Event emitter methods
  on(eventName, callback) {
    this.listeners.push({ eventName, callback });
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    this.listeners = this.listeners.filter(
      listener => !(listener.eventName === eventName && listener.callback === callback)
    );
  }

  emit(eventName, data) {
    this.listeners.forEach(listener => {
      if (listener.eventName === eventName) {
        listener.callback(data);
      }
    });
  }

  removeAllListeners() {
    this.listeners = [];
  }

  // Check if currently online
  async isOnline() {
    const state = await NetInfo.fetch();
    this.isConnected = state.isConnected;
    return this.isConnected;
  }

  // Get connection type
  getConnectionType() {
    return this.connectionType;
  }

  // Cleanup
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.removeAllListeners();
  }
}

export default new NetworkMonitorService();
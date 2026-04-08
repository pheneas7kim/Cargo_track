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
  Platform,
  Alert
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';
import serverUrl from '../config';

const { width } = Dimensions.get('window');

const CommandsScreen = () => {
  const navigation = useNavigation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [commandModalVisible, setCommandModalVisible] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [commandValues, setCommandValues] = useState({});
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Command definitions
  const commands = [
    { id: 'lowPower', name: 'Low Power Mode', icon: 'battery-charging-full', color: '#f59e0b', needsInput: true },
    { id: 'setIPPrimary', name: 'Set Primary IP', icon: 'router', color: '#3b82f6', needsInput: true },
    { id: 'setIPSecondary', name: 'Set Secondary IP', icon: 'router', color: '#8b5cf6', needsInput: true },
    { id: 'resetHistorical', name: 'Reset Historical Position', icon: 'history', color: '#ef4444', needsInput: true },
    { id: 'disableSleep', name: 'Disable Sleep Mode', icon: 'nightlight', color: '#f59e0b', needsInput: false },
    { id: 'setTimezone', name: 'Set Timezone (GMT+3)', icon: 'access-time', color: '#14b8a6', needsInput: false },
    { id: 'setOperationMode', name: 'Set Operation Mode', icon: 'settings', color: '#ec4899', needsInput: true },
    { id: 'exitDeepSleep', name: 'Exit Deep Sleep', icon: 'wb-sunny', color: '#10b981', needsInput: false },
    { id: 'enterSleepMode', name: 'Enter Sleep Mode', icon: 'bedtime', color: '#6366f1', needsInput: true },
    { id: 'setAuthorizedNumbers', name: 'Set Authorized Numbers', icon: 'contacts', color: '#8b5cf6', needsInput: true },
    { id: 'changePassword', name: 'Change Unlock Password', icon: 'lock', color: '#f97316', needsInput: true },
    { id: 'unlockDevice', name: 'Unlock Device', icon: 'lock-open', color: '#10b981', needsInput: false },
    { id: 'factoryReset', name: 'Factory Reset', icon: 'settings-backup-restore', color: '#dc2626', needsInput: false },
    { id: 'restartDevice', name: 'Restart Device', icon: 'restart-alt', color: '#000000', needsInput: false },
    { id: 'setSerialNumber', name: 'Set Serial Number', icon: 'numbers', color: '#000000', needsInput: true },
    { id: 'queryDeviceInfo', name: 'Query Device Info', icon: 'info', color: '#3b82f6', needsInput: false },
    { id: 'queryDeviceStatus', name: 'Query Device Status', icon: 'dashboard', color: '#3b82f6', needsInput: false },
  ];

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
      fetchDevices();
      
      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const fetchDevices = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        console.error('No token found');
        return;
      }

      const response = await axios.get(
        `${serverUrl}/devices/all`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data && Array.isArray(response.data)) {
        setDevices(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      Snackbar.show({
        text: 'Failed to load devices',
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
    fetchDevices(true);
  };

  const getFilteredDevices = () => {
    let filtered = [...devices];
    
    if (filter === 'online') {
      filtered = filtered.filter(d => d.isOnline === true);
    } else if (filter === 'offline') {
      filtered = filtered.filter(d => d.isOnline === false);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.name?.toLowerCase().includes(query) ||
        d.serialNo?.toLowerCase().includes(query) ||
        d.imei?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const getStats = () => {
    return {
      total: devices.length,
      online: devices.filter(d => d.isOnline === true).length,
      offline: devices.filter(d => d.isOnline === false).length,
    };
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleDeviceSelection = (deviceId) => {
    if (selectedDevices.includes(deviceId)) {
      setSelectedDevices(selectedDevices.filter(id => id !== deviceId));
    } else {
      setSelectedDevices([...selectedDevices, deviceId]);
    }
  };

  const sendCommand = async (deviceSn, command, params = null) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        console.error('No token found');
        return false;
      }

      let finalCommand = command;
      if (params) {
        finalCommand = command.replace(/{}/g, params);
      }

      const response = await axios.post(
        `${serverUrl}/devices/command/set`,
        {
          deviceSn: deviceSn,
          command: finalCommand
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data && response.data.resultCode === 0) {
        Snackbar.show({
          text: 'Command sent successfully',
          duration: 3000,
          backgroundColor: '#4CAF50',
        });
        return true;
      } else {
        Snackbar.show({
          text: response.data.message || 'Failed to send command',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        return false;
      }
    } catch (error) {
      // console.error('Failed to send command:', error);
      Snackbar.show({
        text: 'Failed to send command',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return false;
    }
  };

  const queryDeviceInfo = async (deviceSn) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.post(
        `${serverUrl}/devices/command/query`,
        {
          deviceSn: deviceSn,
          command: "*269#C"
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data && response.data.resultCode === 0) {
        Alert.alert(
          'Device Information',
          `Device: ${deviceSn}\n\nResponse: ${response.data.response || 'No response data'}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Query Failed', response.data.message || 'Failed to query device info');
      }
    } catch (error) {
      console.error('Failed to query device info:', error);
      Alert.alert('Error', 'Failed to query device information');
    }
  };

  const queryDeviceStatus = async (deviceSn) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.post(
        `${serverUrl}/devices/command/query`,
        {
          deviceSn: deviceSn,
          command: "*269#R"
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data && response.data.resultCode === 0) {
        Alert.alert(
          'Device Status',
          `Device: ${deviceSn}\n\nStatus: ${response.data.response || 'No status data'}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Query Failed', response.data.message || 'Failed to query device status');
      }
    } catch (error) {
      console.error('Failed to query device status:', error);
      Alert.alert('Error', 'Failed to query device status');
    }
  };

  const handleCommand = async (command, device) => {
    setSelectedDevice(device);
    setSelectedCommand(command);
    
    if (command.needsInput) {
      setCommandModalVisible(true);
    } else {
      let success = false;
      
      switch(command.id) {
        case 'disableSleep':
          success = await sendCommand(device.serialNo, "*269#9,M0");
          break;
        case 'setTimezone':
          success = await sendCommand(device.serialNo, "*269#I,E3,");
          break;
        case 'exitDeepSleep':
          success = await sendCommand(device.serialNo, "*269#9,M7,0");
          break;
        case 'unlockDevice':
          success = await sendCommand(device.serialNo, "*269#8,888888");
          break;
        case 'factoryReset':
          success = await sendCommand(device.serialNo, "*269#F");
          break;
        case 'restartDevice':
          success = await sendCommand(device.serialNo, "*269#B");
          break;
        case 'queryDeviceInfo':
          await queryDeviceInfo(device.serialNo);
          break;
        case 'queryDeviceStatus':
          await queryDeviceStatus(device.serialNo);
          break;
        default:
          break;
      }
    }
  };

  const handleCommandWithInput = async () => {
    let command = '';
    const deviceSn = selectedDevice.serialNo;
    
    switch(selectedCommand.id) {
      case 'lowPower':
        const batteryLevel = commandValues.batteryLevel || '10';
        const reportDuration = commandValues.reportDuration || '0.1';
        command = `*269#9,M7,${batteryLevel},${reportDuration}`;
        break;
      case 'setIPPrimary':
        const ip = commandValues.ipPrimary;
        const port = commandValues.portPrimary;
        if (!ip || !port) {
          Alert.alert('Error', 'Please enter IP and Port');
          return;
        }
        command = `*269#1,${ip},${port},1`;
        break;
      case 'setIPSecondary':
        const ip2 = commandValues.ipSecondary;
        const port2 = commandValues.portSecondary;
        if (!ip2 || !port2) {
          Alert.alert('Error', 'Please enter IP and Port');
          return;
        }
        command = `*269#I2,${ip2},${port2},1`;
        break;
      case 'resetHistorical':
        const resetSerial = commandValues.resetSerial;
        if (!resetSerial || resetSerial.length !== 8) {
          Alert.alert('Error', 'Please enter 8-digit serial number');
          return;
        }
        command = `*269#2,${resetSerial}`;
        break;
      case 'setOperationMode':
        const lockInterval = commandValues.lockInterval || '5';
        const unlockInterval = commandValues.unlockInterval || '300';
        command = `*269#7,${lockInterval},${unlockInterval},`;
        break;
      case 'enterSleepMode':
        const wakeTime = commandValues.wakeTime || '30';
        const sleepTime = commandValues.sleepTime || '300';
        command = `*269#9,M2,${wakeTime},${sleepTime},`;
        break;
      case 'setAuthorizedNumbers':
        const numbers = [];
        for (let i = 1; i <= 4; i++) {
          if (commandValues[`authNum${i}`]) {
            numbers.push(commandValues[`authNum${i}`]);
          }
        }
        if (numbers.length === 0) {
          Alert.alert('Error', 'At least one authorized number is required');
          return;
        }
        command = `*269#5,${numbers.join(',')},`;
        break;
      case 'changePassword':
        const oldPassword = commandValues.oldPassword || '888888';
        const newPassword = commandValues.newPassword;
        if (!newPassword || newPassword.length !== 6) {
          Alert.alert('Error', 'New password must be 6 digits');
          return;
        }
        command = `*269#4,${oldPassword},${newPassword},`;
        break;
      case 'setSerialNumber':
        const newSerial = commandValues.newSerial;
        if (!newSerial || newSerial.length !== 8) {
          Alert.alert('Error', 'Serial number must be 8 digits');
          return;
        }
        command = `*269#2,${newSerial}`;
        break;
      default:
        break;
    }
    
    if (command) {
      const success = await sendCommand(deviceSn, command);
      if (success) {
        setCommandModalVisible(false);
        setCommandValues({});
      }
    }
  };

  const sendBulkCommand = async () => {
    if (selectedDevices.length === 0) {
      Alert.alert('No Devices Selected', 'Please select at least one device');
      return;
    }
    
    Alert.alert(
      'Bulk Command',
      `Send restart command to ${selectedDevices.length} device(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            let successCount = 0;
            let failCount = 0;
            
            for (const deviceId of selectedDevices) {
              const device = devices.find(d => d.deviceId === deviceId);
              if (device) {
                const success = await sendCommand(device.serialNo, "*269#B");
                if (success) successCount++;
                else failCount++;
              }
            }
            
            Alert.alert(
              'Bulk Command Complete',
              `Success: ${successCount}\nFailed: ${failCount}`,
              [{ text: 'OK' }]
            );
            setBulkMode(false);
            setSelectedDevices([]);
          }
        }
      ]
    );
  };

  const renderCommandInputModal = () => {
    if (!selectedCommand) return null;
    
    return (
      <Modal
        visible={commandModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCommandModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.commandModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCommand.name}</Text>
              <TouchableOpacity onPress={() => setCommandModalVisible(false)} style={styles.closeButton}>
                <Icon name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.commandModalBody}>
              <View style={styles.deviceInfoSection}>
                <Icon name="devices" size={20} color="#FFA500" />
                <Text style={styles.deviceInfoText}>Device: {selectedDevice?.name || selectedDevice?.serialNo}</Text>
              </View>
              
              {selectedCommand.id === 'lowPower' && (
                <>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Battery Level (%)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 10"
                      keyboardType="numeric"
                      value={commandValues.batteryLevel}
                      onChangeText={(text) => setCommandValues({...commandValues, batteryLevel: text})}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Report Duration (hours)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 0.1 (6 minutes)"
                      keyboardType="numeric"
                      value={commandValues.reportDuration}
                      onChangeText={(text) => setCommandValues({...commandValues, reportDuration: text})}
                    />
                    <Text style={styles.inputHint}>0.1 hours = 6 minutes</Text>
                  </View>
                </>
              )}
              
              {(selectedCommand.id === 'setIPPrimary' || selectedCommand.id === 'setIPSecondary') && (
                <>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>IP/Domain</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., bsl.co.ke or 192.168.1.100"
                      value={selectedCommand.id === 'setIPPrimary' ? commandValues.ipPrimary : commandValues.ipSecondary}
                      onChangeText={(text) => setCommandValues({
                        ...commandValues,
                        [selectedCommand.id === 'setIPPrimary' ? 'ipPrimary' : 'ipSecondary']: text
                      })}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Port</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 8080"
                      keyboardType="numeric"
                      value={selectedCommand.id === 'setIPPrimary' ? commandValues.portPrimary : commandValues.portSecondary}
                      onChangeText={(text) => setCommandValues({
                        ...commandValues,
                        [selectedCommand.id === 'setIPPrimary' ? 'portPrimary' : 'portSecondary']: text
                      })}
                    />
                  </View>
                </>
              )}
              
              {selectedCommand.id === 'resetHistorical' && (
                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Device Serial Number to Reset</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 8-digit serial number"
                    maxLength={8}
                    keyboardType="numeric"
                    value={commandValues.resetSerial}
                    onChangeText={(text) => setCommandValues({...commandValues, resetSerial: text})}
                  />
                  <Text style={styles.inputHint}>Enter the device serial number to reset historical position</Text>
                </View>
              )}
              
              {selectedCommand.id === 'setOperationMode' && (
                <>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Report Interval when Locked (seconds)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 5"
                      keyboardType="numeric"
                      value={commandValues.lockInterval}
                      onChangeText={(text) => setCommandValues({...commandValues, lockInterval: text})}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Report Interval when Unlocked (seconds)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 300"
                      keyboardType="numeric"
                      value={commandValues.unlockInterval}
                      onChangeText={(text) => setCommandValues({...commandValues, unlockInterval: text})}
                    />
                  </View>
                </>
              )}
              
              {selectedCommand.id === 'enterSleepMode' && (
                <>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Wake Up Working Time (seconds)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 30"
                      keyboardType="numeric"
                      value={commandValues.wakeTime}
                      onChangeText={(text) => setCommandValues({...commandValues, wakeTime: text})}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Sleep Time (seconds)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 300"
                      keyboardType="numeric"
                      value={commandValues.sleepTime}
                      onChangeText={(text) => setCommandValues({...commandValues, sleepTime: text})}
                    />
                  </View>
                </>
              )}
              
              {selectedCommand.id === 'setAuthorizedNumbers' && (
                <>
                  {[1, 2, 3, 4].map(i => (
                    <View key={i} style={styles.inputField}>
                      <Text style={styles.inputLabel}>Authorized Number {i} (optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={`e.g., 716826814 (without leading 0)`}
                        keyboardType="phone-pad"
                        value={commandValues[`authNum${i}`]}
                        onChangeText={(text) => setCommandValues({...commandValues, [`authNum${i}`]: text})}
                      />
                    </View>
                  ))}
                  <Text style={styles.inputHint}>Do not include leading zero. At least one number is required</Text>
                </>
              )}
              
              {selectedCommand.id === 'changePassword' && (
                <>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Old Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter old password"
                      secureTextEntry
                      value={commandValues.oldPassword}
                      onChangeText={(text) => setCommandValues({...commandValues, oldPassword: text})}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>New Password (6 digits)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter new password"
                      secureTextEntry
                      maxLength={6}
                      keyboardType="numeric"
                      value={commandValues.newPassword}
                      onChangeText={(text) => setCommandValues({...commandValues, newPassword: text})}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Confirm New Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm new password"
                      secureTextEntry
                      maxLength={6}
                      keyboardType="numeric"
                      value={commandValues.confirmPassword}
                      onChangeText={(text) => setCommandValues({...commandValues, confirmPassword: text})}
                    />
                  </View>
                  {commandValues.newPassword && commandValues.confirmPassword && commandValues.newPassword !== commandValues.confirmPassword && (
                    <Text style={styles.errorText}>Passwords do not match</Text>
                  )}
                </>
              )}
              
              {selectedCommand.id === 'setSerialNumber' && (
                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>New Serial Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 8-digit serial number"
                    maxLength={8}
                    keyboardType="numeric"
                    value={commandValues.newSerial}
                    onChangeText={(text) => setCommandValues({...commandValues, newSerial: text})}
                  />
                  <Text style={styles.inputHint}>Serial number must be 8 digits</Text>
                </View>
              )}
              
              <TouchableOpacity 
                style={styles.sendCommandButton}
                onPress={handleCommandWithInput}
              >
                <Text style={styles.sendCommandButtonText}>Send Command</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animatable.View>
        </View>
      </Modal>
    );
  };

  const renderDevice = ({ item, index }) => {
    const isExpanded = expandedId === item.deviceId;
    const isSelected = selectedDevices.includes(item.deviceId);
    
    return (
      <Animatable.View 
        animation="fadeInUp" 
        delay={index * 80}
        duration={400}
        style={styles.animationWrapper}
      >
        <View style={[styles.deviceCard, item.isOnline && styles.onlineCard]}>
          {bulkMode && (
            <TouchableOpacity 
              style={styles.checkbox}
              onPress={() => toggleDeviceSelection(item.deviceId)}
            >
              <Icon name={isSelected ? "check-box" : "check-box-outline-blank"} size={24} color="#FFA500" />
            </TouchableOpacity>
          )}
          
          <View style={[styles.deviceContent, bulkMode && styles.deviceContentWithCheckbox]}>
            <View style={styles.deviceHeader}>
              <View style={styles.deviceInfo}>
                <View style={[styles.statusIndicator, item.isOnline ? styles.online : styles.offline]} />
                <Text style={styles.deviceName}>{item.name || item.serialNo}</Text>
              </View>
              <View style={styles.badgeContainer}>
                {item.isOnline && (
                  <View style={styles.onlineBadge}>
                    <Text style={styles.onlineBadgeText}>ONLINE</Text>
                  </View>
                )}
                {!item.isOnline && (
                  <View style={styles.offlineBadge}>
                    <Text style={styles.offlineBadgeText}>OFFLINE</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.deviceDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Serial:</Text>
                <Text style={styles.detailValue}>{item.serialNo}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>IMEI:</Text>
                <Text style={styles.detailValue}>{item.imei || 'N/A'}</Text>
              </View>
            </View>

            {isExpanded && (
              <Animatable.View animation="fadeIn" duration={300} style={styles.expandedContent}>
                <View style={styles.commandsGrid}>
                  {commands.map((cmd) => (
                    <TouchableOpacity
                      key={cmd.id}
                      style={[styles.commandButton, { backgroundColor: cmd.color + '10' }]}
                      onPress={() => handleCommand(cmd, item)}
                    >
                      <Icon name={cmd.icon} size={18} color={cmd.color} />
                      <Text style={[styles.commandButtonText, { color: cmd.color }]} numberOfLines={1}>
                        {cmd.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Animatable.View>
            )}
            
            <TouchableOpacity 
              style={styles.expandButton}
              onPress={() => toggleExpand(item.deviceId)}
            >
              <Text style={styles.expandButtonText}>
                {isExpanded ? '▲ Hide Commands' : '▼ Show Commands'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animatable.View>
    );
  };

  const renderHeader = () => {
    const stats = getStats();
    
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Device Commands</Text>
            <TouchableOpacity 
              style={[styles.bulkButton, bulkMode && styles.activeBulkButton]}
              onPress={() => {
                setBulkMode(!bulkMode);
                if (bulkMode) setSelectedDevices([]);
              }}
            >
              <Icon name="group-work" size={24} color={bulkMode ? "#FFFFFF" : "#1A1A1A"} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Icon name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, serial, IMEI..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="close" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.statsContainer}
          >
            <TouchableOpacity 
              style={[styles.statCard, filter === 'all' && styles.activeStatCard]}
              onPress={() => setFilter('all')}
            >
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>All Devices</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'online' && styles.activeStatCard]}
              onPress={() => setFilter('online')}
            >
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{stats.online}</Text>
              <Text style={styles.statLabel}>Online</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'offline' && styles.activeStatCard]}
              onPress={() => setFilter('offline')}
            >
              <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>{stats.offline}</Text>
              <Text style={styles.statLabel}>Offline</Text>
            </TouchableOpacity>
          </ScrollView>
          
          {bulkMode && selectedDevices.length > 0 && (
            <TouchableOpacity 
              style={styles.bulkSendButton}
              onPress={sendBulkCommand}
            >
              <Icon name="send" size={20} color="#FFFFFF" />
              <Text style={styles.bulkSendText}>Send to {selectedDevices.length} device(s)</Text>
            </TouchableOpacity>
          )}
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
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      
      <FlatList
        data={getFilteredDevices()}
        keyExtractor={item => item.deviceId.toString()}
        renderItem={renderDevice}
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
            <Icon name="devices" size={80} color="#CCC" />
            <Text style={styles.emptyTitle}>No devices found</Text>
            <Text style={styles.emptyText}>
              {searchQuery 
                ? 'Try adjusting your search' 
                : filter !== 'all'
                ? `No ${filter} devices available`
                : 'No devices have been added yet'}
            </Text>
          </Animatable.View>
        }
      />
      
      {renderCommandInputModal()}
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
    paddingTop: 50,
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
  bulkButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  activeBulkButton: {
    backgroundColor: '#FFA500',
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
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
    marginLeft: 8,
  },
  statsContainer: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 100,
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
  bulkSendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFA500',
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  bulkSendText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 20,
  },
  animationWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    overflow: 'hidden',
  },
  onlineCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  checkbox: {
    position: 'absolute',
    left: 12,
    top: 16,
    zIndex: 1,
  },
  deviceContent: {
    padding: 16,
  },
  deviceContentWithCheckbox: {
    paddingLeft: 48,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  online: {
    backgroundColor: '#4CAF50',
  },
  offline: {
    backgroundColor: '#FF6B6B',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  badgeContainer: {
    flexDirection: 'row',
  },
  onlineBadge: {
    backgroundColor: '#4CAF5020',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onlineBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
  },
  offlineBadge: {
    backgroundColor: '#FF6B6B20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offlineBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  deviceDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
    width: 50,
  },
  detailValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  expandedContent: {
    marginTop: 12,
  },
  commandsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    minWidth: '48%',
  },
  commandButtonText: {
    fontSize: 11,
    fontWeight: '500',
  },
  expandButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  expandButtonText: {
    fontSize: 11,
    color: '#FFA500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
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
  commandModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  commandModalBody: {
    padding: 20,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  deviceInfoText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  inputField: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  inputHint: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 4,
  },
  sendCommandButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  sendCommandButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default CommandsScreen;
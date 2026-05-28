// SensorList.js - Reads masters from AsyncStorage
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Snackbar from 'react-native-snackbar';
import serverURL from '../config';
import { useTranslation } from 'react-i18next';

const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    return token;
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

const SensorList = ({ navigation }) => {
  const { t } = useTranslation();
  const [mastersData, setMastersData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Fetch sensors for a specific master from API
  const fetchSensorsForMaster = async (masterSN) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error(t('sensor_list.errors.auth_required', { defaultValue: 'Authentication required' }));
      }

      const url = `${serverURL}sensors/${masterSN}`;
      console.log(`📡 Fetching sensors for master ${masterSN}:`, url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        throw new Error(t('sensor_list.errors.session_expired', { defaultValue: 'Session expired' }));
      }

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`❌ Error fetching sensors for master ${masterSN}:`, error);
      return [];
    }
  };

  // Load masters from AsyncStorage and fetch their sensors
  const loadMastersAndSensors = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Get masters from AsyncStorage
      const mastersJSON = await AsyncStorage.getItem('masters');
      const masters = mastersJSON ? JSON.parse(mastersJSON) : [];

      console.log('📦 Masters from storage:', masters);

      if (masters.length === 0) {
        setMastersData([]);
        setIsLoading(false);
        return;
      }

      // 2. Fetch sensors for each master from API
      const results = await Promise.all(
        masters.map(async (master) => {
          const sensors = await fetchSensorsForMaster(master.masterSN);
          return {
            masterSerialNumber: master.masterSN,
            sensors: sensors,
            sensorCount: sensors.length,
            createdAt: master.createdAt,
            lastUpdated: master.lastUpdated,
            expanded: false,
          };
        })
      );

      setMastersData(results);
    } catch (error) {
      console.error('❌ Error loading masters:', error);
      setError(error.message || t('sensor_list.errors.load_failed', { defaultValue: 'Failed to load masters' }));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadMastersAndSensors();

    // Add focus listener to refresh when coming back to this screen
    const unsubscribe = navigation.addListener('focus', () => {
      loadMastersAndSensors();
    });

    return unsubscribe;
  }, [navigation]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadMastersAndSensors();
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('sensor_list.unknown', { defaultValue: 'Unknown' });
    const date = new Date(dateString);
    return date.toLocaleDateString(t('sensor_list.locale', { defaultValue: 'en-US' }), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleMasterExpanded = (masterSN) => {
    setMastersData(prevData =>
      prevData.map(item =>
        item.masterSerialNumber === masterSN
          ? { ...item, expanded: !item.expanded }
          : item
      )
    );
  };

  const renderMasterCard = ({ item }) => (
    <View style={styles.masterCard}>
      {/* Master Header */}
      <TouchableOpacity
        style={styles.masterHeader}
        onPress={() => toggleMasterExpanded(item.masterSerialNumber)}
        activeOpacity={0.7}
      >
        <View style={styles.masterIconContainer}>
          <Ionicons name="hardware-chip-outline" size={24} color="#FFA500" />
        </View>
        <View style={styles.masterInfo}>
          <Text style={styles.masterTitle}>{t('sensor_list.master_device', { defaultValue: 'Master Device' })}</Text>
          <Text style={styles.masterSerial}>{item.masterSerialNumber}</Text>
          <Text style={styles.masterDate}>
            {t('sensor_list.mapped', { defaultValue: 'Mapped' })}: {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.masterStats}>
          <View style={styles.sensorCountBadge}>
            <Text style={styles.sensorCountText}>{item.sensorCount}</Text>
          </View>
          <Ionicons
            name={item.expanded ? "chevron-up" : "chevron-down"}
            size={24}
            color="#888"
          />
        </View>
      </TouchableOpacity>

      {/* Slaves List (expanded) */}
      {item.expanded && (
        <View style={styles.slavesContainer}>
          {item.sensors.length > 0 ? (
            <>
              <View style={styles.slavesHeader}>
                <Text style={styles.slavesHeaderText}>
                  {t('sensor_list.connected_sensors', { defaultValue: 'Connected Sensors' })} ({item.sensorCount})
                </Text>
              </View>
              {item.sensors.map((sensor, index) => (
                <View key={sensor.id} style={styles.sensorRow}>
                  <View style={styles.sensorNumber}>
                    <Text style={styles.sensorNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.sensorDetails}>
                    <Text style={styles.sensorId}>{sensor.sensorId}</Text>
                    <Text style={styles.sensorMeta}>
                      {t('sensor_list.id_label', { defaultValue: 'ID' })}: {sensor.id} | {t('sensor_list.added', { defaultValue: 'Added' })}: {formatDate(sensor.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeSensorButton}
                    onPress={() => {
                      Snackbar.show({
                        text: t('sensor_list.remove_sensor_message', { defaultValue: 'Remove {{sensorId}} - API endpoint needed', sensorId: sensor.sensorId }).replace('{{sensorId}}', sensor.sensorId),
                        duration: 2000,
                        backgroundColor: '#FF9800',
                      });
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={22} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          ) : (
            <View style={styles.noSensorsContainer}>
              <Ionicons name="sensor-outline" size={32} color="#CCC" />
              <Text style={styles.noSensorsText}>{t('sensor_list.no_sensors', { defaultValue: 'No sensors connected' })}</Text>
              <Text style={styles.noSensorsSubtext}>
                {t('sensor_list.no_sensors_subtext', { defaultValue: 'Use the mapper to add sensors to this master' })}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="hardware-chip-outline" size={64} color="#CCCCCC" />
      <Text style={styles.emptyTitle}>{t('sensor_list.no_masters_title', { defaultValue: 'No Masters Found' })}</Text>
      <Text style={styles.emptyText}>
        {t('sensor_list.no_masters_text', { defaultValue: 'You haven\'t mapped any masters yet.' })}
      </Text>
      <TouchableOpacity
        style={styles.goToMapperButton}
        onPress={() => navigation.navigate('MasterSlaveMapper')}
      >
        <Ionicons name="add-circle-outline" size={20} color="#FFF" />
        <Text style={styles.goToMapperButtonText}>{t('sensor_list.go_to_mapper', { defaultValue: 'Go to Mapper' })}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="alert-circle-outline" size={64} color="#FF6B6B" />
      <Text style={styles.emptyTitle}>{t('sensor_list.error_title', { defaultValue: 'Error Loading Data' })}</Text>
      <Text style={styles.emptyText}>{error}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={loadMastersAndSensors}
      >
        <Ionicons name="refresh-outline" size={20} color="#FFF" />
        <Text style={styles.retryButtonText}>{t('sensor_list.retry', { defaultValue: 'Retry' })}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>{t('sensor_list.loading', { defaultValue: 'Loading masters...' })}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />

      {/* Header */}
      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('sensor_list.header_title', { defaultValue: 'Master & Sensor Mapping' })}</Text>
          <Text style={styles.headerSubtitle}>
            {t('sensor_list.total_masters', { defaultValue: 'Total Masters' })}: {mastersData.length} | {t('sensor_list.total_sensors', { defaultValue: 'Total Sensors' })}: {mastersData.reduce((sum, m) => sum + m.sensorCount, 0)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={24} color="#FFA500" />
        </TouchableOpacity>
      </View>

      {/* Master Cards List */}
      {error ? (
        renderErrorState()
      ) : (
        <FlatList
          data={mastersData}
          keyExtractor={(item) => item.masterSerialNumber}
          renderItem={renderMasterCard}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={['#FFA500']}
              tintColor="#FFA500"
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  refreshButton: {
    padding: 8,
  },
  listContainer: {
    padding: 16,
  },
  masterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  masterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  masterIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  masterInfo: {
    flex: 1,
  },
  masterTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  masterSerial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  masterDate: {
    fontSize: 10,
    color: '#999',
  },
  masterStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sensorCountBadge: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 32,
    alignItems: 'center',
  },
  sensorCountText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  slavesContainer: {
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  slavesHeader: {
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  slavesHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFA500',
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  sensorNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sensorNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  sensorDetails: {
    flex: 1,
  },
  sensorId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  sensorMeta: {
    fontSize: 10,
    color: '#888',
  },
  removeSensorButton: {
    padding: 4,
  },
  noSensorsContainer: {
    padding: 24,
    alignItems: 'center',
  },
  noSensorsText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginTop: 8,
  },
  noSensorsSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  goToMapperButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  goToMapperButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#1A1A1A',
    marginTop: 16,
  },
});

export default SensorList;
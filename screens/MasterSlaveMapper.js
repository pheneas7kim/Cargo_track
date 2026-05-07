import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Snackbar from 'react-native-snackbar';
import serverURL from '../config';

const { width, height } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

const MasterSlaveMapper = () => {
  // Current session state
  const [master, setMaster] = useState(null);
  const [masterRaw, setMasterRaw] = useState(null);
  const [slaves, setSlaves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Persistence state for multiple trucks
  const [allMappings, setAllMappings] = useState([]);

  // Navigation state
  const [viewMode, setViewMode] = useState('DASHBOARD'); // DASHBOARD, SCANNER, SUMMARY
  const [scanType, setScanType] = useState(null);

  console.log('--- COMPONENT RENDERED ---');

  const cleanSlaveId = (value) => {
    const cleaned = value ? value.replace(/^00+/, '').trim() : null;
    console.log('CLEANING SLAVE ID: Input=', value, 'Output=', cleaned);
    return cleaned;
  };

  const sendMapping = async (slaveList) => {
    console.log('--- INITIATING SEND MAPPING ---');
    try {
      const sanitizedSlaves = slaveList.map(s => s.trim());
      const count = sanitizedSlaves.length;
      const slaveString = sanitizedSlaves.join(',');

      // Dynamic command construction using the master variable
      const command = `(${master},1,001,WLNET,1,1,${count},${slaveString})`;
      const url = `${serverURL}joint-tech/command/${master}?command=${encodeURIComponent(command)}`;

      console.log('URL:', url);
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error('--- MAPPING FETCH ERROR ---', error);
      throw error;
    }
  };

  const handleRemoveMapping = async () => {
    if (!master) {
      Snackbar.show({
        text: 'No master set to remove',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);
    try {
      const command = `(${master},1,001,WLNET,1,1,0)`;
      const url = `${serverURL}joint-tech/command/${master}?command=${encodeURIComponent(command)}`;

      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) throw new Error('Removal request failed');

      Snackbar.show({
        text: 'Mapping removed successfully',
        duration: 3000,
        backgroundColor: '#4ECDC4',
      });

      resetCurrentSession();
    } catch (error) {
      Snackbar.show({
        text: 'Failed to remove mapping',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;
    if (!value || isLoading) return;

    if (scanType === 'MASTER') {
      const masterValue = value.trim();
      if (!/^\d+$/.test(masterValue)) {
        Snackbar.show({ text: 'Invalid master barcode', backgroundColor: '#FF6B6B' });
        setViewMode('DASHBOARD');
        return;
      }
      setMaster(masterValue);
      setMasterRaw(value);
      setViewMode('DASHBOARD');
      Snackbar.show({ text: `Master set: ${masterValue}`, backgroundColor: '#4ECDC4' });
    } else if (scanType === 'SLAVE') {
      let slaveId = cleanSlaveId(value);
      if (!slaveId) {
        setViewMode('DASHBOARD');
        return;
      }
      if (slaves.includes(slaveId)) {
        Snackbar.show({ text: 'Slave already scanned', backgroundColor: '#FFA500' });
        setViewMode('DASHBOARD');
        return;
      }
      setSlaves([...slaves, slaveId]);
      setViewMode('DASHBOARD');
      Snackbar.show({ text: `Slave added: ${slaveId}`, backgroundColor: '#4ECDC4' });
    }
  };

  const handleMapAll = async () => {
    if (!master || slaves.length === 0) {
      Snackbar.show({ text: 'Master or slaves missing', backgroundColor: '#FF6B6B' });
      return;
    }

    setIsLoading(true);
    try {
      await sendMapping(slaves);

      // Save to global list for tracking
      const newMapping = {
        id: Date.now().toString(),
        master: master,
        slaves: [...slaves],
        timestamp: new Date().toLocaleTimeString(),
      };
      setAllMappings(prev => [newMapping, ...prev]);

      Snackbar.show({ text: 'Mapping successful', backgroundColor: '#4ECDC4' });

      // Reset current fields for next truck
      setMaster(null);
      setMasterRaw(null);
      setSlaves([]);
    } catch (error) {
      Snackbar.show({ text: 'Mapping failed', backgroundColor: '#FF6B6B' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetCurrentSession = () => {
    setMaster(null);
    setMasterRaw(null);
    setSlaves([]);
    setViewMode('DASHBOARD');
  };

  const clearHistory = () => {
    setAllMappings([]);
    Snackbar.show({ text: 'History cleared', backgroundColor: '#7F8C8D' });
  };

  // --- RENDERING LOGIC ---

  if (viewMode === 'SUMMARY') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#0B0C10" />
        <Text style={styles.title}>Truck Mapping History</Text>
        <Text style={styles.counter}>Total Trucks: {allMappings.length}</Text>

        <FlatList
          style={{ width: '100%', marginTop: 10 }}
          data={allMappings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.summaryCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.summaryMaster}>Master: {item.master}</Text>
                <Text style={styles.timestamp}>{item.timestamp}</Text>
              </View>
              <Text style={styles.summarySlaves}>
                Slaves ({item.slaves.length}): {item.slaves.join(', ')}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No mappings performed yet.</Text>
          }
        />

        <TouchableOpacity
          style={[styles.mapButton, { backgroundColor: '#4ECDC4' }]}
          onPress={() => setViewMode('DASHBOARD')}
        >
          <Text style={styles.mapText}>BACK TO SCANNER</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetButton} onPress={clearHistory}>
          <Text style={styles.resetText}>Clear All History</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (viewMode === 'DASHBOARD') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#0B0C10" />

        <Text style={styles.title}>Master-Slave Mapper</Text>

        <View style={styles.masterBox}>
          <Text style={styles.label}>Current Master:</Text>
          <Text style={styles.value}>{master ? master : 'Scan a Master Device'}</Text>
        </View>

        <Text style={styles.counter}>
          Current Slaves: {slaves.length}
        </Text>

        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: '#4ECDC4' }]}
            onPress={() => {
              setScanType('MASTER');
              setViewMode('SCANNER');
            }}
          >
            <Text style={styles.buttonText}>Scan Master</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: '#FFD700' }]}
            onPress={() => {
              setScanType('SLAVE');
              setViewMode('SCANNER');
            }}
          >
            <Text style={styles.buttonText}>Scan Slaves</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          style={{ width: '100%', flex: 1 }}
          data={slaves}
          keyExtractor={(item, index) => item + index}
          renderItem={({ item, index }) => (
            <View style={styles.slaveRow}>
              <Text style={styles.slaveItem}>
                {index + 1}. {item}
              </Text>
            </View>
          )}
        />

        <View style={styles.footer}>
          {slaves.length > 0 && (
            <TouchableOpacity
              style={styles.mapButton}
              onPress={handleMapAll}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.mapText}>MAP CURRENT TRUCK</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.mapButton, { backgroundColor: '#6B7F8C', marginTop: 10 }]}
            onPress={() => setViewMode('SUMMARY')}
          >
            <Text style={styles.mapText}>VIEW ALL TRUCKS ({allMappings.length})</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            {master && (
              <TouchableOpacity style={styles.halfButton} onPress={handleRemoveMapping}>
                <Text style={styles.removeText}>Remove Current</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.halfButton} onPress={resetCurrentSession}>
              <Text style={styles.resetText}>Reset Form</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0C10" />
      <Text style={[styles.title, { marginBottom: 20 }]}>Scanning {scanType}</Text>
      <View style={styles.cameraFrame}>
        <Camera
          style={styles.camera}
          scanBarcode={true}
          onReadCode={onReadCode}
          showFrame={false}
        />
        <View style={styles.scanBorder} />
      </View>

      <TouchableOpacity
        style={styles.mapButton}
        onPress={() => setViewMode('DASHBOARD')}
      >
        <Text style={styles.mapText}>CANCEL SCAN</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C10',
    alignItems: 'center',
    padding: 20,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  navButton: {
    padding: 15,
    borderRadius: 10,
    width: '48%',
    alignItems: 'center',
    elevation: 5,
  },
  buttonText: {
    color: '#000',
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 10,
  },
  masterBox: {
    backgroundColor: '#1C1E22',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  label: {
    color: '#aaa',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  value: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  counter: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  slaveRow: {
    backgroundColor: '#1C1E22',
    padding: 10,
    marginVertical: 2,
    borderRadius: 5,
  },
  slaveItem: {
    color: '#4ECDC4',
    fontSize: 15,
  },
  cameraFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 40,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  camera: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
  },
  scanBorder: {
    position: 'absolute',
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderWidth: 4,
    borderColor: '#FFD700',
    opacity: 0.5,
  },
  footer: {
    width: '100%',
    paddingTop: 10,
  },
  mapButton: {
    backgroundColor: '#FFD700',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    elevation: 3,
  },
  mapText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  halfButton: {
    padding: 10,
  },
  removeText: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  resetButton: {
    marginTop: 10,
    padding: 15,
  },
  resetText: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  // Summary View Styles
  summaryCard: {
    backgroundColor: '#1C1E22',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  summaryMaster: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timestamp: {
    color: '#6B7F8C',
    fontSize: 12,
  },
  summarySlaves: {
    color: '#B0C4DE',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: '#7F8C8D',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});

export default MasterSlaveMapper;
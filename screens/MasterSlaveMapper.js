import React, { useState } from 'react';
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
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Snackbar from 'react-native-snackbar';
import serverURL from '../config';

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

const MasterSlaveMapper = () => {
  const [master, setMaster] = useState(null);
  const [masterRaw, setMasterRaw] = useState(null);

  const [slaves, setSlaves] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [mode, setMode] = useState('MASTER');
  // MASTER | SLAVE | READY

  const MASTER_DEVICE_ID = '9';
  const FIXED_PREFIX = '8052558331,1,001,WLNET,1,1,1';

  const cleanSlaveId = (value) => {
    if (!value) return null;
    return value.replace(/^00+/, '').trim();
  };

  const sendMapping = async (slaveList) => {
    try {
      const slaveString = slaveList.join(',');

      const command = `(${FIXED_PREFIX},${slaveString})`;

      const url = `${serverURL}joint-tech/command/${MASTER_DEVICE_ID}?command=${encodeURIComponent(command)}`;

      console.log('==============================');
      console.log('🚀 SENDING MAPPING REQUEST');
      console.log('Master ID:', MASTER_DEVICE_ID);
      console.log('Master Device:', master);
      console.log('Slaves:', slaveList);
      console.log('Command:', command);
      console.log('URL:', url);
      console.log('==============================');

      const response = await fetch(url, {
        method: 'GET',
      });

      const data = await response.text();

      console.log('📡 RESPONSE STATUS:', response.status);
      console.log('📦 RESPONSE BODY:', data);
      console.log('==============================');

      if (!response.ok) {
        throw new Error('Mapping failed');
      }

      return data;
    } catch (error) {
      console.log('❌ MAPPING ERROR:', error);
      throw error;
    }
  };

  const onReadCode = async (event) => {
    const value = event?.nativeEvent?.codeStringValue;

    if (!value || isLoading) return;

    console.log('📷 SCANNED VALUE:', value);

    /**
     * STEP 1: MASTER SCAN (BARCODE)
     */
    if (mode === 'MASTER') {
      const masterValue = value.trim();

      if (!/^\d+$/.test(masterValue)) {
        Snackbar.show({
          text: 'Invalid master barcode',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        return;
      }

      setMaster(masterValue);
      setMasterRaw(value);
      setMode('SLAVE');

      Snackbar.show({
        text: `Master set: ${masterValue}`,
        duration: 2000,
        backgroundColor: '#4ECDC4',
      });

      console.log('✅ MASTER SET:', masterValue);
      return;
    }

    /**
     * STEP 2: SLAVE SCAN (QR)
     */
    let slaveId = cleanSlaveId(value);

    console.log('🔎 CLEANED SLAVE ID:', slaveId);

    if (!slaveId) return;

    if (slaves.includes(slaveId)) {
      Snackbar.show({
        text: 'Slave already scanned',
        duration: 2000,
        backgroundColor: '#FFA500',
      });
      return;
    }

    const updatedSlaves = [...slaves, slaveId];
    setSlaves(updatedSlaves);

    Snackbar.show({
      text: `Slave scanned: ${slaveId} (${updatedSlaves.length})`,
      duration: 2000,
      backgroundColor: '#4ECDC4',
    });

    console.log('📦 SLAVES LIST:', updatedSlaves);

    setMode('SLAVE');
  };

  const handleMapAll = async () => {
    if (!master || slaves.length === 0) {
      Snackbar.show({
        text: 'Master or slaves missing',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsLoading(true);

    try {
      await sendMapping(slaves);

      Snackbar.show({
        text: 'Mapping successful',
        duration: 3000,
        backgroundColor: '#4ECDC4',
      });

      setMode('MASTER');
      setMaster(null);
      setMasterRaw(null);
      setSlaves([]);
    } catch (error) {
      Snackbar.show({
        text: 'Mapping failed',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setMaster(null);
    setMasterRaw(null);
    setSlaves([]);
    setMode('MASTER');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0C10" />

      <Text style={styles.title}>Master-Slave Mapper</Text>

      {master && (
        <View style={styles.masterBox}>
          <Text style={styles.label}>Master:</Text>
          <Text style={styles.value}>{master}</Text>
        </View>
      )}

      <Text style={styles.counter}>
        Slaves scanned: {slaves.length}
      </Text>

      <View style={styles.cameraFrame}>
        <Camera
          style={styles.camera}
          scanBarcode={true}
          onReadCode={onReadCode}
          showFrame={false}
        />
        <View style={styles.scanBorder} />
      </View>

      <FlatList
        data={slaves}
        keyExtractor={(item, index) => item + index}
        renderItem={({ item, index }) => (
          <Text style={styles.slaveItem}>
            {index + 1}. {item}
          </Text>
        )}
      />

      {slaves.length > 0 && (
        <TouchableOpacity
          style={styles.mapButton}
          onPress={handleMapAll}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.mapText}>MAP ALL</Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.resetButton} onPress={resetAll}>
        <Text style={styles.resetText}>Reset</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default MasterSlaveMapper;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C10',
    alignItems: 'center',
    padding: 20,
  },

  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },

  masterBox: {
    backgroundColor: '#1C1E22',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    width: '100%',
  },

  label: {
    color: '#aaa',
    fontSize: 12,
  },

  value: {
    color: '#fff',
    fontSize: 16,
  },

  counter: {
    color: '#FFD700',
    marginBottom: 10,
  },

  cameraFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
  },

  camera: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
  },

  scanBorder: {
    position: 'absolute',
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 20,
  },

  slaveItem: {
    color: '#4ECDC4',
    fontSize: 14,
    marginTop: 4,
  },

  mapButton: {
    marginTop: 15,
    backgroundColor: '#FFD700',
    padding: 12,
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },

  mapText: {
    color: '#000',
    fontWeight: '700',
  },

  resetButton: {
    marginTop: 10,
    padding: 10,
  },

  resetText: {
    color: '#FF6B6B',
  },
});
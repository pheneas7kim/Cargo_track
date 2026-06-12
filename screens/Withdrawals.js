import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  SafeAreaView, 
  View, 
  StatusBar, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  RefreshControl,
  Dimensions
} from 'react-native';
import serverUrl from '../config'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar'; // Add missing import

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
import OfflineSyncService from '../services/OfflineSyncService';
// ========== END OFFLINE MODULE IMPORTS ==========

const { width } = Dimensions.get('window');

const maskPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  const firstTwelve = phoneNumber.substring(0, 12);
  const masked = `${firstTwelve.substring(0, 6)}***${firstTwelve.substring(9, 12)}`;
  return masked;
};

const maskNamer = (phoneNumber) => {
  if (!phoneNumber) return '';
  const parts = phoneNumber.split('-');
  if (parts.length < 2) return '';
  return parts[1].trim();
};

const getRandomColor = () => {
  const colors = ['#FFE5E5', '#E5F3FF', '#E8F8EC', '#FFF5E6', '#F0F5FF', '#FFE5F1', '#E5FFE5'];
  return colors[Math.floor(Math.random() * colors.length)];
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

const formatTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const getWithdrawalStatus = (item) => {
  // You can add logic here based on your API response
  // For now, assuming all withdrawals are completed
  return 'completed';
};

function Withdrawals() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Withdrawals Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Start auto-sync service
        await OfflineSyncService.startAutoSync();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (online) {
            Snackbar.show({
              text: 'Back online! Syncing data...',
              duration: 2000,
              backgroundColor: '#4CAF50',
            });
            // Auto-refresh when coming back online
            fetTransactions();
          } else {
            Snackbar.show({
              text: 'Offline mode - using cached withdrawal history',
              duration: 3000,
              backgroundColor: '#FF9800',
            });
          }
        });

        // Load initial data
        await fetTransactions();
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

  // ========== OFFLINE: Cache withdrawals data ==========
  const cacheWithdrawalsData = async (transactionsData, total) => {
    try {
      await OfflineDatabaseService.saveUserData('withdrawals_history', {
        data: transactionsData,
        totalWithdrawn: total,
        timestamp: Date.now()
      });
      console.log('✅ Withdrawals data cached offline');
    } catch (error) {
      console.error('Error caching withdrawals data:', error);
    }
  };
  // ========== END OFFLINE CACHE HELPER ==========

  // ========== OFFLINE: Load cached withdrawals ==========
  const loadCachedWithdrawals = async () => {
    try {
      const cached = await OfflineDatabaseService.getUserData('withdrawals_history');
      if (cached && cached.data && cached.data.length > 0) {
        setTransactions(cached.data);
        setTotalWithdrawn(cached.totalWithdrawn || 0);
        console.log('📦 Loaded cached withdrawal history');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading cached withdrawals:', error);
      return false;
    }
  };
  // ========== END OFFLINE LOAD CACHED ==========

  // ========== OFFLINE: Manual sync function ==========
  const manualSync = async () => {
    if (!isOnline) {
      Snackbar.show({
        text: 'Cannot sync while offline',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setIsSyncing(true);
    try {
      await OfflineSyncService.syncAll();
      await fetTransactions();
      Snackbar.show({
        text: 'Sync completed successfully!',
        duration: 3000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      Snackbar.show({
        text: 'Sync failed',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setIsSyncing(false);
    }
  };
  // ========== END OFFLINE MANUAL SYNC ==========

  useFocusEffect(
    React.useCallback(() => {
      fetTransactions();

      const backAction = () => {
        fetTransactions();
        return false;
      };

      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        backAction
      );

      return () => backHandler.remove();
    }, [])
  );

  useEffect(() => {
    fetTransactions();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // ========== OFFLINE: Manual sync on refresh ==========
    if (isOnline) {
      await manualSync();
    } else {
      await loadCachedWithdrawals();
      setRefreshing(false);
    }
    // ========== END OFFLINE MANUAL SYNC ==========
  };

  const fetTransactions = async () => {
    try {
      // ========== OFFLINE: Check if online ==========
      const online = await NetworkMonitorService.isOnline();

      if (!online) {
        const hasCached = await loadCachedWithdrawals();
        if (hasCached) {
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
      // ========== END OFFLINE CHECK ==========

      const token = await AsyncStorage.getItem('accessToken');
      const userId = await AsyncStorage.getItem('id');

      if (!token || !userId) {
        console.error('No token or user ID found');
        return;
      }

      if (!refreshing) {
        setLoading(true);
      }

      const response = await axios.get(`${serverUrl}/SalesOrder/searchPurchaseOrderByStatus?createdBy=${userId}&doc_status_id=33`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = response.data;
      let total = 0;

      const salesOrders = data.map((item) => {
        total += item.grandTotal;
        return {
          id: item.sales_order_id.toString(),
          initials: 'WD', // Withdrawal initials
          name: item.phoneNumber ? item.phoneNumber : 'Mobile Money',
          account: item.phoneNumber ? maskPhoneNumber(item.phoneNumber) : 'N/A',
          amount: item.grandTotal,
          time: item.updatedAt,
          color: getRandomColor(),
          status: getWithdrawalStatus(item),
          type: 'withdrawal'
        };
      });

      setTransactions(salesOrders);
      setTotalWithdrawn(total);

      // ========== OFFLINE: Cache fetched withdrawals ==========
      await cacheWithdrawalsData(salesOrders, total);
      // ========== END OFFLINE CACHE ==========
    } catch (error) {
      console.error('Failed to fetch withdrawal data:', error);

      // ========== OFFLINE: Fallback to cached withdrawals on error ==========
      const hasCached = await loadCachedWithdrawals();
      if (!hasCached) {
        // Don't show snackbar on error if we have cached data
      } else {
        Snackbar.show({
          text: 'Using cached withdrawal history (offline mode)',
          duration: 3000,
          backgroundColor: '#FF9800',
        });
      }
      // ========== END OFFLINE FALLBACK ==========
    } finally {
      setLoading(false);
    }
  };



  const renderWithdrawal = ({ item, index }) => (
    <View style={styles.withdrawalCard}>
      <View style={styles.withdrawalHeader}>
        <View style={styles.leftSection}>
          <View style={[styles.avatar, { backgroundColor: '#FF6B6B15' }]}>
            <Text style={styles.avatarText}>💸</Text>
          </View>
          <View style={styles.withdrawalInfo}>
            <Text style={styles.withdrawalTitle}>Money Withdrawal</Text>
            <Text style={styles.withdrawalSubtitle}>{item.account}</Text>
          </View>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.amountText}>-KSH {item.amount.toLocaleString()}</Text>
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusDot,
              { backgroundColor: item.status === 'completed' ? '#4ECDC4' : '#FFD700' }
            ]} />
            <Text style={styles.statusText}>
              {item.status === 'completed' ? 'Completed' : 'Processing'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.withdrawalFooter}>
        <Text style={styles.dateText}>{item.time}</Text>
      </View>
    </View>
  );




  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Text style={styles.emptyIcon}>💳</Text>
      </View>
      <Text style={styles.emptyTitle}>No Withdrawals Yet</Text>
      <Text style={styles.emptySubtitle}>
        Your withdrawal history will appear here once you make your first withdrawal.
      </Text>
      <TouchableOpacity style={styles.emptyActionButton} onPress={() => {/* Navigate to withdrawal screen */}}>
        <Text style={styles.emptyActionText}>Make a Withdrawal</Text>
      </TouchableOpacity>
    </View>
  );


  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* ========== OFFLINE: Network status banner ========== */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📴 Offline Mode - Using cached withdrawal history</Text>
        </View>
      )}
      {/* ========== END OFFLINE BANNER ========== */}

      {/* ========== OFFLINE: Sync button ========== */}
      <View style={styles.syncHeader}>
        {isSyncing ? (
          <ActivityIndicator size="small" color="#FF6B6B" />
        ) : (
          <TouchableOpacity onPress={manualSync} style={styles.syncButton}>
            <Text style={styles.syncButtonText}>↻ Sync</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* ========== END OFFLINE SYNC BUTTON ========== */}

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryLabel}>Total Withdrawn</Text>
          <View style={styles.trendContainer}>
            <Text style={styles.trendIcon}>📊</Text>
          </View>
        </View>
        <Text style={styles.summaryAmount}>KSH {totalWithdrawn.toLocaleString()}</Text>
        <Text style={styles.summarySubtext}>
          {transactions.length} {transactions.length === 1 ? 'withdrawal' : 'withdrawals'}
        </Text>
      </View>

      {transactions.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Withdrawal History</Text>
          <Text style={styles.transactionCount}>{transactions.length}</Text>
        </View>
      )}
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading withdrawals...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={renderWithdrawal}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#FF6B6B']}
            tintColor="#FF6B6B"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          transactions.length === 0 && styles.emptyListContent
        ]}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 16,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 8,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  syncHeader: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  syncButton: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  syncButtonText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  offlineBanner: {
    backgroundColor: '#FF9800',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  summaryCard: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  trendContainer: {
    backgroundColor: '#FFFFFF20',
    borderRadius: 12,
    padding: 8,
  },
  trendIcon: {
    fontSize: 16,
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  summarySubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  transactionCount: {
    fontSize: 14,
    color: '#666666',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '500',
  },
  withdrawalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
  },
  withdrawalInfo: {
    flex: 1,
  },
  withdrawalTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  withdrawalSubtitle: {
    fontSize: 12,
    color: '#666666',
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  withdrawalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  dateText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  timeText: {
    fontSize: 12,
    color: '#999999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B6B15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyActionButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Withdrawals;
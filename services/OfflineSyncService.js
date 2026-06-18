// import AsyncStorage from '@react-native-async-storage/async-storage';
// import NetworkMonitorService from './NetworkMonitorService';
// import OfflineDatabaseService from './OfflineDatabaseService';
// import { refreshAccessToken } from './TokenService';
// import axios from 'axios';

// const serverUrl = 'https://demo2.bsl.co.ke/api/v1';

// class OfflineSyncService {
//   constructor() {
//     this.isSyncing = false;
//     this.syncInterval = null;
//   }

//   async startAutoSync() {
//     console.log('🚀 Starting auto-sync service...');

//     // Sync immediately if online
//     if (await NetworkMonitorService.isOnline()) {
//       console.log('📡 Online detected, running initial sync...');
//       await this.syncAll();
//     } else {
//       console.log('📴 Offline detected, waiting for connection...');
//     }

//     // Set up interval to check for sync every 30 seconds
//     this.syncInterval = setInterval(async () => {
//       if (await NetworkMonitorService.isOnline() && !this.isSyncing) {
//         console.log('⏰ Auto-sync timer triggered');
//         await this.syncAll();
//       }
//     }, 30000);

//     // Listen for online events (when connection is restored)
//     NetworkMonitorService.on('online', async () => {
//       console.log('🔄 Network online, auto-syncing...');
//       await this.syncAll();
//     });

//     console.log('✅ Auto-sync service started (interval: 30s)');
//   }

//   async syncAll() {
//     if (this.isSyncing) {
//       console.log('⏳ Sync already in progress...');
//       return;
//     }

//     this.isSyncing = true;
//     console.log('🔄 Starting offline data sync...');

//     try {
//       // 1. Sync pending seal replacement requests (outgoing)
//       await this.syncPendingSealRequests();

//       // 2. Sync other pending operations from queue
//       await this.syncQueue();

//       // 3. Sync fresh data from server (incoming) - ROLE BASED
//       await this.syncFreshData();

//       console.log('✅ Offline sync completed successfully');
//     } catch (error) {
//       console.error('❌ Sync error:', error);
//     } finally {
//       this.isSyncing = false;
//     }
//   }

//   async syncPendingSealRequests() {
//     const pendingRequests = await OfflineDatabaseService.getPendingSealRequests();

//     if (pendingRequests.length === 0) return;

//     console.log(`📤 Syncing ${pendingRequests.length} pending seal requests...`);

//     for (const request of pendingRequests) {
//       try {
//         const token = await AsyncStorage.getItem('accessToken');
//         const roleId = await AsyncStorage.getItem('roleId');

//         const payload = {
//           ticketId: request.ticketId,
//           newSealNumber: request.newSealNumber,
//           reason: request.reason,
//           oldDeviceConditionId: request.oldDeviceConditionId,
//         };

//         // Only RRU users (role 102) can submit seal requests
//         if (roleId === '102') {
//           const response = await axios.post(
//             `${serverUrl}/tickets/${request.ticketId}/seal-replacement/request`,
//             payload,
//             {
//               headers: {
//                 'Authorization': `Bearer ${token}`,
//                 'Content-Type': 'application/json',
//               },
//             }
//           );

//           if (response.status === 200 || response.status === 201) {
//             await OfflineDatabaseService.updateSealRequestSyncStatus(
//               request.id,
//               'SYNCED',
//               response.data.id
//             );
//             console.log(`✅ Synced seal request for ticket ${request.ticketId}`);
//           }
//         } else {
//           console.log(`⏭️ Skipping seal request sync - role ${roleId} not authorized`);
//           await OfflineDatabaseService.updateSealRequestSyncStatus(request.id, 'SKIPPED');
//         }
//       } catch (error) {
//         console.error(`❌ Failed to sync seal request ${request.id}:`, error.message);
//         await OfflineDatabaseService.updateSealRequestSyncStatus(request.id, 'FAILED');

//         // Add to retry queue
//         await OfflineDatabaseService.addToSyncQueue(
//           'SEAL_REQUEST',
//           `/tickets/${request.ticketId}/seal-replacement/request`,
//           payload
//         );
//       }
//     }
//   }

//   async syncQueue() {
//     const pendingItems = await OfflineDatabaseService.getPendingSyncItems();

//     if (pendingItems.length === 0) return;

//     console.log(`📤 Syncing ${pendingItems.length} pending queue items...`);

//     for (const item of pendingItems) {
//       try {
//         const token = await AsyncStorage.getItem('accessToken');
//         const roleId = await AsyncStorage.getItem('roleId');

//         let response;
//         switch (item.operation) {
//           case 'SEAL_REQUEST':
//             // Only RRU users can submit seal requests
//             if (roleId === '102') {
//               response = await axios.post(
//                 `${serverUrl}${item.endpoint}`,
//                 item.data,
//                 { headers: { 'Authorization': `Bearer ${token}` } }
//               );
//             } else {
//               console.log(`⏭️ Skipping ${item.operation} - role ${roleId} not authorized`);
//               await OfflineDatabaseService.markSyncItemComplete(item.id);
//               continue;
//             }
//             break;
//           case 'MARK_READ':
//           case 'MARK_ATTENDED':
//           case 'ASSIGN':
//             // These are allowed for all roles
//             response = await axios.post(
//               `${serverUrl}${item.endpoint}`,
//               item.data,
//               { headers: { 'Authorization': `Bearer ${token}` } }
//             );
//             break;
//           default:
//             console.log(`⚠️ Unknown operation type: ${item.operation}`);
//             continue;
//         }

//         if (response.status === 200 || response.status === 201) {
//           await OfflineDatabaseService.markSyncItemComplete(item.id);
//           console.log(`✅ Synced queue item ${item.id} (${item.operation})`);
//         }
//       } catch (error) {
//         console.error(`❌ Failed to sync queue item ${item.id}:`, error.message);
//         await OfflineDatabaseService.markSyncItemFailed(item.id);
//       }
//     }
//   }

//   async syncFreshData() {
//     try {
//       const token = await AsyncStorage.getItem('accessToken');
//       const roleId = await AsyncStorage.getItem('roleId');

//       console.log(`📥 Syncing fresh data for role: ${roleId}`);

//       // Only RRU users (role 102) can access seal replacement requests
//       if (roleId === '102') {
//         console.log('📡 Syncing seal replacement requests (RRU role)...');
//         const ticketsResponse = await axios.get(
//           `${serverUrl}/tickets/seal-replacement/my-requests`,
//           { headers: { 'Authorization': `Bearer ${token}` } }
//         );

//         if (ticketsResponse.data && ticketsResponse.data.content) {
//           await OfflineDatabaseService.saveTickets(ticketsResponse.data.content);
//           console.log(`✅ Synced ${ticketsResponse.data.content.length} seal replacement tickets`);
//         }
//       } else {
//         console.log(`⏭️ Skipping seal-replacement sync - role ${roleId} not authorized (RRU only)`);
//       }

//       // Add other role-specific syncs here:
//       // - Shipments for all roles
//       // - Tickets for relevant roles
//       // - Alerts for all roles
//       // - Notifications for all roles

//     } catch (error) {
//       // Don't treat 403 as fatal error - it's expected for non-RRU roles
//       if (error.response?.status === 403) {
//         console.log('⚠️ Skipping unauthorized endpoint (expected for this role)');
//       } else {
//         console.error('❌ Failed to sync fresh data:', error.message);
//       }
//     }
//   }

//   // Process only pending actions (for manual sync button)
//   async processPendingActions() {
//     if (this.isSyncing) {
//       console.log('⏳ Sync already in progress...');
//       return;
//     }

//     this.isSyncing = true;
//     console.log('🔄 Processing pending actions only...');

//     try {
//       await this.syncPendingSealRequests();
//       await this.syncQueue();
//       console.log('✅ Pending actions processed successfully');
//     } catch (error) {
//       console.error('❌ Error processing pending actions:', error);
//     } finally {
//       this.isSyncing = false;
//     }
//   }

//   stopAutoSync() {
//     if (this.syncInterval) {
//       clearInterval(this.syncInterval);
//       this.syncInterval = null;
//       console.log('🛑 Auto-sync stopped');
//     }
//     NetworkMonitorService.removeAllListeners();
//   }
// }

// export default new OfflineSyncService();
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkMonitorService from './NetworkMonitorService';
import OfflineDatabaseService from './OfflineDatabaseService';
import { refreshAccessToken } from './TokenService';
import axios from 'axios';

const serverUrl = 'https://demo2.bsl.co.ke/api/v1';

class OfflineSyncService {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
  }

  async startAutoSync() {
    console.log('🚀 Starting auto-sync service...');

    // Sync immediately if online
    if (await NetworkMonitorService.isOnline()) {
      console.log('📡 Online detected, running initial sync...');
      await this.syncAll();
    } else {
      console.log('📴 Offline detected, waiting for connection...');
    }

    // Set up interval to check for sync every 30 seconds
    this.syncInterval = setInterval(async () => {
      if (await NetworkMonitorService.isOnline() && !this.isSyncing) {
        console.log('⏰ Auto-sync timer triggered');
        await this.syncAll();
      }
    }, 30000);

    // Listen for online events (when connection is restored)
    NetworkMonitorService.on('online', async () => {
      console.log('🔄 Network online, auto-syncing...');
      await this.syncAll();
    });

    console.log('✅ Auto-sync service started (interval: 30s)');
  }

  async syncAll() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress...');
      return;
    }

    this.isSyncing = true;
    console.log('🔄 Starting offline data sync...');

    try {
      // 1. Sync pending seal replacement requests (outgoing)
      await this.syncPendingSealRequests();

      // 2. Sync other pending operations from queue
      await this.syncQueue();

      // 3. Sync fresh data from server (incoming) - ROLE BASED
      await this.syncFreshData();

      console.log('✅ Offline sync completed successfully');
    } catch (error) {
      console.error('❌ Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  async syncPendingSealRequests() {
    const pendingRequests = await OfflineDatabaseService.getPendingSealRequests();

    if (pendingRequests.length === 0) return;

    console.log(`📤 Syncing ${pendingRequests.length} pending seal requests...`);

    for (const request of pendingRequests) {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        const roleId = await AsyncStorage.getItem('roleId');

        const payload = {
          ticketId: request.ticketId,
          newSealNumber: request.newSealNumber,
          reason: request.reason,
          oldDeviceConditionId: request.oldDeviceConditionId,
        };

        // Only RRU users (role 102) can submit seal requests
        if (roleId === '102') {
          const response = await axios.post(
            `${serverUrl}/tickets/${request.ticketId}/seal-replacement/request`,
            payload,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.status === 200 || response.status === 201) {
            await OfflineDatabaseService.updateSealRequestSyncStatus(
              request.id,
              'SYNCED',
              response.data.id
            );
            console.log(`✅ Synced seal request for ticket ${request.ticketId}`);
          }
        } else {
          console.log(`⏭️ Skipping seal request sync - role ${roleId} not authorized`);
          await OfflineDatabaseService.updateSealRequestSyncStatus(request.id, 'SKIPPED');
        }
      } catch (error) {
        console.error(`❌ Failed to sync seal request ${request.id}:`, error.message);
        await OfflineDatabaseService.updateSealRequestSyncStatus(request.id, 'FAILED');

        // Add to retry queue
        await OfflineDatabaseService.addToSyncQueue(
          'SEAL_REQUEST',
          `/tickets/${request.ticketId}/seal-replacement/request`,
          payload
        );
      }
    }
  }

  async syncQueue() {
    const pendingItems = await OfflineDatabaseService.getPendingSyncItems();

    if (pendingItems.length === 0) return;

    console.log(`📤 Syncing ${pendingItems.length} pending queue items...`);

    for (const item of pendingItems) {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        const roleId = await AsyncStorage.getItem('roleId');

        let response;
        switch (item.operation) {
          case 'SEAL_REQUEST':
            // Only RRU users can submit seal requests
            if (roleId === '102') {
              response = await axios.post(
                `${serverUrl}${item.endpoint}`,
                item.data,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );
            } else {
              console.log(`⏭️ Skipping ${item.operation} - role ${roleId} not authorized`);
              await OfflineDatabaseService.markSyncItemComplete(item.id);
              continue;
            }
            break;
          
          // ✅ NEW: Handle CONFIRM_ARRIVAL
          case 'CONFIRM_ARRIVAL':
            console.log(`📤 Syncing CONFIRM_ARRIVAL for device: ${item.data?.deviceSerialNumber || 'unknown'}`);
            
            // Get language header
            const language = await AsyncStorage.getItem('userLanguage') || 'en';
            
            // Make sure the URL doesn't have double /api/v1
            const confirmUrl = `${serverUrl}/customs/confirm-arrival-v2`;
            
            response = await axios.post(
              confirmUrl,
              item.data, // { deviceSerialNumber, inspectionStatusId, remarks }
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept-Language': language,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            console.log(`✅ CONFIRM_ARRIVAL response status: ${response.status}`);
            break;
          
          case 'MARK_READ':
          case 'MARK_ATTENDED':
          case 'ASSIGN':
            // These are allowed for all roles
            response = await axios.post(
              `${serverUrl}${item.endpoint}`,
              item.data,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            break;
          
          default:
            console.log(`⚠️ Unknown operation type: ${item.operation}`);
            continue;
        }

        if (response && (response.status === 200 || response.status === 201)) {
          await OfflineDatabaseService.markSyncItemComplete(item.id);
          console.log(`✅ Synced queue item ${item.id} (${item.operation})`);
        } else if (response) {
          console.log(`⚠️ Unexpected status for ${item.operation}: ${response.status}`);
          // Keep in queue for retry
          await OfflineDatabaseService.markSyncItemFailed(item.id);
        }
      } catch (error) {
        console.error(`❌ Failed to sync queue item ${item.id}:`, error.message);
        
        // If it's a 500 error, keep it for retry
        if (error.response?.status === 500) {
          console.log(`⚠️ Server error (500), keeping item ${item.id} for retry`);
          await OfflineDatabaseService.markSyncItemFailed(item.id);
        } else if (error.response?.status === 401) {
          // Token expired, try to refresh
          console.log('🔐 Token expired, refreshing...');
          const newToken = await refreshAccessToken();
          if (newToken) {
            console.log('✅ Token refreshed, will retry on next sync');
            await OfflineDatabaseService.markSyncItemFailed(item.id);
          }
        } else {
          // Other errors, mark as failed
          await OfflineDatabaseService.markSyncItemFailed(item.id);
        }
      }
    }
  }

  async syncFreshData() {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const roleId = await AsyncStorage.getItem('roleId');

      console.log(`📥 Syncing fresh data for role: ${roleId}`);

      // Only RRU users (role 102) can access seal replacement requests
      if (roleId === '102') {
        console.log('📡 Syncing seal replacement requests (RRU role)...');
        const ticketsResponse = await axios.get(
          `${serverUrl}/tickets/seal-replacement/my-requests`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (ticketsResponse.data && ticketsResponse.data.content) {
          await OfflineDatabaseService.saveTickets(ticketsResponse.data.content);
          console.log(`✅ Synced ${ticketsResponse.data.content.length} seal replacement tickets`);
        }
      } else {
        console.log(`⏭️ Skipping seal-replacement sync - role ${roleId} not authorized (RRU only)`);
      }

      // Add other role-specific syncs here:
      // - Shipments for all roles
      // - Tickets for relevant roles
      // - Alerts for all roles
      // - Notifications for all roles

    } catch (error) {
      // Don't treat 403 as fatal error - it's expected for non-RRU roles
      if (error.response?.status === 403) {
        console.log('⚠️ Skipping unauthorized endpoint (expected for this role)');
      } else {
        console.error('❌ Failed to sync fresh data:', error.message);
      }
    }
  }

  // Process only pending actions (for manual sync button)
  async processPendingActions() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress...');
      return;
    }

    this.isSyncing = true;
    console.log('🔄 Processing pending actions only...');

    try {
      await this.syncPendingSealRequests();
      await this.syncQueue();
      console.log('✅ Pending actions processed successfully');
    } catch (error) {
      console.error('❌ Error processing pending actions:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 Auto-sync stopped');
    }
    NetworkMonitorService.removeAllListeners();
  }
}

export default new OfflineSyncService();
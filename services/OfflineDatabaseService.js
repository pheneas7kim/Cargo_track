import SQLite from 'react-native-sqlite-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Enable promise mode
SQLite.enablePromise(true);

class OfflineDatabaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initDatabase() {
    if (this.initialized) return;

    try {
      // Open database
      this.db = await SQLite.openDatabase({
        name: 'brisktrack_offline.db',
        location: 'default',
      });

      // Create tables
      await this.createTables();

      this.initialized = true;
      console.log('✅ Offline database initialized with SQLite');
    } catch (error) {
      console.error('❌ Database init error:', error);
    }
  }

  async createTables() {
    const queries = [
      // Tickets table
      `CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY,
        ticketNumber TEXT,
        title TEXT,
        description TEXT,
        priority TEXT,
        status TEXT,
        assignee TEXT,
        reporter TEXT,
        deviceSerialNumber TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        t1Number TEXT,
        truckRegistrationNumber TEXT,
        sealReplacementRequested INTEGER,
        sealReplacementApproved INTEGER,
        sealReplacementRejected INTEGER,
        sealReplacementReason TEXT,
        newSealNumber TEXT,
        syncStatus TEXT DEFAULT 'SYNCED'
      )`,

      // Seal replacement requests table
      `CREATE TABLE IF NOT EXISTS seal_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticketId INTEGER,
        newSealNumber TEXT,
        reason TEXT,
        oldDeviceConditionId INTEGER,
        status TEXT DEFAULT 'PENDING',
        createdAt TEXT,
        syncStatus TEXT DEFAULT 'PENDING',
        serverId INTEGER
      )`,

      // Devices table
      `CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY,
        serialNumber TEXT,
        name TEXT,
        status TEXT,
        lastSeen TEXT,
        location TEXT,
        batteryLevel INTEGER,
        syncStatus TEXT DEFAULT 'SYNCED'
      )`,

      // Stations table
      `CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY,
        name TEXT,
        description TEXT,
        stationType TEXT,
        centerLat REAL,
        centerLng REAL,
        radiusMeters REAL,
        fenceType TEXT,
        isActive INTEGER DEFAULT 1,
        routeStatus TEXT,
        colorHex TEXT,
        assignedRouteIds TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        syncStatus TEXT DEFAULT 'SYNCED'
      )`,

      // User data table
      `CREATE TABLE IF NOT EXISTS user_data (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt TEXT
      )`,

      // Sync queue
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT,
        endpoint TEXT,
        data TEXT,
        timestamp TEXT,
        retryCount INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        lastError TEXT
      )`
    ];

    for (const query of queries) {
      await this.executeQuery(query);
    }

    await this.createIndexes();
  }

  async createIndexes() {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_tickets_t1 ON tickets(t1Number)`,
      `CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status)`,
      `CREATE INDEX IF NOT EXISTS idx_stations_active ON stations(isActive)`
    ];

    for (const index of indexes) {
      try {
        await this.executeQuery(index);
      } catch (error) {
        console.warn('Index creation warning:', error);
      }
    }
  }

  async executeQuery(sql, params = []) {
    try {
      const results = await this.db.executeSql(sql, params);
      return {
        rows: {
          length: results[0].rows.length,
          item: (index) => results[0].rows.item(index),
          _array: results[0].rows.raw()
        },
        insertId: results[0].insertId,
        rowsAffected: results[0].rowsAffected
      };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  // ========== TICKET OPERATIONS ==========
  async saveTickets(tickets) {
    for (const ticket of tickets) {
      const query = `
        INSERT OR REPLACE INTO tickets (
          id, ticketNumber, title, description, priority, status,
          assignee, reporter, deviceSerialNumber, createdAt, updatedAt,
          t1Number, truckRegistrationNumber, sealReplacementRequested,
          sealReplacementApproved, sealReplacementRejected,
          sealReplacementReason, newSealNumber
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        ticket.id, ticket.ticketNumber, ticket.title, ticket.description,
        ticket.priority, ticket.status, JSON.stringify(ticket.assignee || {}),
        JSON.stringify(ticket.reporter || {}), ticket.deviceSerialNumber,
        ticket.createdAt, ticket.updatedAt, ticket.t1Number,
        ticket.truckRegistrationNumber, ticket.sealReplacementRequested ? 1 : 0,
        ticket.sealReplacementApproved ? 1 : 0, ticket.sealReplacementRejected ? 1 : 0,
        ticket.sealReplacementReason, ticket.newSealNumber
      ];

      await this.executeQuery(query, params);
    }
  }

  async getTickets(filterT1 = false) {
    let query = 'SELECT * FROM tickets ORDER BY createdAt DESC';
    if (filterT1) {
      query = 'SELECT * FROM tickets WHERE t1Number IS NOT NULL AND t1Number != "" ORDER BY createdAt DESC';
    }

    const results = await this.executeQuery(query);
    const tickets = [];
    for (let i = 0; i < results.rows.length; i++) {
      const ticket = results.rows.item(i);
      ticket.assignee = JSON.parse(ticket.assignee || '{}');
      ticket.reporter = JSON.parse(ticket.reporter || '{}');
      ticket.sealReplacementRequested = ticket.sealReplacementRequested === 1;
      ticket.sealReplacementApproved = ticket.sealReplacementApproved === 1;
      ticket.sealReplacementRejected = ticket.sealReplacementRejected === 1;
      tickets.push(ticket);
    }
    return tickets;
  }

  // ========== SEAL REQUEST OPERATIONS ==========
  async savePendingSealRequest(request) {
    const query = `
      INSERT INTO seal_requests (
        ticketId, newSealNumber, reason, oldDeviceConditionId,
        status, createdAt, syncStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      request.ticketId, request.newSealNumber, request.reason,
      request.oldDeviceConditionId, 'PENDING', new Date().toISOString(), 'PENDING'
    ];

    const result = await this.executeQuery(query, params);
    return result.insertId;
  }

  async getPendingSealRequests() {
    const query = 'SELECT * FROM seal_requests WHERE syncStatus = "PENDING"';
    const results = await this.executeQuery(query);
    const requests = [];
    for (let i = 0; i < results.rows.length; i++) {
      requests.push(results.rows.item(i));
    }
    return requests;
  }

  async updateSealRequestSyncStatus(id, status, serverId = null) {
    let query = 'UPDATE seal_requests SET syncStatus = ?';
    const params = [status];

    if (serverId) {
      query += ', serverId = ?';
      params.push(serverId);
    }
    query += ' WHERE id = ?';
    params.push(id);

    await this.executeQuery(query, params);
  }

  // ========== STATION OPERATIONS ==========
  async saveStations(stations) {
    for (const station of stations) {
      const query = `
        INSERT OR REPLACE INTO stations (
          id, name, description, stationType, centerLat, centerLng,
          radiusMeters, fenceType, isActive, routeStatus, colorHex,
          assignedRouteIds, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        station.id, station.name, station.description || '',
        station.stationType || 'STATION', station.centerLat || 0, station.centerLng || 0,
        station.radiusMeters || 0, station.fenceType || 'CIRCLE',
        station.isActive ? 1 : 0, station.routeStatus || 'ACTIVE',
        station.colorHex || '#FFA500', JSON.stringify(station.assignedRouteIds || []),
        station.createdAt || new Date().toISOString(),
        station.updatedAt || new Date().toISOString()
      ];

      await this.executeQuery(query, params);
    }
  }

  async getStations(activeOnly = false) {
    let query = 'SELECT * FROM stations ORDER BY name ASC';
    if (activeOnly) {
      query = 'SELECT * FROM stations WHERE isActive = 1 ORDER BY name ASC';
    }

    const results = await this.executeQuery(query);
    const stations = [];
    for (let i = 0; i < results.rows.length; i++) {
      const station = results.rows.item(i);
      station.assignedRouteIds = JSON.parse(station.assignedRouteIds || '[]');
      station.isActive = station.isActive === 1;
      stations.push(station);
    }
    return stations;
  }

  // ========== SYNC QUEUE OPERATIONS ==========
  async addToSyncQueue(operation, endpoint, data, retryCount = 0) {
    const query = `
      INSERT INTO sync_queue (operation, endpoint, data, timestamp, retryCount, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `;
    const params = [operation, endpoint, JSON.stringify(data), new Date().toISOString(), retryCount];
    const result = await this.executeQuery(query, params);
    return result.insertId;
  }

  async getPendingSyncItems() {
    const query = 'SELECT * FROM sync_queue WHERE status = "PENDING" ORDER BY timestamp ASC';
    const results = await this.executeQuery(query);
    const items = [];
    for (let i = 0; i < results.rows.length; i++) {
      const item = results.rows.item(i);
      try {
        item.data = JSON.parse(item.data);
      } catch (e) {
        item.data = {};
      }
      items.push(item);
    }
    return items;
  }

  async markSyncItemComplete(id) {
    await this.executeQuery('UPDATE sync_queue SET status = "COMPLETED" WHERE id = ?', [id]);
  }

  async markSyncItemFailed(id, errorMessage = null) {
    const query = `
      UPDATE sync_queue
      SET status = "FAILED", retryCount = retryCount + 1, lastError = ?
      WHERE id = ?
    `;
    await this.executeQuery(query, [errorMessage, id]);
  }

  async clearCompletedSyncItems() {
    await this.executeQuery('DELETE FROM sync_queue WHERE status = "COMPLETED"');
  }

  // ========== USER DATA OPERATIONS ==========
  async saveUserData(key, value) {
    const query = `
      INSERT OR REPLACE INTO user_data (key, value, updatedAt)
      VALUES (?, ?, ?)
    `;
    await this.executeQuery(query, [key, JSON.stringify(value), new Date().toISOString()]);
  }

  async getUserData(key) {
    const query = 'SELECT value FROM user_data WHERE key = ?';
    const results = await this.executeQuery(query, [key]);
    if (results.rows.length > 0) {
      try {
        return JSON.parse(results.rows.item(0).value);
      } catch (e) {
        return results.rows.item(0).value;
      }
    }
    return null;
  }

  async deleteUserData(key) {
    await this.executeQuery('DELETE FROM user_data WHERE key = ?', [key]);
  }

  // ========== CLEAR ALL DATA ==========
  async clearAllData() {
    const tables = ['tickets', 'seal_requests', 'devices', 'stations', 'user_data', 'sync_queue'];
    for (const table of tables) {
      try {
        await this.executeQuery(`DELETE FROM ${table}`);
        console.log(`✅ Cleared table: ${table}`);
      } catch (error) {
        console.warn(`Could not clear table ${table}:`, error);
      }
    }
    console.log('✅ All offline data cleared');
  }

  // ========== UTILITY METHODS ==========
  async getDatabaseStats() {
    const stats = {};
    const tables = ['tickets', 'stations', 'sync_queue'];

    for (const table of tables) {
      try {
        const result = await this.executeQuery(`SELECT COUNT(*) as count FROM ${table}`);
        if (result.rows.length > 0) {
          stats[table] = result.rows.item(0).count;
        }
      } catch (error) {
        stats[table] = 0;
      }
    }

    return stats;
  }
}

export default new OfflineDatabaseService();
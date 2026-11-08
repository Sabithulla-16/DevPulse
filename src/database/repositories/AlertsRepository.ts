import type { Database as SqlDatabase } from 'sql.js';
import type { AlertItem } from '../../shared/types';
import { randomUUID } from 'node:crypto';

export class AlertsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  insert(alert: Omit<AlertItem, 'id' | 'acknowledged'>): AlertItem {
    const id = randomUUID();
    const item: AlertItem = {
      ...alert,
      id,
      acknowledged: false
    };

    try {
      const db = this.getDb();
      db.run(
        'INSERT INTO alerts (id, timestamp, severity, collector_id, title, message, acknowledged) VALUES (?, ?, ?, ?, ?, ?, 0)',
        [id, alert.timestamp, alert.severity, alert.collectorId, alert.title, alert.message]
      );
    } catch (err) {
      console.warn('[DevPulse AlertsRepository] Insert alert skipped:', err);
    }

    return item;
  }

  upsertModuleAlert(alert: Omit<AlertItem, 'id' | 'acknowledged'>): AlertItem {
    try {
      const db = this.getDb();
      // Check if an unacknowledged alert for this collector and title already exists
      const checkStmt = db.prepare(
        'SELECT id FROM alerts WHERE collector_id = ? AND title = ? AND acknowledged = 0 ORDER BY timestamp DESC LIMIT 1'
      );
      checkStmt.bind([alert.collectorId, alert.title]);
      let existingId: string | null = null;
      if (checkStmt.step()) {
        existingId = String(checkStmt.getAsObject().id);
      }
      checkStmt.free();

      if (existingId) {
        db.run('UPDATE alerts SET timestamp = ?, severity = ?, message = ? WHERE id = ?', [
          alert.timestamp,
          alert.severity,
          alert.message,
          existingId
        ]);
        return {
          id: existingId,
          timestamp: alert.timestamp,
          severity: alert.severity,
          collectorId: alert.collectorId,
          title: alert.title,
          message: alert.message,
          acknowledged: false
        };
      }
    } catch (err) {
      console.warn('[DevPulse AlertsRepository] Upsert alert check failed:', err);
    }

    return this.insert(alert);
  }

  acknowledgeAll(): boolean {
    try {
      const db = this.getDb();
      db.run('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0');
      return true;
    } catch {
      return false;
    }
  }

  getRecent(limit = 20, unacknowledgedOnly = false): AlertItem[] {
    try {
      const db = this.getDb();
      const query = unacknowledgedOnly
        ? 'SELECT id, timestamp, severity, collector_id, title, message, acknowledged FROM alerts WHERE acknowledged = 0 ORDER BY timestamp DESC LIMIT ?'
        : 'SELECT id, timestamp, severity, collector_id, title, message, acknowledged FROM alerts ORDER BY timestamp DESC LIMIT ?';

      const stmt = db.prepare(query);
      stmt.bind([limit]);

      const alerts: AlertItem[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        alerts.push({
          id: String(row.id),
          timestamp: Number(row.timestamp),
          severity: String(row.severity) as AlertItem['severity'],
          collectorId: String(row.collector_id),
          title: String(row.title),
          message: String(row.message),
          acknowledged: Number(row.acknowledged) === 1
        });
      }
      stmt.free();
      return alerts;
    } catch {
      return [];
    }
  }

  acknowledge(id: string): boolean {
    try {
      const db = this.getDb();
      db.run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM alerts');
    } catch (err) {
      console.warn('[DevPulse AlertsRepository] Clear failed:', err);
    }
  }
}

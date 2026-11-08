import type { Database as SqlDatabase } from 'sql.js';
import type { MetricEvent } from '../../shared/types';

export class MetricEventsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  insert(event: MetricEvent): void {
    try {
      const db = this.getDb();
      db.run(
        'INSERT OR IGNORE INTO metric_events (id, collector_id, event_type, timestamp, payload_json) VALUES (?, ?, ?, ?, ?)',
        [event.id, event.collectorId, event.type, event.timestamp, JSON.stringify(event.payload)]
      );
    } catch (err) {
      console.warn('[DevPulse MetricEventsRepository] Insert event skipped (DB not ready):', err);
    }
  }

  insertBatch(events: MetricEvent[]): void {
    if (events.length === 0) return;
    try {
      const db = this.getDb();
      db.run('BEGIN TRANSACTION');
      try {
        for (const event of events) {
          db.run(
            'INSERT OR IGNORE INTO metric_events (id, collector_id, event_type, timestamp, payload_json) VALUES (?, ?, ?, ?, ?)',
            [event.id, event.collectorId, event.type, event.timestamp, JSON.stringify(event.payload)]
          );
        }
        db.run('COMMIT');
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    } catch (err) {
      console.warn('[DevPulse MetricEventsRepository] Insert batch skipped:', err);
    }
  }

  getRecent(limit = 50, collectorId?: string): MetricEvent[] {
    try {
      const db = this.getDb();
      const query = collectorId
        ? 'SELECT id, collector_id, event_type, timestamp, payload_json FROM metric_events WHERE collector_id = ? ORDER BY timestamp DESC LIMIT ?'
        : 'SELECT id, collector_id, event_type, timestamp, payload_json FROM metric_events ORDER BY timestamp DESC LIMIT ?';

      const stmt = db.prepare(query);
      if (collectorId) {
        stmt.bind([collectorId, limit]);
      } else {
        stmt.bind([limit]);
      }

      const events: MetricEvent[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        let payload: unknown = {};
        try {
          payload = JSON.parse(String(row.payload_json));
        } catch {
          payload = {};
        }
        events.push({
          id: String(row.id),
          collectorId: String(row.collector_id),
          type: String(row.event_type),
          timestamp: Number(row.timestamp),
          payload
        });
      }
      stmt.free();
      return events;
    } catch {
      return [];
    }
  }

  count(): number {
    try {
      const db = this.getDb();
      const res = db.exec('SELECT COUNT(*) FROM metric_events');
      if (res.length > 0 && res[0].values.length > 0) {
        return Number(res[0].values[0][0]);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM metric_events');
    } catch (err) {
      console.warn('[DevPulse MetricEventsRepository] Clear failed:', err);
    }
  }
}

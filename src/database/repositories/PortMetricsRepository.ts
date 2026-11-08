import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type { PortInfo } from '../../shared/types';

export class PortMetricsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveSnapshot(ports: PortInfo[], timestamp = Date.now()): void {
    this.insertBatch(ports, timestamp);
  }

  insertBatch(ports: PortInfo[], timestamp = Date.now()): void {
    try {
      const db = this.getDb();
      db.run('BEGIN TRANSACTION');
      try {
        for (const p of ports) {
          db.run(
            `INSERT INTO port_metrics (
              id, timestamp, port, state, pid, process_name
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              timestamp,
              p.port,
              p.state,
              p.pid ?? null,
              p.processName ?? null
            ]
          );
        }
        db.run('COMMIT');
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    } catch (err) {
      console.warn('[DevPulse PortMetricsRepository] Insert batch failed:', err);
    }
  }

  getLatest(): PortInfo[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT port, state, pid, process_name
         FROM port_metrics
         WHERE timestamp = (SELECT MAX(timestamp) FROM port_metrics)`
      );

      const ports: PortInfo[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        ports.push({
          port: Number(row.port),
          state: String(row.state) as 'LISTENING' | 'CLOSED',
          pid: row.pid ? Number(row.pid) : undefined,
          processName: row.process_name ? String(row.process_name) : undefined
        });
      }
      stmt.free();
      return ports;
    } catch {
      return [];
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM port_metrics');
    } catch (err) {
      console.warn('[DevPulse PortMetricsRepository] Clear failed:', err);
    }
  }
}

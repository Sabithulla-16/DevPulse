import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type { ProcessInfo } from '../../shared/types';

export class ProcessMetricsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveSnapshot(processes: ProcessInfo[], timestamp = Date.now()): void {
    this.insertBatch(processes, timestamp);
  }

  insertBatch(processes: ProcessInfo[], timestamp = Date.now()): void {
    try {
      const db = this.getDb();
      db.run('BEGIN TRANSACTION');
      try {
        for (const proc of processes) {
          db.run(
            `INSERT INTO process_metrics (
              id, timestamp, pid, name, cpu_percent, memory_bytes, memory_percent
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              timestamp,
              proc.pid,
              proc.name,
              proc.cpuPercent,
              proc.memoryBytes,
              proc.memoryPercent
            ]
          );
        }
        db.run('COMMIT');
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    } catch (err) {
      console.warn('[DevPulse ProcessMetricsRepository] Insert batch failed:', err);
    }
  }

  getLatest(limit = 30): ProcessInfo[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT pid, name, cpu_percent, memory_bytes, memory_percent
         FROM process_metrics
         WHERE timestamp = (SELECT MAX(timestamp) FROM process_metrics)
         ORDER BY cpu_percent DESC
         LIMIT ?`
      );
      stmt.bind([limit]);

      const procs: ProcessInfo[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        procs.push({
          pid: Number(row.pid),
          name: String(row.name),
          cpuPercent: Number(row.cpu_percent),
          memoryBytes: Number(row.memory_bytes),
          memoryPercent: Number(row.memory_percent)
        });
      }
      stmt.free();
      return procs;
    } catch {
      return [];
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM process_metrics');
    } catch (err) {
      console.warn('[DevPulse ProcessMetricsRepository] Clear failed:', err);
    }
  }
}

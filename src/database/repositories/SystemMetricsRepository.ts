import type { Database as SqlDatabase } from 'sql.js';
import type { SystemMetricRecord, SystemSnapshot } from '../../shared/types';
import { randomUUID } from 'node:crypto';

export class SystemMetricsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  insert(snapshot: SystemSnapshot, timestamp = Date.now()): SystemMetricRecord {
    const id = randomUUID();
    const record: SystemMetricRecord = {
      id,
      timestamp,
      cpuPercent: snapshot.cpuPercent,
      memoryTotalBytes: snapshot.memoryTotalBytes,
      memoryUsedBytes: snapshot.memoryUsedBytes,
      memoryFreeBytes: snapshot.memoryFreeBytes,
      memoryUsedPercent: snapshot.memoryUsedPercent,
      uptimeSeconds: snapshot.uptimeSeconds
    };

    try {
      const db = this.getDb();
      db.run(
        `INSERT INTO system_metrics (
          id, timestamp, cpu_percent, memory_total_bytes, memory_used_bytes, memory_free_bytes, memory_used_percent, uptime_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          timestamp,
          snapshot.cpuPercent,
          snapshot.memoryTotalBytes,
          snapshot.memoryUsedBytes,
          snapshot.memoryFreeBytes,
          snapshot.memoryUsedPercent,
          snapshot.uptimeSeconds
        ]
      );
    } catch (err) {
      console.warn('[DevPulse SystemMetricsRepository] Insert snapshot skipped:', err);
    }

    return record;
  }

  getRecent(limit = 60): SystemMetricRecord[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT id, timestamp, cpu_percent, memory_total_bytes, memory_used_bytes, memory_free_bytes, memory_used_percent, uptime_seconds
         FROM system_metrics
         ORDER BY timestamp DESC
         LIMIT ?`
      );
      stmt.bind([limit]);

      const records: SystemMetricRecord[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        records.push({
          id: String(row.id),
          timestamp: Number(row.timestamp),
          cpuPercent: Number(row.cpu_percent),
          memoryTotalBytes: Number(row.memory_total_bytes),
          memoryUsedBytes: Number(row.memory_used_bytes),
          memoryFreeBytes: Number(row.memory_free_bytes),
          memoryUsedPercent: Number(row.memory_used_percent),
          uptimeSeconds: Number(row.uptime_seconds)
        });
      }
      stmt.free();
      return records.reverse();
    } catch {
      return [];
    }
  }

  getLatest(): SystemMetricRecord | null {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT id, timestamp, cpu_percent, memory_total_bytes, memory_used_bytes, memory_free_bytes, memory_used_percent, uptime_seconds
         FROM system_metrics
         ORDER BY timestamp DESC
         LIMIT 1`
      );
      let record: SystemMetricRecord | null = null;
      if (stmt.step()) {
        const row = stmt.getAsObject();
        record = {
          id: String(row.id),
          timestamp: Number(row.timestamp),
          cpuPercent: Number(row.cpu_percent),
          memoryTotalBytes: Number(row.memory_total_bytes),
          memoryUsedBytes: Number(row.memory_used_bytes),
          memoryFreeBytes: Number(row.memory_free_bytes),
          memoryUsedPercent: Number(row.memory_used_percent),
          uptimeSeconds: Number(row.uptime_seconds)
        };
      }
      stmt.free();
      return record;
    } catch {
      return null;
    }
  }

  getAverages(sinceTimestamp: number): { avgCpu: number; avgMemory: number; sampleCount: number } {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT AVG(cpu_percent) as avg_cpu, AVG(memory_used_percent) as avg_mem, COUNT(*) as cnt
         FROM system_metrics
         WHERE timestamp >= ?`
      );
      stmt.bind([sinceTimestamp]);
      let result = { avgCpu: 0, avgMemory: 0, sampleCount: 0 };
      if (stmt.step()) {
        const row = stmt.getAsObject();
        result = {
          avgCpu: Number(row.avg_cpu ?? 0),
          avgMemory: Number(row.avg_mem ?? 0),
          sampleCount: Number(row.cnt ?? 0)
        };
      }
      stmt.free();
      return result;
    } catch {
      return { avgCpu: 0, avgMemory: 0, sampleCount: 0 };
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM system_metrics');
    } catch (err) {
      console.warn('[DevPulse SystemMetricsRepository] Clear failed:', err);
    }
  }
}

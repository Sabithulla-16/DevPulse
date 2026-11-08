import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type { DiskSnapshot } from '../../shared/types';

export class DiskMetricsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  insert(disk: DiskSnapshot, timestamp = Date.now()): void {
    try {
      const db = this.getDb();
      db.run(
        `INSERT INTO disk_metrics (
          id, timestamp, fs, mount, total_bytes, used_bytes, free_bytes, used_percent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          timestamp,
          disk.fs,
          disk.mount,
          disk.totalBytes,
          disk.usedBytes,
          disk.freeBytes,
          disk.usedPercent
        ]
      );
    } catch (err) {
      console.warn('[DevPulse DiskMetricsRepository] Insert disk metric failed:', err);
    }
  }

  insertBatch(disks: DiskSnapshot[], timestamp = Date.now()): void {
    for (const disk of disks) {
      this.insert(disk, timestamp);
    }
  }

  saveSnapshots(disks: DiskSnapshot[], timestamp = Date.now()): void {
    this.insertBatch(disks, timestamp);
  }

  getLatest(): DiskSnapshot[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT fs, mount, total_bytes, used_bytes, free_bytes, used_percent
         FROM disk_metrics
         WHERE timestamp = (SELECT MAX(timestamp) FROM disk_metrics)`
      );

      const disks: DiskSnapshot[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        disks.push({
          fs: String(row.fs),
          mount: String(row.mount),
          type: 'Local',
          totalBytes: Number(row.total_bytes),
          usedBytes: Number(row.used_bytes),
          freeBytes: Number(row.free_bytes),
          usedPercent: Number(row.used_percent)
        });
      }
      stmt.free();
      return disks;
    } catch {
      return [];
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM disk_metrics');
    } catch (err) {
      console.warn('[DevPulse DiskMetricsRepository] Clear failed:', err);
    }
  }
}

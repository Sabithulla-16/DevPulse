import * as fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as si from 'systeminformation';
import type { Collector } from '../../core/Collector';
import type { CollectorStatus, DiskSnapshot, MetricEvent } from '../../shared/types';
import type { Database } from '../../database/Database';

export class DiskCollector implements Collector {
  readonly id = 'disk';
  readonly name = 'Disk Storage';
  readonly description = 'Monitors host physical drive capacity, used storage, and available volume space.';
  readonly category = 'system' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private lastCollectedAt?: number;
  private sampleCount = 0;
  private latestDisks: DiskSnapshot[] = [];

  constructor(private readonly database?: Database) {}

  async initialize(): Promise<void> {
    this.state = 'idle';
    if (this.database) {
      this.latestDisks = this.database.diskMetrics.getLatest();
    }
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.state = 'paused';
  }

  async collect(): Promise<MetricEvent<DiskSnapshot[]>[]> {
    if (this.state !== 'running') {
      return [];
    }

    const disks: DiskSnapshot[] = [];

    // Attempt systeminformation.fsSize()
    try {
      const fsData = await si.fsSize();
      if (Array.isArray(fsData) && fsData.length > 0) {
        for (const d of fsData) {
          if (d.size > 0) {
            disks.push({
              fs: d.fs || d.mount,
              mount: d.mount,
              type: d.type || 'Fixed',
              totalBytes: d.size,
              usedBytes: d.used,
              freeBytes: d.available,
              usedPercent: Math.round(d.use * 10) / 10
            });
          }
        }
      }
    } catch {
      // Fallback to fs.statfs
    }

    // Fallback if systeminformation returned empty
    if (disks.length === 0) {
      const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
      try {
        const stats = await fsp.statfs(rootPath);
        const total = stats.bsize * stats.blocks;
        const free = stats.bsize * stats.bavail;
        const used = total - free;
        const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

        disks.push({
          fs: rootPath,
          mount: rootPath,
          type: 'Local Drive',
          totalBytes: total,
          usedBytes: used,
          freeBytes: free,
          usedPercent
        });
      } catch {
        // Unable to sample disk
      }
    }

    this.latestDisks = disks;
    const now = Date.now();
    this.lastCollectedAt = now;
    this.sampleCount++;

    if (this.database && disks.length > 0) {
      this.database.diskMetrics.insertBatch(disks, now);
    }

    return [
      {
        id: randomUUID(),
        collectorId: this.id,
        type: 'disk.snapshot',
        timestamp: now,
        payload: disks
      }
    ];
  }

  getStatus(): CollectorStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: true,
      state: this.state,
      implemented: this.implemented,
      lastCollectedAt: this.lastCollectedAt,
      sampleCount: this.sampleCount
    };
  }

  getLatestDisks(): DiskSnapshot[] {
    return this.latestDisks;
  }
}

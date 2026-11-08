import { randomUUID } from 'node:crypto';
import * as si from 'systeminformation';
import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent, ProcessInfo } from '../../shared/types';
import type { Database } from '../../database/Database';
import { ProcessManager } from '../../services/ProcessManager';
import type { PortCollector } from '../port/PortCollector';

export class ProcessCollector implements Collector {
  readonly id = 'process';
  readonly name = 'Process Intelligence';
  readonly description = 'Monitors active operating system processes, memory footprints, and CPU usage.';
  readonly category = 'system' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private lastCollectedAt?: number;
  private sampleCount = 0;
  private latestProcesses: ProcessInfo[] = [];
  private portCollector?: PortCollector;

  constructor(private readonly database?: Database) {}

  setPortCollector(portCollector: PortCollector): void {
    this.portCollector = portCollector;
  }

  async initialize(): Promise<void> {
    this.state = 'idle';
    if (this.database) {
      this.latestProcesses = this.database.processMetrics.getLatest(30);
    }
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.state = 'paused';
  }

  async collect(): Promise<MetricEvent<ProcessInfo[]>[]> {
    if (this.state !== 'running') {
      return [];
    }

    const procs: ProcessInfo[] = [];

    try {
      const data = await si.processes();
      if (data && Array.isArray(data.list)) {
        // Filter out idle system processes with PID 0 and sort by CPU/memory
        const activeList = data.list
          .filter(p => p.pid > 0 && p.name && p.name !== 'System Idle Process')
          .sort((a, b) => b.cpu - a.cpu || b.memRss - a.memRss)
          .slice(0, 50);

        for (const p of activeList) {
          const associatedPorts = this.portCollector ? this.portCollector.getPortsForPid(p.pid) : [];
          procs.push({
            pid: p.pid,
            name: p.name,
            cpuPercent: Math.round(p.cpu * 10) / 10,
            memoryBytes: (p.memRss ?? 0) * 1024, // memRss is in KB
            memoryPercent: Math.round((p.mem ?? 0) * 10) / 10,
            started: p.started,
            ports: associatedPorts.length > 0 ? associatedPorts : undefined,
            isProtected: ProcessManager.isProtected(p.pid, p.name)
          });
        }
      }
    } catch (err) {
      console.warn('[DevPulse ProcessCollector] Failed to sample processes:', err);
    }

    this.latestProcesses = procs;
    const now = Date.now();
    this.lastCollectedAt = now;
    this.sampleCount++;

    if (this.database && procs.length > 0) {
      this.database.processMetrics.insertBatch(procs.slice(0, 30), now);
    }

    return [
      {
        id: randomUUID(),
        collectorId: this.id,
        type: 'process.snapshot',
        timestamp: now,
        payload: procs
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

  getLatestProcesses(): ProcessInfo[] {
    return this.latestProcesses;
  }
}

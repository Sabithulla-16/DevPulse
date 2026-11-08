import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import si from 'systeminformation';
import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent, SystemSnapshot, GpuSnapshot } from '../../shared/types';
import { calculateCpuUtilization, calculateMemoryStats } from './systemUtils';

export class SystemCollector implements Collector {
  readonly id = 'system';
  readonly name = 'System Intelligence';
  readonly description = 'Monitors host CPU utilization, RAM consumption, and system uptime.';
  readonly category = 'system' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private previousCpu = os.cpus();
  private sampleCount = 0;
  private lastCollectedAt?: number;

  async initialize(): Promise<void> {
    this.previousCpu = os.cpus();
    this.state = 'idle';
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.state = 'paused';
  }

  async collect(): Promise<MetricEvent<SystemSnapshot>[]> {
    if (this.state !== 'running') {
      return [];
    }

    const currentCpu = os.cpus();
    const cpuPercent = calculateCpuUtilization(this.previousCpu, currentCpu);
    this.previousCpu = currentCpu;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memStats = calculateMemoryStats(totalMem, freeMem);

    let gpuSnapshot: GpuSnapshot | null = null;
    try {
      const graphics = await si.graphics();
      if (graphics && graphics.controllers && graphics.controllers.length > 0) {
        const ctrl =
          graphics.controllers.find(c => c.utilizationGpu !== undefined) ||
          graphics.controllers.find(c => (c.vram || 0) > 512) ||
          graphics.controllers[0];
        if (ctrl) {
          gpuSnapshot = {
            model: ctrl.model || ctrl.name || 'Generic GPU',
            vendor: ctrl.vendor || 'Unknown Vendor',
            vramMb: ctrl.vram || (ctrl.memoryTotal ? Math.round(ctrl.memoryTotal) : 0),
            utilizationGpuPercent: ctrl.utilizationGpu ?? 0,
            memoryUsedMb: ctrl.memoryUsed ? Math.round(ctrl.memoryUsed) : undefined,
            memoryTotalMb: ctrl.memoryTotal ? Math.round(ctrl.memoryTotal) : undefined,
            temperatureC: ctrl.temperatureGpu
          };
        }
      }
    } catch {
      // Graceful fallback if GPU statistics unavailable
    }

    const snapshot: SystemSnapshot = {
      cpuPercent,
      memoryTotalBytes: memStats.totalBytes,
      memoryFreeBytes: memStats.freeBytes,
      memoryUsedBytes: memStats.usedBytes,
      memoryUsedPercent: memStats.usedPercent,
      uptimeSeconds: os.uptime(),
      cpuModel: currentCpu[0]?.model ?? 'Unknown CPU',
      cpuCores: currentCpu.length,
      gpu: gpuSnapshot
    };

    const now = Date.now();
    this.lastCollectedAt = now;
    this.sampleCount++;

    return [
      {
        id: randomUUID(),
        collectorId: this.id,
        type: 'system.snapshot',
        timestamp: now,
        payload: snapshot
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
}

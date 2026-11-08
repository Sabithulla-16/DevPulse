import type { AlertItem, MetricEvent, SystemSnapshot, DiskSnapshot, ProcessInfo } from '../shared/types';
import type { Database } from '../database/Database';

export class AlertEngine {
  private lastAlertTimes = new Map<string, number>();
  private cooldownMs = 60000; // 1 minute default cooldown

  constructor(private readonly database: Database) {}

  setCooldown(seconds: number): void {
    this.cooldownMs = Math.max(10000, seconds * 1000);
  }

  processEvent(event: MetricEvent): AlertItem | null {
    if (event.type === 'system.snapshot') {
      const snapshot = event.payload as SystemSnapshot;
      return this.checkSystemThresholds(snapshot);
    }

    if (event.type === 'disk.snapshot') {
      const disks = event.payload as DiskSnapshot[];
      return this.checkDiskThresholds(disks);
    }

    if (event.type === 'process.snapshot') {
      const procs = event.payload as ProcessInfo[];
      return this.checkProcessThresholds(procs);
    }

    return null;
  }

  private checkSystemThresholds(snapshot: SystemSnapshot): AlertItem | null {
    const now = Date.now();

    if (snapshot.cpuPercent >= 90) {
      const key = 'high_cpu';
      const last = this.lastAlertTimes.get(key) ?? 0;
      if (now - last > this.cooldownMs) {
        this.lastAlertTimes.set(key, now);
        return this.database.alerts.upsertModuleAlert({
          timestamp: now,
          severity: snapshot.cpuPercent >= 95 ? 'critical' : 'warning',
          collectorId: 'system',
          title: 'High CPU Utilization',
          message: `CPU load reached ${snapshot.cpuPercent.toFixed(1)}%.`
        });
      }
    }

    if (snapshot.memoryUsedPercent >= 90) {
      const key = 'high_memory';
      const last = this.lastAlertTimes.get(key) ?? 0;
      if (now - last > this.cooldownMs) {
        this.lastAlertTimes.set(key, now);
        return this.database.alerts.upsertModuleAlert({
          timestamp: now,
          severity: snapshot.memoryUsedPercent >= 95 ? 'critical' : 'warning',
          collectorId: 'system',
          title: 'High Memory Usage',
          message: `System RAM usage reached ${snapshot.memoryUsedPercent.toFixed(1)}%.`
        });
      }
    }

    return null;
  }

  private checkDiskThresholds(disks: DiskSnapshot[]): AlertItem | null {
    const now = Date.now();
    for (const d of disks) {
      if (d.usedPercent >= 90) {
        const key = `high_disk_${d.mount}`;
        const last = this.lastAlertTimes.get(key) ?? 0;
        if (now - last > this.cooldownMs) {
          this.lastAlertTimes.set(key, now);
          return this.database.alerts.upsertModuleAlert({
            timestamp: now,
            severity: d.usedPercent >= 95 ? 'critical' : 'warning',
            collectorId: 'disk',
            title: `Low Disk Space on ${d.mount}`,
            message: `Drive ${d.mount} is ${d.usedPercent.toFixed(1)}% full.`
          });
        }
      }
    }
    return null;
  }

  private checkProcessThresholds(procs: ProcessInfo[]): AlertItem | null {
    const now = Date.now();
    for (const p of procs) {
      // Alert if a process consumes > 2.5 GB RAM
      if (p.memoryBytes > 2.5 * 1024 * 1024 * 1024) {
        const key = `high_proc_mem_${p.name}`;
        const last = this.lastAlertTimes.get(key) ?? 0;
        if (now - last > this.cooldownMs * 5) {
          this.lastAlertTimes.set(key, now);
          const gb = (p.memoryBytes / (1024 * 1024 * 1024)).toFixed(1);
          return this.database.alerts.upsertModuleAlert({
            timestamp: now,
            severity: 'warning',
            collectorId: 'process',
            title: `High Memory Process: ${p.name}`,
            message: `Process ${p.name} (PID ${p.pid}) is consuming ${gb} GB RAM.`
          });
        }
      }
    }
    return null;
  }
}

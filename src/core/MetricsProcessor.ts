import type { Database } from '../database/Database';
import type { AlertEngine } from './AlertEngine';
import type {
  MetricEvent,
  SystemSnapshot,
  SystemMetricRecord,
  DiskSnapshot,
  ProcessInfo,
  PortInfo,
  SystemExtendedData
} from '../shared/types';

export class MetricsProcessor {
  private latestSystemSnapshot: SystemSnapshot | null = null;
  private peakCpu = 0;

  constructor(
    private readonly database: Database,
    private readonly alertEngine: AlertEngine
  ) {}

  process(event: MetricEvent): void {
    // 1. Insert into general metric_events
    this.database.metricEvents.insert(event);

    // 2. Specialized processing
    if (event.type === 'system.snapshot' && event.payload) {
      const snapshot = event.payload as SystemSnapshot;
      this.latestSystemSnapshot = snapshot;
      if (snapshot.cpuPercent > this.peakCpu) {
        this.peakCpu = snapshot.cpuPercent;
      }
      this.database.systemMetrics.insert(snapshot, event.timestamp);
    }

    // 3. Alerts evaluation
    this.alertEngine.processEvent(event);

    // 4. Batch/schedule disk persistence
    this.database.schedulePersist();
  }

  getLatestSystemSnapshot(): SystemSnapshot | null {
    if (this.latestSystemSnapshot) {
      return this.latestSystemSnapshot;
    }
    const latestRecord = this.database.systemMetrics.getLatest();
    if (!latestRecord) return null;
    return {
      cpuPercent: latestRecord.cpuPercent,
      memoryTotalBytes: latestRecord.memoryTotalBytes,
      memoryUsedBytes: latestRecord.memoryUsedBytes,
      memoryFreeBytes: latestRecord.memoryFreeBytes,
      memoryUsedPercent: latestRecord.memoryUsedPercent,
      uptimeSeconds: latestRecord.uptimeSeconds
    };
  }

  getSystemHistory(limit = 60): SystemMetricRecord[] {
    return this.database.systemMetrics.getRecent(limit);
  }

  getExtendedSystemData(intervalSeconds: number, monitoring: boolean): SystemExtendedData {
    const current = this.getLatestSystemSnapshot();
    const history = this.getSystemHistory(60);

    const averages = this.database.systemMetrics.getAverages(Date.now() - 3600000); // Past 1 hour
    const disks = this.database.diskMetrics.getLatest();
    const topProcesses = this.database.processMetrics.getLatest(30);
    const activePorts = this.database.portMetrics.getLatest();

    return {
      current,
      history,
      intervalSeconds,
      monitoring,
      cpuStats: {
        current: current?.cpuPercent ?? 0,
        average: Math.round(averages.avgCpu * 10) / 10,
        peak: Math.round(this.peakCpu * 10) / 10
      },
      disks,
      topProcesses,
      activePorts
    };
  }
}

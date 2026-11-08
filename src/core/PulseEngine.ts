import type { Collector } from './Collector';
import { CollectorRegistry } from './CollectorRegistry';
import { EventBus } from './EventBus';
import { Scheduler } from './Scheduler';
import { EventNormalizer } from './EventNormalizer';
import { MetricsProcessor } from './MetricsProcessor';
import { AlertEngine } from './AlertEngine';
import type { Database } from '../database/Database';
import type {
  AlertItem,
  CollectorStatus,
  MetricEvent,
  SystemMetricRecord,
  SystemSnapshot,
  SystemExtendedData,
  FileIntelligenceData
} from '../shared/types';
import type { FilesystemCollector } from '../collectors/filesystem/FilesystemCollector';
import type { DiskCollector } from '../collectors/disk/DiskCollector';
import type { ProcessCollector } from '../collectors/process/ProcessCollector';
import type { PortCollector } from '../collectors/port/PortCollector';

export class PulseEngine {
  readonly registry = new CollectorRegistry();
  readonly events = new EventBus();
  readonly normalizer = new EventNormalizer();
  readonly alertEngine: AlertEngine;
  readonly processor: MetricsProcessor;
  readonly scheduler: Scheduler;

  constructor(
    readonly database: Database,
    intervalMs: number
  ) {
    this.alertEngine = new AlertEngine(this.database);
    this.processor = new MetricsProcessor(this.database, this.alertEngine);
    this.scheduler = new Scheduler(intervalMs, () => this.tick());
  }

  async initialize(collectors: Collector[]): Promise<void> {
    await this.database.initialize();
    for (const collector of collectors) {
      this.registry.register(collector);
    }
    await this.registry.initializeAll();
  }

  async start(): Promise<void> {
    if (this.scheduler.isRunning()) return;
    await this.registry.startAll();
    this.scheduler.start();
    await this.scheduler.trigger();
  }

  async pause(): Promise<void> {
    this.scheduler.stop();
    await this.registry.stopAll();
  }

  async refresh(): Promise<void> {
    await this.scheduler.trigger();
  }

  setSampleInterval(intervalSeconds: number): void {
    this.scheduler.setInterval(intervalSeconds * 1000);
  }

  getStatuses(): CollectorStatus[] {
    return this.registry.getStatuses();
  }

  isRunning(): boolean {
    return this.scheduler.isRunning();
  }

  getCollector<T extends Collector>(id: string): T | undefined {
    return this.registry.get(id) as T | undefined;
  }

  getRecentEvents(limit = 50, collectorId?: string): MetricEvent[] {
    return this.database.metricEvents.getRecent(limit, collectorId);
  }

  getSystemHistory(limit = 60): SystemMetricRecord[] {
    return this.processor.getSystemHistory(limit);
  }

  getLatestSystemSnapshot(): SystemSnapshot | null {
    return this.processor.getLatestSystemSnapshot();
  }

  getExtendedSystemData(intervalSeconds: number): SystemExtendedData {
    return this.processor.getExtendedSystemData(intervalSeconds, this.isRunning());
  }

  getFileIntelligenceData(workspaceRoot?: string): FileIntelligenceData {
    const fsCol = this.getCollector<FilesystemCollector>('filesystem');
    if (fsCol) {
      return fsCol.getFileIntelligenceData(workspaceRoot);
    }
    return {
      summary: null,
      largestFiles: [],
      directories: [],
      extensions: [],
      duplicates: [],
      growth: null,
      growthHistory: [],
      isScanning: false
    };
  }

  getActiveAlerts(limit = 20, unacknowledgedOnly = false): AlertItem[] {
    return this.database.alerts.getRecent(limit, unacknowledgedOnly);
  }

  acknowledgeAlert(id: string): boolean {
    return this.database.alerts.acknowledge(id);
  }

  acknowledgeAllAlerts(): boolean {
    return this.database.alerts.acknowledgeAll();
  }

  async reset(): Promise<void> {
    await this.database.clear();
  }

  async dispose(): Promise<void> {
    await this.pause();
    this.events.clear();
    await this.database.close();
  }

  private async tick(): Promise<void> {
    for (const collector of this.registry.getAll()) {
      if (!collector.getStatus().enabled) continue;
      try {
        const rawEvents = await collector.collect();
        for (const raw of rawEvents) {
          const event = this.normalizer.normalize(raw);
          this.processor.process(event);
          this.events.publish(event);
        }
      } catch (error) {
        console.error(`[DevPulse Engine] Collector '${collector.id}' failed during collection:`, error);
      }
    }
  }
}

import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent } from '../../shared/types';
import type { Database } from '../../database/Database';
import type { ApiIngestionServer } from '../../services/api/ApiIngestionServer';

export class ApiCollector implements Collector {
  readonly id = 'api';
  readonly name = 'API Intelligence';
  readonly description = 'Monitors instrumented application API requests, latencies, and HTTP error rates.';
  readonly category = 'api' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private lastCollectedAt: number | undefined;

  constructor(
    private readonly database: Database,
    private readonly ingestionServer: ApiIngestionServer
  ) {}

  async initialize(): Promise<void> {
    this.state = 'idle';
  }

  async start(): Promise<void> {
    if (this.state === 'running') return;
    await this.ingestionServer.start();
    this.state = 'running';
  }

  async stop(): Promise<void> {
    await this.ingestionServer.stop();
    this.state = 'idle';
  }

  async collect(): Promise<MetricEvent[]> {
    this.lastCollectedAt = Date.now();
    const summary = this.database.api.getSummary();
    const ingestionStatus = this.ingestionServer.getStatus();

    return [
      {
        id: `api-metric-${this.lastCollectedAt}`,
        collectorId: this.id,
        type: 'api.summary',
        timestamp: this.lastCollectedAt,
        payload: {
          summary,
          ingestionStatus
        }
      }
    ];
  }

  getStatus(): CollectorStatus {
    const ing = this.ingestionServer.getStatus();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: this.state === 'running',
      state: this.state,
      implemented: true,
      lastCollectedAt: this.lastCollectedAt,
      error: ing.error
    };
  }

  getServer(): ApiIngestionServer {
    return this.ingestionServer;
  }
}

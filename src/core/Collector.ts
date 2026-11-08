import type { CollectorStatus, MetricEvent } from '../shared/types';

export interface Collector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: CollectorStatus['category'];
  readonly implemented: boolean;

  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  collect(): Promise<MetricEvent[]>;
  getStatus(): CollectorStatus;
}

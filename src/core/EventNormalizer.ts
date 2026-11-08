import { randomUUID } from 'node:crypto';
import type { MetricEvent } from '../shared/types';

export class EventNormalizer {
  normalize<T = unknown>(raw: Partial<MetricEvent<T>> & { collectorId: string; type: string }): MetricEvent<T> {
    return {
      id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : randomUUID(),
      collectorId: raw.collectorId,
      type: raw.type,
      timestamp: typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now(),
      payload: (raw.payload ?? {}) as T
    };
  }
}


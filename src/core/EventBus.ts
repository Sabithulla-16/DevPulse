import type { MetricEvent } from '../shared/types';

export type EventListener<T = unknown> = (event: MetricEvent<T>) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener<any>>();

  subscribe<T = unknown>(listener: EventListener<T>): () => void {
    const casted = listener as EventListener<any>;
    this.listeners.add(casted);
    return () => {
      this.listeners.delete(casted);
    };
  }

  publish<T = unknown>(event: MetricEvent<T>): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[DevPulse EventBus] Listener error:', error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

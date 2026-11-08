import type { Collector } from './Collector';
import type { CollectorStatus } from '../shared/types';

export class CollectorRegistry {
  private readonly collectors = new Map<string, Collector>();

  register(collector: Collector): void {
    if (this.collectors.has(collector.id)) {
      throw new Error(`Collector already registered: ${collector.id}`);
    }
    this.collectors.set(collector.id, collector);
  }

  get(id: string): Collector | undefined {
    return this.collectors.get(id);
  }

  getAll(): Collector[] {
    return Array.from(this.collectors.values());
  }

  getStatuses(): CollectorStatus[] {
    return this.getAll().map(c => c.getStatus());
  }

  async initializeAll(): Promise<void> {
    for (const collector of this.collectors.values()) {
      try {
        await collector.initialize();
      } catch (error) {
        console.error(`[DevPulse Registry] Failed to initialize collector ${collector.id}:`, error);
      }
    }
  }

  async startAll(): Promise<void> {
    for (const collector of this.collectors.values()) {
      try {
        await collector.start();
      } catch (error) {
        console.error(`[DevPulse Registry] Failed to start collector ${collector.id}:`, error);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const collector of this.collectors.values()) {
      try {
        await collector.stop();
      } catch (error) {
        console.error(`[DevPulse Registry] Failed to stop collector ${collector.id}:`, error);
      }
    }
  }

  clear(): void {
    this.collectors.clear();
  }
}

import { describe, expect, it } from 'vitest';
import { CollectorRegistry } from '../src/core/CollectorRegistry';
import type { Collector } from '../src/core/Collector';

const createCollector = (id: string): Collector => ({
  id,
  name: `${id} Collector`,
  description: `Collector for ${id}`,
  category: 'system',
  implemented: true,
  initialize: async () => undefined,
  start: async () => undefined,
  stop: async () => undefined,
  collect: async () => [],
  getStatus: () => ({
    id,
    name: `${id} Collector`,
    description: `Collector for ${id}`,
    category: 'system',
    enabled: true,
    state: 'idle',
    implemented: true
  })
});

describe('CollectorRegistry', () => {
  it('registers and retrieves collectors', () => {
    const registry = new CollectorRegistry();
    const item = createCollector('test');
    registry.register(item);
    expect(registry.get('test')).toBe(item);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getStatuses()).toHaveLength(1);
  });

  it('rejects duplicate collector IDs', () => {
    const registry = new CollectorRegistry();
    registry.register(createCollector('test'));
    expect(() => registry.register(createCollector('test'))).toThrow('Collector already registered: test');
  });

  it('manages initialization, start, and stop across all collectors', async () => {
    const registry = new CollectorRegistry();
    registry.register(createCollector('c1'));
    registry.register(createCollector('c2'));

    await expect(registry.initializeAll()).resolves.not.toThrow();
    await expect(registry.startAll()).resolves.not.toThrow();
    await expect(registry.stopAll()).resolves.not.toThrow();
  });
});

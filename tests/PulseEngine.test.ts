import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Database } from '../src/database/Database';
import { PulseEngine } from '../src/core/PulseEngine';
import type { Collector } from '../src/core/Collector';
import type { CollectorStatus, MetricEvent } from '../src/shared/types';

describe('PulseEngine', () => {
  let tempDir: string;
  let database: Database;
  let engine: PulseEngine;
  const wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');

  const createMockCollector = (id: string, returnsEvent = true): Collector => {
    let running = false;
    return {
      id,
      name: `${id} Mock Collector`,
      description: 'Mock collector for engine tests',
      category: 'system',
      implemented: true,
      initialize: async () => {},
      start: async () => { running = true; },
      stop: async () => { running = false; },
      collect: async (): Promise<MetricEvent[]> => {
        if (!running || !returnsEvent) return [];
        return [
          {
            id: `mock-${id}-${Date.now()}`,
            collectorId: id,
            type: `${id}.sample`,
            timestamp: Date.now(),
            payload: { value: 123 }
          }
        ];
      },
      getStatus: (): CollectorStatus => ({
        id,
        name: `${id} Mock Collector`,
        description: 'Mock collector for engine tests',
        category: 'system',
        enabled: true,
        state: running ? 'running' : 'idle',
        implemented: true
      })
    };
  };

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-engine-test-'));
    database = new Database(tempDir, wasmPath);
    engine = new PulseEngine(database, 1000);
    await engine.initialize([createMockCollector('mock1'), createMockCollector('mock2')]);
  });

  afterAll(async () => {
    await engine.dispose();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('registers and reports statuses of collectors', () => {
    const statuses = engine.getStatuses();
    expect(statuses).toHaveLength(2);
    expect(statuses.map(s => s.id)).toEqual(['mock1', 'mock2']);
  });

  it('starts and pauses cleanly', async () => {
    expect(engine.isRunning()).toBe(false);
    await engine.start();
    expect(engine.isRunning()).toBe(true);
    await engine.pause();
    expect(engine.isRunning()).toBe(false);
  });

  it('collects metrics and publishes events on tick/refresh', async () => {
    await engine.start();
    let publishedCount = 0;
    const unsub = engine.events.subscribe(evt => {
      if (evt.collectorId === 'mock1' || evt.collectorId === 'mock2') {
        publishedCount++;
      }
    });

    await engine.refresh();
    unsub();
    await engine.pause();

    expect(publishedCount).toBeGreaterThan(0);
  });

  it('isolates collector errors without crashing the engine', async () => {
    const faultyCollector: Collector = {
      id: 'faulty',
      name: 'Faulty Collector',
      description: 'Throws error on collect',
      category: 'system',
      implemented: true,
      initialize: async () => {},
      start: async () => {},
      stop: async () => {},
      collect: async () => {
        throw new Error('Simulation fault');
      },
      getStatus: () => ({
        id: 'faulty',
        name: 'Faulty',
        description: '',
        category: 'system',
        enabled: true,
        state: 'error',
        implemented: true
      })
    };

    engine.registry.register(faultyCollector);
    await engine.start();

    // Refresh should succeed despite faulty collector throwing
    await expect(engine.refresh()).resolves.not.toThrow();
    await engine.pause();
  });
});


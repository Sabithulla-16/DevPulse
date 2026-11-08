import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Database } from '../src/database/Database';
import type { MetricEvent, SystemSnapshot } from '../src/shared/types';

describe('Database & Repositories', () => {
  let tempDir: string;
  let database: Database;
  const wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-test-'));
    database = new Database(tempDir, wasmPath);
    await database.initialize();
  });

  afterAll(async () => {
    await database.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('initializes and applies migrations successfully', () => {
    expect(database.isInitialized()).toBe(true);
  });

  describe('MetricEventsRepository', () => {
    it('inserts and retrieves metric events', () => {
      const event: MetricEvent<{ testVal: number }> = {
        id: 'evt-1',
        collectorId: 'system',
        type: 'test.event',
        timestamp: Date.now(),
        payload: { testVal: 42 }
      };

      database.metricEvents.insert(event);
      const recent = database.metricEvents.getRecent(10);

      expect(recent.length).toBeGreaterThanOrEqual(1);
      const found = recent.find(e => e.id === 'evt-1');
      expect(found).toBeDefined();
      expect((found?.payload as { testVal: number }).testVal).toBe(42);
    });

    it('filters events by collectorId', () => {
      database.metricEvents.insert({
        id: 'evt-ai-1',
        collectorId: 'ai',
        type: 'ai.sample',
        timestamp: Date.now(),
        payload: {}
      });

      const aiEvents = database.metricEvents.getRecent(10, 'ai');
      expect(aiEvents.every(e => e.collectorId === 'ai')).toBe(true);
    });
  });

  describe('SystemMetricsRepository', () => {
    it('inserts and retrieves system snapshots', () => {
      const snapshot: SystemSnapshot = {
        cpuPercent: 24.5,
        memoryTotalBytes: 16000000000,
        memoryUsedBytes: 8000000000,
        memoryFreeBytes: 8000000000,
        memoryUsedPercent: 50.0,
        uptimeSeconds: 3600
      };

      const record = database.systemMetrics.insert(snapshot);
      expect(record.id).toBeDefined();

      const latest = database.systemMetrics.getLatest();
      expect(latest).toBeDefined();
      expect(latest?.cpuPercent).toBe(24.5);
      expect(latest?.memoryUsedPercent).toBe(50.0);

      const recent = database.systemMetrics.getRecent(10);
      expect(recent.length).toBeGreaterThanOrEqual(1);
    });

    it('computes metric averages over time window', () => {
      const now = Date.now();
      const avg = database.systemMetrics.getAverages(now - 100000);
      expect(avg.sampleCount).toBeGreaterThanOrEqual(1);
      expect(avg.avgCpu).toBeGreaterThan(0);
    });
  });

  describe('AlertsRepository', () => {
    it('inserts and acknowledges alerts', () => {
      const alert = database.alerts.insert({
        timestamp: Date.now(),
        severity: 'warning',
        collectorId: 'system',
        title: 'CPU Alert',
        message: 'CPU load is high'
      });

      expect(alert.id).toBeDefined();
      expect(alert.acknowledged).toBe(false);

      const unacked = database.alerts.getRecent(10, true);
      expect(unacked.some(a => a.id === alert.id)).toBe(true);

      database.alerts.acknowledge(alert.id);
      const afterAck = database.alerts.getRecent(10, true);
      expect(afterAck.some(a => a.id === alert.id)).toBe(false);
    });
  });

  describe('SettingsRepository', () => {
    it('stores and retrieves settings values with fallback', () => {
      expect(database.settings.get('non.existent', 'default-val')).toBe('default-val');

      database.settings.set('theme', 'dark');
      expect(database.settings.get('theme', 'light')).toBe('dark');

      database.settings.set('interval', 10);
      expect(database.settings.get('interval', 5)).toBe(10);
    });
  });
});


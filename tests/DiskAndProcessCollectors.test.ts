import { describe, expect, it } from 'vitest';
import { DiskCollector } from '../src/collectors/disk/DiskCollector';
import { ProcessCollector } from '../src/collectors/process/ProcessCollector';
import { PortCollector } from '../src/collectors/port/PortCollector';

describe('Advanced System Collectors', () => {
  describe('DiskCollector', () => {
    it('collects real disk volume statistics', async () => {
      const collector = new DiskCollector();
      await collector.initialize();
      await collector.start();

      const events = await collector.collect();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('disk.snapshot');

      const disks = events[0].payload;
      expect(disks.length).toBeGreaterThan(0);
      expect(disks[0].totalBytes).toBeGreaterThan(0);
      expect(disks[0].usedPercent).toBeGreaterThanOrEqual(0);
      expect(disks[0].usedPercent).toBeLessThanOrEqual(100);

      await collector.stop();
    });
  });

  describe('ProcessCollector', () => {
    it('collects and sorts top processes by CPU or memory', async () => {
      const collector = new ProcessCollector();
      await collector.initialize();
      await collector.start();

      const events = await collector.collect();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('process.snapshot');

      const procs = events[0].payload;
      expect(procs.length).toBeGreaterThan(0);
      expect(procs[0].pid).toBeGreaterThan(0);
      expect(typeof procs[0].name).toBe('string');
      expect(procs[0].memoryBytes).toBeGreaterThanOrEqual(0);

      await collector.stop();
    });
  });

  describe('PortCollector', () => {
    it('probes localhost ports without error and reports state', async () => {
      const collector = new PortCollector(undefined, [9999, 9998]); // Non-standard test ports
      await collector.initialize();
      await collector.start();

      const events = await collector.collect();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('port.snapshot');

      const ports = events[0].payload;
      expect(ports.length).toBeGreaterThanOrEqual(2);
      expect(ports.some(p => p.port === 9999)).toBe(true);
      expect(ports[0].state).toMatch(/LISTENING|CLOSED|BOUND/);

      await collector.stop();
    });
  });
});

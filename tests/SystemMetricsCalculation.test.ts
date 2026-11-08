import { describe, expect, it } from 'vitest';
import {
  calculateCpuUtilization,
  calculateMemoryStats,
  type CpuCoreSample
} from '../src/collectors/system/systemUtils';

describe('CPU utilization calculation', () => {
  it('returns 0 when sample arrays are empty', () => {
    expect(calculateCpuUtilization([], [])).toBe(0);
  });

  it('calculates 0% when all delta is idle', () => {
    const prev: CpuCoreSample[] = [
      { times: { user: 100, nice: 0, sys: 50, idle: 1000, irq: 0 } }
    ];
    const curr: CpuCoreSample[] = [
      { times: { user: 100, nice: 0, sys: 50, idle: 1100, irq: 0 } }
    ];

    const result = calculateCpuUtilization(prev, curr);
    expect(result).toBe(0);
  });

  it('calculates 100% when delta has zero idle time', () => {
    const prev: CpuCoreSample[] = [
      { times: { user: 100, nice: 0, sys: 50, idle: 1000, irq: 0 } }
    ];
    const curr: CpuCoreSample[] = [
      { times: { user: 150, nice: 0, sys: 100, idle: 1000, irq: 0 } }
    ];

    const result = calculateCpuUtilization(prev, curr);
    expect(result).toBe(100);
  });

  it('calculates intermediate CPU percentages across multiple cores accurately', () => {
    const prev: CpuCoreSample[] = [
      { times: { user: 100, nice: 0, sys: 50, idle: 1000, irq: 0 } },
      { times: { user: 200, nice: 0, sys: 100, idle: 2000, irq: 0 } }
    ];
    // Core 0: total delta = 100, idle delta = 50 -> 50%
    // Core 1: total delta = 100, idle delta = 50 -> 50%
    const curr: CpuCoreSample[] = [
      { times: { user: 130, nice: 0, sys: 70, idle: 1050, irq: 0 } },
      { times: { user: 230, nice: 0, sys: 120, idle: 2050, irq: 0 } }
    ];

    const result = calculateCpuUtilization(prev, curr);
    expect(result).toBe(50);
  });

  it('clamps results between 0 and 100', () => {
    const prev: CpuCoreSample[] = [
      { times: { user: 100, nice: 0, sys: 50, idle: 1000, irq: 0 } }
    ];
    const curr: CpuCoreSample[] = [
      { times: { user: 100, nice: 0, sys: 50, idle: 900, irq: 0 } } // negative idle delta should be clamped
    ];

    const result = calculateCpuUtilization(prev, curr);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe('Memory calculation', () => {
  it('handles zero total bytes cleanly', () => {
    const res = calculateMemoryStats(0, 0);
    expect(res.totalBytes).toBe(0);
    expect(res.usedBytes).toBe(0);
    expect(res.usedPercent).toBe(0);
  });

  it('calculates used memory bytes and percentage correctly', () => {
    const total = 16 * 1024 * 1024 * 1024; // 16 GB
    const free = 4 * 1024 * 1024 * 1024;  // 4 GB free => 12 GB used (75%)
    const res = calculateMemoryStats(total, free);

    expect(res.totalBytes).toBe(total);
    expect(res.freeBytes).toBe(free);
    expect(res.usedBytes).toBe(12 * 1024 * 1024 * 1024);
    expect(res.usedPercent).toBe(75);
  });

  it('clamps when free memory exceeds total memory', () => {
    const total = 1000;
    const free = 1500;
    const res = calculateMemoryStats(total, free);

    expect(res.freeBytes).toBe(1000);
    expect(res.usedBytes).toBe(0);
    expect(res.usedPercent).toBe(0);
  });
});


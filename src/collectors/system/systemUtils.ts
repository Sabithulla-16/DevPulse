import type * as os from 'node:os';

export interface CpuTimes {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

export interface CpuCoreSample {
  times: CpuTimes;
}

/**
 * Calculates CPU utilization percentage between two sets of CPU core samples.
 * Returns a percentage between 0 and 100.
 */
export function calculateCpuUtilization(
  previousCpus: CpuCoreSample[],
  currentCpus: CpuCoreSample[]
): number {
  if (!previousCpus.length || !currentCpus.length) {
    return 0;
  }

  const coreCount = Math.min(previousCpus.length, currentCpus.length);
  let totalDelta = 0;
  let idleDelta = 0;

  for (let i = 0; i < coreCount; i++) {
    const prev = previousCpus[i].times;
    const curr = currentCpus[i].times;

    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

    const dTotal = currTotal - prevTotal;
    const dIdle = curr.idle - prev.idle;

    if (dTotal > 0) {
      totalDelta += dTotal;
      idleDelta += dIdle;
    }
  }

  if (totalDelta <= 0) {
    return 0;
  }

  const utilization = (1 - idleDelta / totalDelta) * 100;
  return Math.max(0, Math.min(100, Math.round(utilization * 10) / 10));
}

export interface MemoryStats {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
}

/**
 * Calculates memory usage statistics given total and free memory in bytes.
 */
export function calculateMemoryStats(totalBytes: number, freeBytes: number): MemoryStats {
  if (totalBytes <= 0) {
    return {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      usedPercent: 0
    };
  }

  const clampedFree = Math.max(0, Math.min(totalBytes, freeBytes));
  const usedBytes = totalBytes - clampedFree;
  const usedPercent = Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 1000) / 10));

  return {
    totalBytes,
    freeBytes: clampedFree,
    usedBytes,
    usedPercent
  };
}


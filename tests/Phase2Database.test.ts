import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Database } from '../src/database/Database';
import type {
  WorkspaceFileScanSummary,
  FileEntryRecord,
  DirectoryStats,
  DuplicateGroup,
  DiskSnapshot,
  ProcessInfo,
  PortInfo
} from '../src/shared/types';

describe('Phase 2 Database Repositories', () => {
  let tempDir: string;
  let database: Database;
  const wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-phase2-db-'));
    database = new Database(tempDir, wasmPath);
    await database.initialize();
  });

  afterAll(async () => {
    await database.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('FileScansRepository', () => {
    const workspacePath = 'C:/test/workspace';

    it('saves a full scan with all related tables and retrieves it', () => {
      const summary: WorkspaceFileScanSummary = {
        scanId: 'scan-001',
        workspacePath,
        workspaceName: 'test-workspace',
        totalSizeBytes: 1048576,
        totalFileCount: 25,
        totalFolderCount: 4,
        scannedFileCount: 25,
        excludedFileCount: 2,
        excludedFolderCount: 1,
        scanDurationMs: 120,
        timestamp: Date.now() - 5000,
        status: 'completed'
      };

      const largestFiles: FileEntryRecord[] = [
        {
          path: 'src/main.ts',
          name: 'main.ts',
          sizeBytes: 400000,
          extension: '.ts',
          lastModified: Date.now()
        },
        {
          path: 'src/utils.ts',
          name: 'utils.ts',
          sizeBytes: 200000,
          extension: '.ts',
          lastModified: Date.now()
        }
      ];

      const folderStats: DirectoryStats[] = [
        {
          path: 'src',
          name: 'src',
          directFileCount: 10,
          recursiveFileCount: 20,
          totalSizeBytes: 900000,
          childDirCount: 2
        }
      ];

      const duplicateGroups: DuplicateGroup[] = [
        {
          hash: 'abc123hash',
          fileSizeBytes: 15000,
          fileCount: 2,
          wastedBytes: 15000,
          files: ['src/copy1.ts', 'src/copy2.ts']
        }
      ];

      database.fileScans.saveScan(summary, largestFiles, folderStats, duplicateGroups);

      // Retrieve latest scan
      const latest = database.fileScans.getLatestScan(workspacePath);
      expect(latest).not.toBeNull();
      expect(latest?.scanId).toBe('scan-001');
      expect(latest?.totalSizeBytes).toBe(1048576);
      expect(latest?.totalFileCount).toBe(25);
      expect(latest?.status).toBe('completed');

      // Retrieve child records
      const retrievedLargest = database.fileScans.getLargestFiles('scan-001');
      expect(retrievedLargest.length).toBe(2);
      expect(retrievedLargest[0].path).toBe('src/main.ts');

      const retrievedFolders = database.fileScans.getFolderStats('scan-001');
      expect(retrievedFolders.length).toBe(1);
      expect(retrievedFolders[0].path).toBe('src');

      const retrievedDuplicates = database.fileScans.getDuplicateGroups('scan-001');
      expect(retrievedDuplicates.length).toBe(1);
      expect(retrievedDuplicates[0].hash).toBe('abc123hash');
      expect(retrievedDuplicates[0].files.length).toBe(2);
    });

    it('calculates workspace growth comparison across two scans', () => {
      // Second scan with growth
      const summary2: WorkspaceFileScanSummary = {
        scanId: 'scan-002',
        workspacePath,
        workspaceName: 'test-workspace',
        totalSizeBytes: 1258291, // +209,715 bytes (~20%)
        totalFileCount: 30,
        totalFolderCount: 5,
        scannedFileCount: 30,
        excludedFileCount: 2,
        excludedFolderCount: 1,
        scanDurationMs: 140,
        timestamp: Date.now(),
        status: 'completed'
      };

      database.fileScans.saveScan(summary2, [], [], []);

      const growth = database.fileScans.getGrowthComparison(workspacePath);
      expect(growth).not.toBeNull();
      expect(growth?.currentSizeBytes).toBe(1258291);
      expect(growth?.previousSizeBytes).toBe(1048576);
      expect(growth?.differenceBytes).toBe(209715);
      expect(growth?.growthPercentage).toBeCloseTo(20.0, 0);
    });

    it('returns scan history and allows clearing history', () => {
      const history = database.fileScans.getHistory(workspacePath);
      expect(history.length).toBe(2);

      database.fileScans.clearHistory(workspacePath);
      const afterClear = database.fileScans.getHistory(workspacePath);
      expect(afterClear.length).toBe(0);
    });
  });

  describe('DiskMetricsRepository', () => {
    it('persists and retrieves disk snapshots', () => {
      const disks: DiskSnapshot[] = [
        {
          fs: 'C:',
          mount: 'C:',
          type: 'NTFS',
          totalBytes: 500000000000,
          usedBytes: 250000000000,
          freeBytes: 250000000000,
          usedPercent: 50.0
        },
        {
          fs: 'D:',
          mount: 'D:',
          type: 'NTFS',
          totalBytes: 1000000000000,
          usedBytes: 800000000000,
          freeBytes: 200000000000,
          usedPercent: 80.0
        }
      ];

      database.diskMetrics.saveSnapshots(disks);
      const retrieved = database.diskMetrics.getLatest();
      expect(retrieved.length).toBe(2);
      expect(retrieved.find(d => d.fs === 'C:')?.usedPercent).toBe(50.0);
    });
  });

  describe('ProcessMetricsRepository', () => {
    it('persists and retrieves process snapshots', () => {
      const processes: ProcessInfo[] = [
        {
          pid: 1234,
          name: 'node.exe',
          cpuPercent: 12.5,
          memoryBytes: 150000000,
          memoryPercent: 1.5
        },
        {
          pid: 5678,
          name: 'Code.exe',
          cpuPercent: 25.0,
          memoryBytes: 500000000,
          memoryPercent: 5.0
        }
      ];

      database.processMetrics.saveSnapshot(processes);
      const retrieved = database.processMetrics.getLatest();
      expect(retrieved.length).toBe(2);
      expect(retrieved.some(p => p.name === 'node.exe')).toBe(true);
      expect(retrieved.some(p => p.pid === 5678)).toBe(true);
    });
  });

  describe('PortMetricsRepository', () => {
    it('persists and retrieves port snapshots', () => {
      const ports: PortInfo[] = [
        {
          port: 3000,
          state: 'listening',
          pid: 1234,
          processName: 'node.exe'
        },
        {
          port: 8080,
          state: 'closed'
        }
      ];

      database.portMetrics.saveSnapshot(ports);
      const retrieved = database.portMetrics.getLatest();
      expect(retrieved.length).toBe(2);
      expect(retrieved.find(p => p.port === 3000)?.state).toBe('listening');
      expect(retrieved.find(p => p.port === 8080)?.state).toBe('closed');
    });
  });
});

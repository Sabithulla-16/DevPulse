import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as net from 'node:net';
import { fork, type ChildProcess } from 'node:child_process';
import { Database } from '../src/database/Database';
import { ProcessManager } from '../src/services/ProcessManager';
import { PortCollector } from '../src/collectors/port/PortCollector';
import type {
  WorkspaceFileScanSummary,
  FileEntryRecord,
  DirectoryStats,
  DuplicateGroup
} from '../src/shared/types';

describe('Pre-Phase 3 Enhancements', () => {
  let tempDir: string;
  let database: Database;
  const wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-enhancements-'));
    database = new Database(tempDir, wasmPath);
    await database.initialize();
  });

  afterAll(async () => {
    await database.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. File Extension Drill-Down & SQLite Queries', () => {
    const workspacePath = 'c:/projects/test-app';

    it('indexes all scanned files and retrieves all files for a specific format with sorting & search', () => {
      const summary: WorkspaceFileScanSummary = {
        scanId: 'scan-ext-test-1',
        workspacePath,
        workspaceName: 'test-app',
        totalSizeBytes: 1000000,
        totalFileCount: 6,
        totalFolderCount: 2,
        scannedFileCount: 6,
        excludedFileCount: 0,
        excludedFolderCount: 0,
        scanDurationMs: 80,
        timestamp: Date.now(),
        status: 'completed'
      };

      const allFiles: FileEntryRecord[] = [
        { path: 'src/index.ts', name: 'index.ts', extension: 'ts', sizeBytes: 1500, lastModified: 1000 },
        { path: 'src/app.ts', name: 'app.ts', extension: 'ts', sizeBytes: 4500, lastModified: 2000 },
        { path: 'src/types.ts', name: 'types.ts', extension: 'ts', sizeBytes: 2500, lastModified: 1500 },
        { path: 'src/components/Header.tsx', name: 'Header.tsx', extension: 'tsx', sizeBytes: 3000, lastModified: 3000 },
        { path: 'package.json', name: 'package.json', extension: 'json', sizeBytes: 800, lastModified: 4000 },
        { path: 'tsconfig.json', name: 'tsconfig.json', extension: 'json', sizeBytes: 600, lastModified: 2500 }
      ];

      // Save scan with allFiles
      database.fileScans.saveScan(summary, allFiles.slice(0, 2), [], [], allFiles);

      // Query .ts files (with leading dot or without)
      const tsResult = database.fileScans.getFilesByExtension(workspacePath, '.ts', {
        sortBy: 'size',
        sortOrder: 'desc'
      });

      expect(tsResult.totalCount).toBe(3);
      expect(tsResult.totalSizeBytes).toBe(1500 + 4500 + 2500);
      expect(tsResult.files).toHaveLength(3);
      expect(tsResult.files[0].name).toBe('app.ts'); // 4500 is largest
      expect(tsResult.files[1].name).toBe('types.ts');
      expect(tsResult.files[2].name).toBe('index.ts');

      // Query .tsx files
      const tsxResult = database.fileScans.getFilesByExtension(workspacePath, 'tsx');
      expect(tsxResult.totalCount).toBe(1);
      expect(tsxResult.files[0].name).toBe('Header.tsx');

      // Test Search filter
      const searchResult = database.fileScans.getFilesByExtension(workspacePath, 'ts', {
        search: 'types'
      });
      expect(searchResult.totalCount).toBe(1);
      expect(searchResult.files[0].name).toBe('types.ts');

      // Test Pagination
      const pageResult = database.fileScans.getFilesByExtension(workspacePath, 'ts', {
        page: 1,
        pageSize: 2
      });
      expect(pageResult.files).toHaveLength(2);
      expect(pageResult.totalPages).toBe(2);
    });
  });

  describe('2. Process Management & Termination Safety', () => {
    it('correctly identifies and protects system-critical and host processes', () => {
      // System PID
      expect(ProcessManager.isProtected(0, 'System Idle Process')).toBe(true);
      expect(ProcessManager.isProtected(4, 'System')).toBe(true);

      // Windows system daemons
      expect(ProcessManager.isProtected(1234, 'csrss.exe')).toBe(true);
      expect(ProcessManager.isProtected(5678, 'svchost.exe')).toBe(true);
      expect(ProcessManager.isProtected(9999, 'lsass.exe')).toBe(true);

      // Current host process
      expect(ProcessManager.isProtected(process.pid, 'node.exe')).toBe(true);

      // Normal user process is NOT protected
      expect(ProcessManager.isProtected(45200, 'dev-server.exe')).toBe(false);
      expect(ProcessManager.isProtected(52000, 'vite.cmd')).toBe(false);
    });

    it('refuses to stop protected processes and returns informative error', async () => {
      const res = await ProcessManager.stopProcess(4, 'System');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Security restriction');
    });

    it('detects already-exited processes gracefully', async () => {
      // Non-existent large PID
      const res = await ProcessManager.stopProcess(9999999, 'nonexistent.exe');
      expect(res.success).toBe(true);
      expect(res.message).toContain('already exited');
    });
  });

  describe('3. Dynamic Port Discovery & Free Port Functionality', () => {
    let customChild: ChildProcess | undefined;
    let customTestPort = 0;
    let serverListening = false;

    beforeAll(async () => {
      const script = `
        const net = require('node:net');
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
          const addr = s.address();
          if (process.send) process.send({ type: 'READY', port: addr.port });
        });
        setInterval(() => {}, 10000);
      `;
      customChild = fork('-e', [script], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      await new Promise<void>((resolve) => {
        customChild?.on('message', (msg: any) => {
          if (msg && msg.type === 'READY') {
            customTestPort = msg.port;
            serverListening = true;
            setTimeout(resolve, 1000);
            return;
          }
        });
        setTimeout(resolve, 2000);
      });
    });

    afterAll(() => {
      if (customChild && !customChild.killed) {
        try { customChild.kill('SIGKILL'); } catch {}
      }
    });

    it('dynamically discovers listening ports and custom non-standard dev ports', async () => {
      const collector = new PortCollector();
      await collector.initialize();
      await collector.start();

      const events = await collector.collect();
      const ports = events[0].payload;

      expect(ports.length).toBeGreaterThan(0);

      if (serverListening) {
        const foundCustom = ports.find(p => p.port === customTestPort);
        expect(foundCustom).toBeDefined();
        expect(foundCustom?.state).toBe('LISTENING');
        expect(foundCustom?.protocol).toBe('TCP');
      }

      await collector.stop();
    }, 15000);

    it('verifies port occupancy accurately', async () => {
      if (serverListening) {
        const isOccupied = await ProcessManager.isPortOccupied(customTestPort);
        expect(isOccupied).toBe(true);
      }

      // Check an unused port
      const isUnusedOccupied = await ProcessManager.isPortOccupied(59999);
      expect(isUnusedOccupied).toBe(false);
    }, 15000);

    it('frees an occupied port when a child process owns it', async () => {
      // Spawn a disposable node worker that listens on a dynamic port
      let workerPort = 0;
      const workerScript = `
        const net = require('node:net');
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
          const addr = s.address();
          if (process.send) process.send({ type: 'READY', port: addr.port });
        });
        setInterval(() => {}, 10000);
      `;

      let worker: ChildProcess | undefined;
      try {
        worker = fork('-e', [workerScript], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });

        await new Promise<void>((resolve) => {
          worker?.on('message', (msg: any) => {
            if (msg && msg.type === 'READY') {
              workerPort = msg.port;
              setTimeout(resolve, 1000);
            }
          });
          // Timeout fallback
          setTimeout(resolve, 2000);
        });

        expect(workerPort).toBeGreaterThan(0);

        // Verify port is occupied
        const beforeFree = await ProcessManager.isPortOccupied(workerPort);
        expect(beforeFree).toBe(true);

        // Free the port (with force=true or standard)
        const freeRes = await ProcessManager.freePort(workerPort, 'TCP', worker.pid, 'node.exe', true);
        expect(freeRes.success).toBe(true);
        expect(freeRes.port).toBe(workerPort);

        // Verify port is now free
        const afterFree = await ProcessManager.isPortOccupied(workerPort);
        expect(afterFree).toBe(false);
      } finally {
        if (worker && !worker.killed) {
          try { worker.kill('SIGKILL'); } catch {}
        }
      }
    }, 15000);
  });
});

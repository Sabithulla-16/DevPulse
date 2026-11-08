import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic } from 'sql.js';
import { runMigrations } from './migrations';
import { MetricEventsRepository } from './repositories/MetricEventsRepository';
import { SystemMetricsRepository } from './repositories/SystemMetricsRepository';
import { AlertsRepository } from './repositories/AlertsRepository';
import { SettingsRepository } from './repositories/SettingsRepository';
import { FileScansRepository } from './repositories/FileScansRepository';
import { DiskMetricsRepository } from './repositories/DiskMetricsRepository';
import { ProcessMetricsRepository } from './repositories/ProcessMetricsRepository';
import { PortMetricsRepository } from './repositories/PortMetricsRepository';
import { AiIntelligenceRepository } from './repositories/AiIntelligenceRepository';
import { GitIntelligenceRepository } from './repositories/GitIntelligenceRepository';
import { CodingIntelligenceRepository } from './repositories/CodingIntelligenceRepository';
import { ApiIntelligenceRepository } from './repositories/ApiIntelligenceRepository';
import { ApiTestingRepository } from './repositories/ApiTestingRepository';
import { AiPlaygroundRepository } from './repositories/AiPlaygroundRepository';
import { PulseInsightsRepository } from './repositories/PulseInsightsRepository';

export class Database {
  private db!: SqlDatabase;
  private SQL!: SqlJsStatic;
  readonly filePath: string;
  private initialized = false;
  private persistTimer: NodeJS.Timeout | undefined;

  readonly metricEvents: MetricEventsRepository;
  readonly systemMetrics: SystemMetricsRepository;
  readonly alerts: AlertsRepository;
  readonly settings: SettingsRepository;
  readonly fileScans: FileScansRepository;
  readonly diskMetrics: DiskMetricsRepository;
  readonly processMetrics: ProcessMetricsRepository;
  readonly portMetrics: PortMetricsRepository;
  readonly aiIntelligence: AiIntelligenceRepository;
  readonly gitIntelligence: GitIntelligenceRepository;
  readonly codingIntelligence: CodingIntelligenceRepository;
  readonly apiIntelligence: ApiIntelligenceRepository;
  readonly apiTesting: ApiTestingRepository;
  readonly aiPlayground: AiPlaygroundRepository;
  readonly pulseInsights: PulseInsightsRepository;

  get ai(): AiIntelligenceRepository {
    return this.aiIntelligence;
  }

  get git(): GitIntelligenceRepository {
    return this.gitIntelligence;
  }

  get coding(): CodingIntelligenceRepository {
    return this.codingIntelligence;
  }

  get api(): ApiIntelligenceRepository {
    return this.apiIntelligence;
  }

  get testing(): ApiTestingRepository {
    return this.apiTesting;
  }

  get playground(): AiPlaygroundRepository {
    return this.aiPlayground;
  }

  get insights(): PulseInsightsRepository {
    return this.pulseInsights;
  }

  constructor(storageDirectory: string, private readonly wasmPath: string) {
    this.filePath = path.join(storageDirectory, 'devpulse.sqlite');

    const getDb = () => {
      this.assertInitialized();
      return this.db;
    };

    const schedulePersist = () => this.schedulePersist();

    this.metricEvents = new MetricEventsRepository(getDb);
    this.systemMetrics = new SystemMetricsRepository(getDb);
    this.alerts = new AlertsRepository(getDb);
    this.settings = new SettingsRepository(getDb);
    this.fileScans = new FileScansRepository(getDb);
    this.diskMetrics = new DiskMetricsRepository(getDb);
    this.processMetrics = new ProcessMetricsRepository(getDb);
    this.portMetrics = new PortMetricsRepository(getDb);
    this.aiIntelligence = new AiIntelligenceRepository(getDb);
    this.gitIntelligence = new GitIntelligenceRepository(getDb);
    this.codingIntelligence = new CodingIntelligenceRepository(getDb);
    this.apiIntelligence = new ApiIntelligenceRepository(getDb);
    this.apiTesting = new ApiTestingRepository(getDb, schedulePersist);
    this.aiPlayground = new AiPlaygroundRepository(getDb, schedulePersist);
    this.pulseInsights = new PulseInsightsRepository(getDb, schedulePersist);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const resolvedWasm = await this.resolveWasmPath();
    this.SQL = await initSqlJs({
      locateFile: () => resolvedWasm
    });

    let existingFileExisted = false;
    try {
      const bytes = await fs.readFile(this.filePath);
      this.db = new this.SQL.Database(new Uint8Array(bytes));
      existingFileExisted = true;
    } catch {
      this.db = new this.SQL.Database();
    }
    this.db.run('PRAGMA foreign_keys = ON;');

    try {
      runMigrations(this.db);
    } catch (err) {
      console.error('[DevPulse DB] Migration error:', err);
      // DAT-01: Never silently destroy existing database without backing it up first
      if (existingFileExisted) {
        try {
          const backupPath = `${this.filePath}.bak-${Date.now()}`;
          await fs.copyFile(this.filePath, backupPath);
          console.warn(`[DevPulse DB] Preserved corrupted database backup at ${backupPath}`);
        } catch (backupErr) {
          console.error('[DevPulse DB] Failed to create database backup:', backupErr);
        }
      }
      this.db = new this.SQL.Database();
      this.db.run('PRAGMA foreign_keys = ON;');
      runMigrations(this.db);
    }

    this.initialized = true;
    await this.persist();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  schedulePersist(): void {
    if (!this.initialized) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.persist().catch(err => {
        console.error('[DevPulse DB] Failed to persist database', err);
      });
    }, 1000);
  }

  async persist(): Promise<void> {
    if (!this.initialized) return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    const bytes = this.db.export();
    await fs.writeFile(this.filePath, Buffer.from(bytes));
  }

  async clear(): Promise<void> {
    this.assertInitialized();
    this.metricEvents.clear();
    this.systemMetrics.clear();
    this.alerts.clear();
    this.settings.clear();
    this.fileScans.clearScanHistory();
    this.diskMetrics.clear();
    this.processMetrics.clear();
    this.portMetrics.clear();
    this.codingIntelligence.clear();
    this.apiIntelligence.clear();
    this.apiTesting.clearTransientHistory();
    await this.persist();
  }

  async close(): Promise<void> {
    if (!this.initialized) return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    try {
      await this.persist();
    } catch (err) {
      console.error('[DevPulse DB] Error persisting on close', err);
    }
    this.db.close();
    this.initialized = false;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Database has not been initialized');
    }
  }

  private async resolveWasmPath(): Promise<string> {
    const candidatePaths = [
      this.wasmPath,
      path.join(__dirname, 'vendor', 'sql-wasm.wasm'),
      path.join(__dirname, '..', 'out', 'vendor', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'out', 'vendor', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    ];

    for (const p of candidatePaths) {
      if (p) {
        try {
          await fs.access(p);
          return p;
        } catch {
          // Continue searching
        }
      }
    }
    return this.wasmPath;
  }
}

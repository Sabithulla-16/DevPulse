import { randomUUID } from 'node:crypto';
import type { Collector } from '../../core/Collector';
import type {
  CollectorStatus,
  MetricEvent,
  WorkspaceFileScanSummary,
  FileIntelligenceData,
  ExtensionBreakdown
} from '../../shared/types';
import { FilesystemScanner, type ScannerOptions } from './FilesystemScanner';
import type { Database } from '../../database/Database';

export class FilesystemCollector implements Collector {
  readonly id = 'filesystem';
  readonly name = 'File Intelligence';
  readonly description = 'Scans workspace file counts, storage utilization, largest assets, and duplicate groups.';
  readonly category = 'filesystem' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private scanner = new FilesystemScanner();
  private lastCollectedAt?: number;
  private sampleCount = 0;
  private currentScanSummary: WorkspaceFileScanSummary | null = null;
  private isScanning = false;

  constructor(private readonly database?: Database) {}

  async initialize(): Promise<void> {
    this.state = 'idle';
    if (this.database) {
      this.currentScanSummary = this.database.fileScans.getLatestScan();
    }
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.cancelScan();
    this.state = 'paused';
  }

  async collect(): Promise<MetricEvent[]> {
    if (!this.currentScanSummary) {
      return [];
    }

    return [
      {
        id: randomUUID(),
        collectorId: this.id,
        type: 'filesystem.summary',
        timestamp: this.currentScanSummary.timestamp,
        payload: this.currentScanSummary
      }
    ];
  }

  getStatus(): CollectorStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: true,
      state: this.isScanning ? 'running' : this.state,
      implemented: this.implemented,
      lastCollectedAt: this.lastCollectedAt,
      sampleCount: this.sampleCount
    };
  }

  async runScan(
    workspaceRoot: string,
    workspaceName: string,
    options: ScannerOptions = {}
  ): Promise<FileIntelligenceData> {
    this.isScanning = true;
    this.scanner = new FilesystemScanner();

    try {
      const result = await this.scanner.scan(workspaceRoot, workspaceName, options);
      this.currentScanSummary = result.summary;
      this.lastCollectedAt = Date.now();
      this.sampleCount++;

      // Persist to database if database is available
      if (this.database) {
        this.database.fileScans.saveScan(
          result.summary,
          result.largestFiles,
          result.directories,
          result.duplicates,
          result.allFiles
        );
        this.database.schedulePersist();
      }

      const growth = this.database ? this.database.fileScans.getGrowthComparison(workspaceRoot) : null;
      const growthHistory = this.database ? this.database.fileScans.getScanHistory(workspaceRoot) : [];

      return {
        summary: result.summary,
        largestFiles: result.largestFiles,
        directories: result.directories,
        extensions: result.extensions,
        duplicates: result.duplicates,
        growth,
        growthHistory,
        isScanning: false
      };
    } finally {
      this.isScanning = false;
    }
  }

  cancelScan(): void {
    this.scanner.cancel();
    this.isScanning = false;
  }

  getCurrentScan(): WorkspaceFileScanSummary | null {
    return this.currentScanSummary;
  }

  getFileIntelligenceData(workspaceRoot?: string): FileIntelligenceData {
    if (!this.database) {
      return {
        summary: this.currentScanSummary,
        largestFiles: [],
        directories: [],
        extensions: [],
        duplicates: [],
        growth: null,
        growthHistory: [],
        isScanning: this.isScanning
      };
    }

    const latest = this.database.fileScans.getLatestScan(workspaceRoot);
    if (!latest) {
      return {
        summary: null,
        largestFiles: [],
        directories: [],
        extensions: [],
        duplicates: [],
        growth: null,
        growthHistory: [],
        isScanning: this.isScanning
      };
    }

    const largestFiles = this.database.fileScans.getLargestFiles(latest.scanId);
    const directories = this.database.fileScans.getFolderStats(latest.scanId);
    const duplicates = this.database.fileScans.getDuplicates(latest.scanId);
    const growth = this.database.fileScans.getGrowthComparison(workspaceRoot);
    const growthHistory = this.database.fileScans.getScanHistory(workspaceRoot);

    // Query full extension breakdown from SQLite file entries
    let extensions = this.database.fileScans.getExtensionBreakdown(latest.scanId);
    if (!extensions || extensions.length === 0) {
      // Fallback approximation from largest files if full breakdown not yet saved
      const extMap = new Map<string, { count: number; bytes: number }>();
      for (const f of largestFiles) {
        const existing = extMap.get(f.extension) ?? { count: 0, bytes: 0 };
        existing.count++;
        existing.bytes += f.sizeBytes;
        extMap.set(f.extension, existing);
      }

      extensions = Array.from(extMap.entries()).map(([ext, val]) => ({
        extension: ext,
        fileCount: val.count,
        totalSizeBytes: val.bytes,
        percentage: latest.totalSizeBytes > 0 ? Math.round((val.bytes / latest.totalSizeBytes) * 1000) / 10 : 0
      }));
    }

    return {
      summary: latest,
      largestFiles,
      directories,
      extensions,
      duplicates,
      growth,
      growthHistory,
      isScanning: this.isScanning
    };
  }
}

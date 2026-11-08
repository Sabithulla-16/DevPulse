import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type {
  WorkspaceFileScanSummary,
  FileEntryRecord,
  DirectoryStats,
  DuplicateGroup,
  ExtensionBreakdown,
  WorkspaceGrowthComparison,
  ExtensionFilesResult
} from '../../shared/types';

export class FileScansRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveScan(
    summary: WorkspaceFileScanSummary,
    largestFiles: FileEntryRecord[],
    directories: DirectoryStats[],
    duplicates: DuplicateGroup[],
    allFiles?: FileEntryRecord[]
  ): void {
    try {
      const db = this.getDb();
      db.run('BEGIN TRANSACTION');

      try {
        // 1. Insert file_scans
        db.run(
          `INSERT INTO file_scans (
            id, timestamp, workspace_path, workspace_name, total_size_bytes,
            total_files, total_folders, scanned_files, excluded_files,
            excluded_folders, duration_ms, status, error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            summary.scanId,
            summary.timestamp ?? Date.now(),
            summary.workspacePath ?? '',
            summary.workspaceName ?? 'Workspace',
            summary.totalSizeBytes ?? 0,
            summary.totalFileCount ?? 0,
            summary.totalFolderCount ?? 0,
            summary.scannedFileCount ?? 0,
            summary.excludedFileCount ?? 0,
            summary.excludedFolderCount ?? 0,
            summary.scanDurationMs ?? 0,
            summary.status ?? 'completed',
            summary.error ?? null
          ]
        );

        // 2. Insert file_entries (prefer allFiles if provided, otherwise largestFiles)
        const filesToInsert = (allFiles && allFiles.length > 0) ? allFiles : largestFiles;
        const fileStmt = db.prepare(
          `INSERT INTO file_entries (
            id, scan_id, path, name, extension, size_bytes, last_modified
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        for (const file of filesToInsert) {
          fileStmt.run([
            randomUUID(),
            summary.scanId,
            file.path ?? '',
            file.name ?? (file.path ? file.path.split(/[/\\]/).pop() ?? '' : ''),
            file.extension ? file.extension.toLowerCase().replace(/^\./, '') : '',
            file.sizeBytes ?? 0,
            file.lastModified ?? Date.now()
          ]);
        }
        fileStmt.free();

        // 3. Insert folder_stats
        for (const dir of directories) {
          db.run(
            `INSERT INTO folder_stats (
              id, scan_id, path, name, direct_files, recursive_files, total_size_bytes, child_dirs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              summary.scanId,
              dir.path ?? '',
              dir.name ?? (dir.path ? dir.path.split(/[/\\]/).pop() ?? '' : ''),
              dir.directFileCount ?? 0,
              dir.recursiveFileCount ?? 0,
              dir.totalSizeBytes ?? 0,
              dir.childDirCount ?? 0
            ]
          );
        }

        // 4. Insert duplicate_groups
        for (const dup of duplicates) {
          db.run(
            `INSERT INTO duplicate_groups (
              id, scan_id, hash, file_size_bytes, file_count, files_json, wasted_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              summary.scanId,
              dup.hash ?? '',
              dup.fileSizeBytes ?? 0,
              dup.fileCount ?? dup.files.length,
              JSON.stringify(dup.files ?? []),
              dup.wastedBytes ?? 0
            ]
          );
        }

        db.run('COMMIT');
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    } catch (err) {
      console.warn('[DevPulse FileScansRepository] Save scan failed:', err);
    }
  }

  getLatestScan(workspacePath?: string): WorkspaceFileScanSummary | null {
    try {
      const db = this.getDb();
      const query = workspacePath
        ? 'SELECT * FROM file_scans WHERE workspace_path = ? ORDER BY timestamp DESC LIMIT 1'
        : 'SELECT * FROM file_scans ORDER BY timestamp DESC LIMIT 1';

      const stmt = db.prepare(query);
      if (workspacePath) {
        stmt.bind([workspacePath]);
      }

      let result: WorkspaceFileScanSummary | null = null;
      if (stmt.step()) {
        const row = stmt.getAsObject();
        result = {
          scanId: String(row.id),
          timestamp: Number(row.timestamp),
          workspacePath: String(row.workspace_path),
          workspaceName: String(row.workspace_name),
          totalSizeBytes: Number(row.total_size_bytes),
          totalFileCount: Number(row.total_files),
          totalFolderCount: Number(row.total_folders),
          scannedFileCount: Number(row.scanned_files),
          excludedFileCount: Number(row.excluded_files),
          excludedFolderCount: Number(row.excluded_folders),
          scanDurationMs: Number(row.duration_ms),
          status: String(row.status) as WorkspaceFileScanSummary['status'],
          error: row.error ? String(row.error) : undefined
        };
      }
      stmt.free();
      return result;
    } catch {
      return null;
    }
  }

  getScanHistory(workspacePath?: string, limit = 15): { timestamp: number; totalSizeBytes: number; fileCount: number }[] {
    try {
      const db = this.getDb();
      const query = workspacePath
        ? 'SELECT timestamp, total_size_bytes, total_files FROM file_scans WHERE workspace_path = ? AND status = "completed" ORDER BY timestamp DESC LIMIT ?'
        : 'SELECT timestamp, total_size_bytes, total_files FROM file_scans WHERE status = "completed" ORDER BY timestamp DESC LIMIT ?';

      const stmt = db.prepare(query);
      if (workspacePath) {
        stmt.bind([workspacePath, limit]);
      } else {
        stmt.bind([limit]);
      }

      const history: { timestamp: number; totalSizeBytes: number; fileCount: number }[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        history.push({
          timestamp: Number(row.timestamp),
          totalSizeBytes: Number(row.total_size_bytes),
          fileCount: Number(row.total_files)
        });
      }
      stmt.free();
      return history.reverse(); // Chronological order
    } catch {
      return [];
    }
  }

  getGrowthComparison(workspacePath?: string): WorkspaceGrowthComparison | null {
    try {
      const history = this.getScanHistory(workspacePath, 2);
      if (history.length === 0) return null;

      const current = history[history.length - 1];
      const previous = history.length > 1 ? history[history.length - 2] : null;

      const diffBytes = previous ? current.totalSizeBytes - previous.totalSizeBytes : 0;
      const growthPct = previous && previous.totalSizeBytes > 0
        ? ((current.totalSizeBytes - previous.totalSizeBytes) / previous.totalSizeBytes) * 100
        : 0;

      return {
        currentSizeBytes: current.totalSizeBytes,
        previousSizeBytes: previous ? previous.totalSizeBytes : null,
        differenceBytes: diffBytes,
        growthPercentage: Math.round(growthPct * 10) / 10,
        currentFiles: current.fileCount,
        previousFiles: previous ? previous.fileCount : null
      };
    } catch {
      return null;
    }
  }

  getLargestFiles(scanId: string, limit = 20): FileEntryRecord[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        'SELECT path, name, extension, size_bytes, last_modified FROM file_entries WHERE scan_id = ? ORDER BY size_bytes DESC LIMIT ?'
      );
      stmt.bind([scanId, limit]);

      const files: FileEntryRecord[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        files.push({
          path: String(row.path),
          name: String(row.name),
          extension: String(row.extension),
          sizeBytes: Number(row.size_bytes),
          lastModified: Number(row.last_modified)
        });
      }
      stmt.free();
      return files;
    } catch {
      return [];
    }
  }

  getFolderStats(scanId: string): DirectoryStats[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        'SELECT path, name, direct_files, recursive_files, total_size_bytes, child_dirs FROM folder_stats WHERE scan_id = ? ORDER BY total_size_bytes DESC LIMIT 100'
      );
      stmt.bind([scanId]);

      const dirs: DirectoryStats[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        dirs.push({
          path: String(row.path),
          name: String(row.name),
          directFileCount: Number(row.direct_files),
          recursiveFileCount: Number(row.recursive_files),
          totalSizeBytes: Number(row.total_size_bytes),
          childDirCount: Number(row.child_dirs)
        });
      }
      stmt.free();
      return dirs;
    } catch {
      return [];
    }
  }

  getDuplicates(scanId: string): DuplicateGroup[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        'SELECT hash, file_size_bytes, file_count, files_json, wasted_bytes FROM duplicate_groups WHERE scan_id = ? ORDER BY wasted_bytes DESC'
      );
      stmt.bind([scanId]);

      const dups: DuplicateGroup[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        let files: string[] = [];
        try {
          files = JSON.parse(String(row.files_json));
        } catch {}

        dups.push({
          hash: String(row.hash),
          fileSizeBytes: Number(row.file_size_bytes),
          fileCount: Number(row.file_count),
          files,
          wastedBytes: Number(row.wasted_bytes)
        });
      }
      stmt.free();
      return dups;
    } catch {
      return [];
    }
  }

  getHistory(workspacePath?: string, limit = 20) {
    return this.getScanHistory(workspacePath, limit);
  }

  getDuplicateGroups(scanId: string): DuplicateGroup[] {
    return this.getDuplicates(scanId);
  }

  getExtensionBreakdown(scanId: string): ExtensionBreakdown[] {
    try {
      const db = this.getDb();
      const scanStmt = db.prepare('SELECT total_size_bytes FROM file_scans WHERE id = ?');
      scanStmt.bind([scanId]);
      let totalSizeBytes = 0;
      if (scanStmt.step()) {
        const row = scanStmt.getAsObject();
        totalSizeBytes = Number(row.total_size_bytes) || 0;
      }
      scanStmt.free();

      const stmt = db.prepare(`
        SELECT 
          extension,
          COUNT(*) as file_count,
          SUM(size_bytes) as total_size
        FROM file_entries
        WHERE scan_id = ?
        GROUP BY extension
        ORDER BY total_size DESC
      `);
      stmt.bind([scanId]);
      const results: ExtensionBreakdown[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const ext = String(row.extension || 'no-extension');
        const count = Number(row.file_count);
        const bytes = Number(row.total_size);
        const percentage = totalSizeBytes > 0 ? Math.round((bytes / totalSizeBytes) * 1000) / 10 : 0;
        results.push({
          extension: ext,
          fileCount: count,
          totalSizeBytes: bytes,
          percentage
        });
      }
      stmt.free();
      return results;
    } catch {
      return [];
    }
  }

  clearHistory(workspacePath?: string): void {
    this.clearScanHistory(workspacePath);
  }

  getFilesByExtension(
    workspacePath: string | undefined,
    rawExt: string,
    options?: {
      search?: string;
      sortBy?: 'name' | 'path' | 'size' | 'modified';
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }
  ): ExtensionFilesResult {
    const ext = rawExt.replace(/^\./, '').toLowerCase().trim();
    const latest = this.getLatestScan(workspacePath);
    if (!latest) {
      return {
        extension: ext,
        totalCount: 0,
        totalSizeBytes: 0,
        files: [],
        page: 1,
        pageSize: options?.pageSize ?? 50,
        totalPages: 0
      };
    }

    try {
      const db = this.getDb();
      let countQuery = 'SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size FROM file_entries WHERE scan_id = ? AND LOWER(extension) = ?';
      const countParams: (string | number)[] = [latest.scanId, ext];

      let dataQuery = 'SELECT path, name, extension, size_bytes, last_modified FROM file_entries WHERE scan_id = ? AND LOWER(extension) = ?';
      const dataParams: (string | number)[] = [latest.scanId, ext];

      if (options?.search && options.search.trim().length > 0) {
        const term = `%${options.search.trim().toLowerCase()}%`;
        countQuery += ' AND (LOWER(name) LIKE ? OR LOWER(path) LIKE ?)';
        countParams.push(term, term);
        dataQuery += ' AND (LOWER(name) LIKE ? OR LOWER(path) LIKE ?)';
        dataParams.push(term, term);
      }

      // Sorting
      const sortColumn =
        options?.sortBy === 'size' ? 'size_bytes' :
        options?.sortBy === 'modified' ? 'last_modified' :
        options?.sortBy === 'path' ? 'path' : 'name';
      const order = options?.sortOrder === 'asc' ? 'ASC' : 'DESC';
      dataQuery += ` ORDER BY ${sortColumn} ${order}`;

      // Pagination
      const page = Math.max(1, options?.page ?? 1);
      const pageSize = Math.max(1, Math.min(200, options?.pageSize ?? 50));
      const offset = (page - 1) * pageSize;
      dataQuery += ' LIMIT ? OFFSET ?';
      dataParams.push(pageSize, offset);

      // Execute count
      const countStmt = db.prepare(countQuery);
      countStmt.bind(countParams);
      let totalCount = 0;
      let totalSizeBytes = 0;
      if (countStmt.step()) {
        const row = countStmt.getAsObject();
        totalCount = Number(row.count ?? 0);
        totalSizeBytes = Number(row.total_size ?? 0);
      }
      countStmt.free();

      // Execute data query
      const dataStmt = db.prepare(dataQuery);
      dataStmt.bind(dataParams);
      const files: FileEntryRecord[] = [];
      while (dataStmt.step()) {
        const row = dataStmt.getAsObject();
        files.push({
          path: String(row.path),
          name: String(row.name),
          extension: String(row.extension),
          sizeBytes: Number(row.size_bytes),
          lastModified: Number(row.last_modified)
        });
      }
      dataStmt.free();

      const totalPages = Math.ceil(totalCount / pageSize);

      return {
        extension: ext,
        totalCount,
        totalSizeBytes,
        files,
        page,
        pageSize,
        totalPages
      };
    } catch (err) {
      console.warn('[DevPulse FileScansRepository] getFilesByExtension error:', err);
      return {
        extension: ext,
        totalCount: 0,
        totalSizeBytes: 0,
        files: [],
        page: 1,
        pageSize: options?.pageSize ?? 50,
        totalPages: 0
      };
    }
  }

  clearScanHistory(workspacePath?: string): void {
    try {
      const db = this.getDb();
      if (workspacePath) {
        db.run('DELETE FROM file_scans WHERE workspace_path = ?', [workspacePath]);
      } else {
        db.run('DELETE FROM file_scans');
        db.run('DELETE FROM file_entries');
        db.run('DELETE FROM folder_stats');
        db.run('DELETE FROM duplicate_groups');
      }
    } catch (err) {
      console.warn('[DevPulse FileScansRepository] Clear scan history failed:', err);
    }
  }
}

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import ignore, { type Ignore } from 'ignore';
import type {
  WorkspaceFileScanSummary,
  FileEntryRecord,
  DirectoryStats,
  ExtensionBreakdown,
  DuplicateGroup,
  ScanProgress
} from '../../shared/types';

export interface ScannerOptions {
  exclusions?: string[];
  enableDuplicates?: boolean;
  maxHashSizeMb?: number;
  concurrency?: number;
  timeoutMs?: number;
  onProgress?: (progress: ScanProgress) => void;
}

export const DEFAULT_EXCLUSIONS = [
  'node_modules',
  '.git',
  '.vscode',
  '.gemini',
  '.agents',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'tmp',
  'temp',
  '*.log',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock'
];

export class FilesystemScanner {
  private isCancelled = false;

  cancel(): void {
    this.isCancelled = true;
  }

  async scan(
    workspaceRoot: string,
    workspaceName: string,
    options: ScannerOptions = {}
  ): Promise<{
    summary: WorkspaceFileScanSummary;
    largestFiles: FileEntryRecord[];
    allFiles: FileEntryRecord[];
    directories: DirectoryStats[];
    extensions: ExtensionBreakdown[];
    duplicates: DuplicateGroup[];
  }> {
    this.isCancelled = false;
    const scanId = crypto.randomUUID();
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 120000; // 2 min default timeout

    // Initialize gitignore matcher
    const ig = ignore();
    ig.add(DEFAULT_EXCLUSIONS);
    if (options.exclusions && options.exclusions.length > 0) {
      ig.add(options.exclusions);
    }

    // Try reading workspace .gitignore
    try {
      const gitignorePath = path.join(workspaceRoot, '.gitignore');
      const gitignoreContent = await fsp.readFile(gitignorePath, 'utf8');
      ig.add(gitignoreContent);
    } catch {
      // .gitignore does not exist or unreadable, continue
    }

    const filesBySize = new Map<number, { path: string; name: string; fullPath: string; ext: string; mtime: number }[]>();
    const extSizes = new Map<string, { count: number; bytes: number }>();
    const allLargestFiles: FileEntryRecord[] = [];
    const dirStatsMap = new Map<string, { directFiles: number; childDirs: number; directBytes: number }>();
    const visitedRealPaths = new Set<string>();

    let totalSizeBytes = 0;
    let totalFileCount = 0;
    let totalFolderCount = 0;
    let scannedFiles = 0;
    let excludedFiles = 0;
    let excludedFolders = 0;

    const rootRealPath = await fsp.realpath(workspaceRoot).catch(() => workspaceRoot);
    visitedRealPaths.add(rootRealPath);

    // Queue-based async traversal
    const dirQueue: string[] = [workspaceRoot];
    dirStatsMap.set('', { directFiles: 0, childDirs: 0, directBytes: 0 });

    while (dirQueue.length > 0) {
      if (this.isCancelled) {
        throw new Error('Scan cancelled by user');
      }
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Scan timed out after ${timeoutMs / 1000} seconds`);
      }

      const currentDir = dirQueue.shift()!;
      const relDir = path.relative(workspaceRoot, currentDir).replace(/\\/g, '/');

      let entries: fs.Dirent[] = [];
      try {
        entries = await fsp.readdir(currentDir, { withFileTypes: true });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'EACCES' || code === 'EPERM') {
          // Permission denied, skip gracefully
          continue;
        }
        continue;
      }

      const currentDirStats = dirStatsMap.get(relDir) ?? { directFiles: 0, childDirs: 0, directBytes: 0 };
      dirStatsMap.set(relDir, currentDirStats);

      for (const entry of entries) {
        if (this.isCancelled) break;

        const entryRelPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        const entryFullPath = path.join(currentDir, entry.name);

        // Check gitignore / exclusions
        if (ig.ignores(entryRelPath) || ig.ignores(`${entryRelPath}/`)) {
          if (entry.isDirectory()) {
            excludedFolders++;
          } else {
            excludedFiles++;
          }
          continue;
        }

        if (entry.isSymbolicLink()) {
          // Check for symlink cycles or pointing outside workspace
          try {
            const resolved = await fsp.realpath(entryFullPath);
            if (visitedRealPaths.has(resolved) || !resolved.startsWith(rootRealPath)) {
              continue;
            }
            visitedRealPaths.add(resolved);
          } catch {
            continue;
          }
        }

        if (entry.isDirectory()) {
          totalFolderCount++;
          currentDirStats.childDirs++;
          dirQueue.push(entryFullPath);
        } else if (entry.isFile()) {
          scannedFiles++;
          totalFileCount++;
          currentDirStats.directFiles++;

          try {
            const stat = await fsp.stat(entryFullPath);
            const size = stat.size;
            totalSizeBytes += size;
            currentDirStats.directBytes += size;

            const ext = path.extname(entry.name).toLowerCase().replace('.', '') || 'no-ext';
            const mtime = stat.mtimeMs;

            // Track extension analytics
            const extStat = extSizes.get(ext) ?? { count: 0, bytes: 0 };
            extStat.count++;
            extStat.bytes += size;
            extSizes.set(ext, extStat);

            const fileEntry: FileEntryRecord = {
              path: entryRelPath,
              name: entry.name,
              extension: ext,
              sizeBytes: size,
              lastModified: mtime
            };

            // Collect top largest files
            allLargestFiles.push(fileEntry);

            // Group by size for duplicate detection
            if (options.enableDuplicates !== false && size > 0) {
              const list = filesBySize.get(size) ?? [];
              list.push({ path: entryRelPath, name: entry.name, fullPath: entryFullPath, ext, mtime });
              filesBySize.set(size, list);
            }

            if (scannedFiles % 50 === 0 && options.onProgress) {
              options.onProgress({
                scannedCount: scannedFiles,
                currentPath: entryRelPath,
                statusText: `Scanning: ${entry.name}`
              });
            }
          } catch {
            // Unreadable file, skip
          }
        }
      }
    }

    // Sort and keep top 20 largest files
    allLargestFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const largestFiles = allLargestFiles.slice(0, 20);

    // Build directory hierarchy and recursive stats
    const directories: DirectoryStats[] = [];
    const sortedDirs = Array.from(dirStatsMap.keys()).sort((a, b) => b.split('/').length - a.split('/').length);
    const recursiveSizes = new Map<string, number>();
    const recursiveFileCounts = new Map<string, number>();

    for (const d of sortedDirs) {
      const stats = dirStatsMap.get(d)!;
      let rSize = stats.directBytes;
      let rFiles = stats.directFiles;

      for (const [otherDir, otherStats] of dirStatsMap.entries()) {
        if (otherDir !== d && otherDir.startsWith(d ? `${d}/` : '')) {
          rSize += otherStats.directBytes;
          rFiles += otherStats.directFiles;
        }
      }

      recursiveSizes.set(d, rSize);
      recursiveFileCounts.set(d, rFiles);

      const dirName = d ? path.basename(d) : workspaceName;
      directories.push({
        path: d || '.',
        name: dirName,
        directFileCount: stats.directFiles,
        recursiveFileCount: rFiles,
        totalSizeBytes: rSize,
        childDirCount: stats.childDirs
      });
    }

    // Sort directories by recursive total size descending
    directories.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

    // Extension breakdown
    const extensions: ExtensionBreakdown[] = Array.from(extSizes.entries())
      .map(([ext, data]) => ({
        extension: ext,
        fileCount: data.count,
        totalSizeBytes: data.bytes,
        percentage: totalSizeBytes > 0 ? Math.round((data.bytes / totalSizeBytes) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

    // Streaming duplicate detection
    const duplicates: DuplicateGroup[] = [];
    if (options.enableDuplicates !== false && !this.isCancelled) {
      const maxHashBytes = (options.maxHashSizeMb ?? 50) * 1024 * 1024;
      const candidates = Array.from(filesBySize.entries()).filter(([_, files]) => files.length > 1);

      if (options.onProgress && candidates.length > 0) {
        options.onProgress({
          scannedCount: scannedFiles,
          currentPath: 'Analyzing duplicate candidate files...',
          statusText: `Hashing duplicate candidates (${candidates.length} size groups)...`
        });
      }

      for (const [size, files] of candidates) {
        if (this.isCancelled) break;
        const hashMap = new Map<string, string[]>();

        for (const file of files) {
          try {
            const hash = await this.hashFileStream(file.fullPath, Math.min(size, maxHashBytes));
            const existing = hashMap.get(hash) ?? [];
            existing.push(file.path);
            hashMap.set(hash, existing);
          } catch {
            // Cannot read file for hashing
          }
        }

        for (const [hash, matchingFiles] of hashMap.entries()) {
          if (matchingFiles.length > 1) {
            duplicates.push({
              hash,
              fileSizeBytes: size,
              fileCount: matchingFiles.length,
              files: matchingFiles,
              wastedBytes: (matchingFiles.length - 1) * size
            });
          }
        }
      }

      duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);
    }

    const durationMs = Date.now() - startTime;

    const summary: WorkspaceFileScanSummary = {
      scanId,
      workspacePath: workspaceRoot,
      workspaceName,
      totalSizeBytes,
      totalFileCount,
      totalFolderCount,
      scannedFileCount: scannedFiles,
      excludedFileCount: excludedFiles,
      excludedFolderCount: excludedFolders,
      scanDurationMs: durationMs,
      timestamp: Date.now(),
      status: this.isCancelled ? 'cancelled' : 'completed'
    };

    return {
      summary,
      largestFiles,
      allFiles: allLargestFiles,
      directories: directories.slice(0, 50),
      extensions,
      duplicates
    };
  }

  private hashFileStream(filePath: string, maxBytes: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      let bytesRead = 0;

      const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

      stream.on('data', chunk => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = maxBytes - bytesRead;

        if (remaining <= 0) {
          stream.destroy();
          resolve(hash.digest('hex'));
          return;
        }

        if (buffer.length <= remaining) {
          hash.update(buffer);
          bytesRead += buffer.length;
        } else {
          hash.update(buffer.subarray(0, remaining));
          bytesRead += remaining;
          stream.destroy();
          resolve(hash.digest('hex'));
        }
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', err => {
        reject(err);
      });
    });
  }
}

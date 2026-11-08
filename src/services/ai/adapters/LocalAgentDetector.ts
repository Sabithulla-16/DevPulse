import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DetectedAgentUsage {
  id?: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number;
  timestamp: number;
  source: string;
}

export class LocalAgentDetector {
  private lastScannedTimestamps = new Map<string, number>();
  private processedHashes = new Set<string>();

  constructor(private readonly isAlreadyIngested?: (keyOrSource: string, timestamp?: number) => boolean) {}

  /**
   * Discovers and parses token/session metrics from local developer CLI agents
   * (e.g. Claude Code, Aider, OpenCode) strictly reading numeric token metadata
   * without inspecting or storing prompts or code contents.
   */
  public async scanAgentTelemetry(): Promise<DetectedAgentUsage[]> {
    const results: DetectedAgentUsage[] = [];

    try {
      const homeDir = os.homedir();
      const claudeDir = path.join(homeDir, '.claude');

      if (fs.existsSync(claudeDir)) {
        await this.scanClaudeDirectory(claudeDir, results, 0);
      }
    } catch {
      // Non-fatal, privacy safe
    }

    return results;
  }

  private async scanClaudeDirectory(
    dirPath: string,
    results: DetectedAgentUsage[],
    depth = 0
  ): Promise<void> {
    if (depth > 3) return;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories like projects, sessions
          await this.scanClaudeDirectory(fullPath, results, depth + 1);
        } else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonl'))) {
          await this.parseSessionFile(fullPath, results);
        }
      }
    } catch {
      // Directory inaccessible or deleted during scan
    }
  }

  public async parseSessionFile(
    filePath: string,
    results: DetectedAgentUsage[]
  ): Promise<void> {
    try {
      const stat = await fs.promises.stat(filePath);
      // Skip files larger than 10MB to avoid high memory spikes
      if (stat.size > 10 * 1024 * 1024) return;

      const lastRead = this.lastScannedTimestamps.get(filePath) || 0;
      if (stat.mtimeMs <= lastRead) return;

      const content = await fs.promises.readFile(filePath, 'utf-8');

      if (filePath.endsWith('.jsonl')) {
        this.parseJsonlContent(content, filePath, stat.mtimeMs, results);
      } else {
        this.parseJsonContent(content, filePath, stat.mtimeMs, results);
      }

      this.lastScannedTimestamps.set(filePath, stat.mtimeMs);
    } catch {
      // Handle partially written, locked, or malformed files gracefully
    }
  }

  private parseJsonContent(
    content: string,
    filePath: string,
    fileMtime: number,
    results: DetectedAgentUsage[]
  ): void {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      this.extractUsageFromObject(data, filePath, fileMtime, 0, 'claude-code', results);
    } catch {
      // Ignore partially written or invalid JSON
    }
  }

  private parseJsonlContent(
    content: string,
    filePath: string,
    fileMtime: number,
    results: DetectedAgentUsage[]
  ): void {
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const data = JSON.parse(line) as Record<string, unknown>;
        this.extractUsageFromObject(data, filePath, fileMtime, i, 'claude-code', results);
      } catch {
        // Skip malformed individual lines (e.g. streaming chunks in-progress)
      }
    }
  }

  private extractUsageFromObject(
    obj: Record<string, unknown>,
    filePath: string,
    defaultTime: number,
    lineIndex: number,
    source: string,
    results: DetectedAgentUsage[]
  ): void {
    if (!obj || typeof obj !== 'object') return;

    // Check directly or nested inside message object
    let usageObj = (obj.usage || obj.token_usage || obj.tokens) as Record<string, unknown> | undefined;
    let model = String(obj.model || 'claude-3-5-sonnet');

    if (!usageObj && obj.message && typeof obj.message === 'object') {
      const msg = obj.message as Record<string, unknown>;
      usageObj = (msg.usage || msg.token_usage) as Record<string, unknown> | undefined;
      if (msg.model) model = String(msg.model);
    }

    if (usageObj && typeof usageObj === 'object') {
      const pTokens = Number(usageObj.input_tokens || usageObj.prompt_tokens || 0);
      const cTokens = Number(usageObj.output_tokens || usageObj.completion_tokens || 0);
      const totalTokens = Number(usageObj.total_tokens || (pTokens + cTokens));

      let time = defaultTime;
      if (typeof obj.timestamp === 'number') {
        time = obj.timestamp > 1e11 ? obj.timestamp : obj.timestamp * 1000;
      } else if (typeof obj.timestamp === 'string') {
        const parsed = Date.parse(obj.timestamp);
        if (!isNaN(parsed)) time = parsed;
      } else if (typeof obj.created_at === 'string') {
        const parsed = Date.parse(obj.created_at);
        if (!isNaN(parsed)) time = parsed;
      } else if (typeof obj.created_at === 'number') {
        time = obj.created_at > 1e11 ? obj.created_at : obj.created_at * 1000;
      } else if (obj.message && typeof obj.message === 'object') {
        const msg = obj.message as Record<string, unknown>;
        if (typeof msg.created_at === 'string') {
          const parsed = Date.parse(msg.created_at);
          if (!isNaN(parsed)) time = parsed;
        } else if (typeof msg.created_at === 'number') {
          time = msg.created_at > 1e11 ? msg.created_at : msg.created_at * 1000;
        }
      }

      const durationMs = typeof obj.duration_ms === 'number' ? obj.duration_ms : undefined;

      if (pTokens > 0 || cTokens > 0) {
        // Unique signature for duplicate prevention across restarts and multiple project sessions
        // Does not depend on file modification time so appending turns does not invalidate earlier keys
        const dedupeKey = `${source}:${path.basename(filePath)}:${lineIndex}:${pTokens}:${cTokens}`;
        if (this.processedHashes.has(dedupeKey)) return;

        // Check if database already ingested this record via idempotency key
        if (this.isAlreadyIngested && this.isAlreadyIngested(dedupeKey, time)) {
          this.processedHashes.add(dedupeKey);
          return;
        }

        this.processedHashes.add(dedupeKey);
        results.push({
          id: dedupeKey,
          provider: 'anthropic',
          model,
          promptTokens: pTokens,
          completionTokens: cTokens,
          totalTokens,
          durationMs,
          timestamp: time,
          source
        });
      }
    }
  }
}

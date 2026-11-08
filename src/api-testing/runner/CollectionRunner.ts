import { randomUUID } from 'node:crypto';
import type { RequestExecutor } from '../core/RequestExecutor';
import type { ApiTestingRepository } from '../../database/repositories/ApiTestingRepository';
import type {
  ApiTestCollectionRunConfig,
  ApiTestRunSummary,
  ApiTestRunProgress,
  ApiTestRequestPayload,
  DevPulseSettings
} from '../../shared/types';
import type { ResolutionContext } from '../core/VariableResolver';

export class CollectionRunner {
  constructor(
    private readonly requestExecutor: RequestExecutor,
    private readonly repository: ApiTestingRepository
  ) {}

  async run(
    config: ApiTestCollectionRunConfig,
    requests: ApiTestRequestPayload[],
    baseResolutionContext: ResolutionContext,
    settings: DevPulseSettings,
    abortSignal?: AbortSignal,
    onProgress?: (progress: ApiTestRunProgress) => void
  ): Promise<ApiTestRunSummary> {
    const startedAt = Date.now();
    const runId = config.runId || randomUUID();
    const dataset = this.parseDataset(config.dataFileContent, config.dataFileType);

    const iterations = dataset.length > 0 ? dataset.length : Math.max(1, config.iterations || 1);
    const results: ApiTestRunSummary['results'] = [];

    let totalPassedAssertions = 0;
    let totalFailedAssertions = 0;
    let runStatus: 'completed' | 'failed' | 'cancelled' = 'completed';

    // 1. Pre-register Run in Database so foreign keys for results are satisfied
    this.repository.createRun({
      id: runId,
      collectionId: config.collectionId,
      environmentId: config.environmentId ?? undefined,
      iterationCount: iterations,
      totalRequests: 0,
      passedAssertions: 0,
      failedAssertions: 0,
      durationMs: 0,
      status: 'completed',
      startedAt,
      completedAt: startedAt
    });

    for (let iteration = 1; iteration <= iterations; iteration++) {
      if (abortSignal?.aborted) {
        runStatus = 'cancelled';
        break;
      }

      const iterationData = dataset[iteration - 1];

      for (let reqIdx = 0; reqIdx < requests.length; reqIdx++) {
        if (abortSignal?.aborted) {
          runStatus = 'cancelled';
          break;
        }

        const request = requests[reqIdx];
        onProgress?.({
          runId,
          iteration,
          totalIterations: iterations,
          requestIndex: reqIdx + 1,
          totalRequests: requests.length,
          currentRequestName: request.name,
          status: 'running'
        });

        const resolutionContext: ResolutionContext = {
          ...baseResolutionContext,
          iterationData
        };

        const executionId = randomUUID();
        const execResult = await this.requestExecutor.execute(
          {
            executionId,
            request,
            environmentId: config.environmentId,
            unsavedDraft: false
          },
          resolutionContext,
          settings,
          abortSignal
        );

        let failedAssertionsInReq = 0;
        for (const t of execResult.testResults) {
          if (t.passed) {
            totalPassedAssertions++;
          } else {
            totalFailedAssertions++;
            failedAssertionsInReq++;
          }
        }

        const isNetworkFailure = execResult.statusCode === 0 && !!execResult.error;
        const requestFailed = failedAssertionsInReq > 0 || isNetworkFailure;

        const resultItem = {
          iteration,
          requestId: request.id || randomUUID(),
          requestName: request.name,
          method: request.method,
          url: request.url,
          statusCode: execResult.statusCode > 0 ? execResult.statusCode : null,
          durationMs: execResult.durationMs,
          assertions: execResult.testResults.map(t => ({
            name: t.name,
            passed: t.passed,
            errorMessage: t.errorMessage
          })),
          errorMessage: execResult.error,
          executedAt: execResult.executedAt
        };
        results.push(resultItem);

        // Record in Database
        this.repository.addRunResult({
          id: randomUUID(),
          runId,
          iteration,
          requestId: resultItem.requestId,
          requestName: resultItem.requestName,
          method: resultItem.method,
          url: resultItem.url,
          statusCode: resultItem.statusCode ?? undefined,
          durationMs: resultItem.durationMs,
          assertionsJson: JSON.stringify(resultItem.assertions),
          errorMessage: resultItem.errorMessage,
          executedAt: resultItem.executedAt
        });

        if (config.stopOnFailure && requestFailed) {
          runStatus = 'failed';
          break;
        }

        // Delay between requests
        if (config.delayMs > 0 && reqIdx < requests.length - 1) {
          await this.delayWithAbort(config.delayMs, abortSignal);
        }
      }

      if (runStatus === 'failed' || runStatus === 'cancelled') {
        break;
      }
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    const summary: ApiTestRunSummary = {
      runId,
      collectionId: config.collectionId,
      environmentId: config.environmentId,
      iterationCount: iterations,
      totalRequests: results.length,
      passedAssertions: totalPassedAssertions,
      failedAssertions: totalFailedAssertions,
      durationMs,
      status: runStatus,
      startedAt,
      completedAt,
      results
    };

    // Update Run Summary in Database with final stats
    this.repository.updateRun(runId, {
      totalRequests: results.length,
      passedAssertions: totalPassedAssertions,
      failedAssertions: totalFailedAssertions,
      durationMs,
      status: runStatus,
      completedAt
    });

    return summary;
  }

  private async delayWithAbort(ms: number, abortSignal?: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve();
      }, ms);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve(); // Resolve on abort so loop can handle exit
        });
      }
    });
  }

  private parseDataset(content?: string, type?: 'csv' | 'json'): Record<string, string>[] {
    if (!content || !content.trim()) return [];

    if (type === 'json' || content.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed.map(item => {
            const row: Record<string, string> = {};
            for (const [k, v] of Object.entries(item)) {
              row[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
            }
            return row;
          });
        }
      } catch {
        return [];
      }
    }

    // RFC 4180 CSV parser
    try {
      const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const cleanLines = lines.filter(l => l.trim().length > 0);
      if (cleanLines.length < 2) return [];

      const headers = this.parseCsvLine(cleanLines[0]);
      const rows: Record<string, string>[] = [];

      for (let i = 1; i < cleanLines.length; i++) {
        const values = this.parseCsvLine(cleanLines[i]);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j] ?? '';
        }
        rows.push(row);
      }
      return rows;
    } catch {
      return [];
    }
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
}

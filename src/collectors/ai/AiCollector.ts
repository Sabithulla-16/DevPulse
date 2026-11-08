import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent } from '../../shared/types';
import type { AiIntelligenceRepository } from '../../database/repositories/AiIntelligenceRepository';
import { CostCalculator } from '../../services/ai/CostCalculator';
import { AiProviderRegistry } from '../../services/ai/AiProviderRegistry';
import { LocalAgentDetector } from '../../services/ai/adapters/LocalAgentDetector';
import { OllamaAdapter } from '../../services/ai/adapters/OllamaAdapter';

export class AiCollector implements Collector {
  readonly id = 'ai';
  readonly name = 'AI Intelligence';
  readonly description = 'Monitors LLM token consumption, model costs, and AI agent activity.';
  readonly category = 'ai' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private costCalculator: CostCalculator;
  private agentDetector: LocalAgentDetector;
  private lastError?: string;

  constructor(
    private readonly repo?: AiIntelligenceRepository,
    private readonly registry?: AiProviderRegistry
  ) {
    this.costCalculator = new CostCalculator(repo);
    this.agentDetector = new LocalAgentDetector((keyOrSource, timestamp) => {
      if (this.repo?.hasRecordByIdempotencyKey(keyOrSource)) return true;
      if (timestamp !== undefined && this.repo?.hasRecordWithSourceAndTimestamp(keyOrSource, timestamp)) return true;
      return false;
    });
  }

  async initialize(): Promise<void> {
    this.state = 'idle';
    if (this.repo) {
      this.costCalculator.refreshFromRepository();
    }
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.state = 'idle';
  }

  async collect(): Promise<MetricEvent[]> {
    const events: MetricEvent[] = [];
    this.state = 'running';

    try {
      // 1. Check local Ollama reachability & discover local models
      if (this.registry) {
        const ollama = this.registry.getAdapter('ollama');
        if (ollama instanceof OllamaAdapter) {
          const testRes = await ollama.testConnection();
          if (this.repo) {
            this.repo.saveProvider({
              id: 'ollama',
              name: 'Ollama (Local LLM)',
              status: testRes.success ? 'connected' : 'disconnected',
              connectionStatus: testRes.success ? 'connected' : 'disconnected',
              usageTrackingStatus: 'usage_tracking_active',
              modelCatalogStatus: testRes.models && testRes.models.length > 0 ? 'model_catalog_available' : 'model_catalog_unavailable',
              endpoint: ollama.getHost(),
              isLocal: true,
              availableModels: testRes.models || [],
              lastSyncedAt: Date.now(),
              error: testRes.success ? undefined : testRes.message
            });
          }

          // Ingest any pending instrumented Ollama requests
          const ollamaEvents = ollama.getAndClearPendingUsage();
          for (const ev of ollamaEvents) {
            if (this.repo) {
              this.repo.saveUsageRecord({
                provider: 'ollama',
                model: ev.model,
                inputTokens: ev.promptTokens,
                outputTokens: ev.completionTokens,
                totalTokens: ev.totalTokens,
                requestCount: 1,
                durationMs: ev.durationMs,
                estimatedCost: 0.0,
                currency: 'USD',
                source: ev.source,
                timestamp: ev.timestamp,
                idempotencyKey: `ollama:${ev.model}:${ev.timestamp}:${ev.totalTokens}`,
                pricingSnapshotJson: JSON.stringify({ inputPerMillion: 0, outputPerMillion: 0 })
              });
            }

            events.push({
              id: `ai-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              collectorId: this.id,
              type: 'ai.usage',
              timestamp: ev.timestamp,
              payload: {
                provider: 'ollama',
                model: ev.model,
                promptTokens: ev.promptTokens,
                completionTokens: ev.completionTokens,
                totalTokens: ev.totalTokens,
                cost: 0
              }
            });
          }
        }
      }

      // 2. Scan local agent metadata (e.g. Claude Code, CLI agents)
      const detectedUsages = await this.agentDetector.scanAgentTelemetry();
      for (const usage of detectedUsages) {
        const estimatedCost = this.costCalculator.calculateCost(
          usage.provider,
          usage.model,
          usage.promptTokens,
          usage.completionTokens
        );

        const pricing = this.costCalculator.matchPricing(usage.provider, usage.model);

        if (this.repo) {
          this.repo.saveUsageRecord({
            provider: usage.provider,
            model: usage.model,
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
            requestCount: 1,
            durationMs: usage.durationMs,
            estimatedCost,
            currency: 'USD',
            source: usage.source,
            timestamp: usage.timestamp,
            idempotencyKey: usage.id,
            isEstimated: pricing.isUnknown,
            pricingSnapshotJson: JSON.stringify({
              inputPerMillion: pricing.inputCostPerMillion,
              outputPerMillion: pricing.outputCostPerMillion,
              isUnknown: pricing.isUnknown
            })
          });
        }

        events.push({
          id: `ai-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          collectorId: this.id,
          type: 'ai.usage',
          timestamp: usage.timestamp,
          payload: {
            provider: usage.provider,
            model: usage.model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
            estimatedCost,
            source: usage.source
          }
        });
      }

      this.lastError = undefined;
    } catch (err: unknown) {
      this.state = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
    }

    return events;
  }

  getStatus(): CollectorStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: true,
      state: this.state,
      implemented: true,
      error: this.lastError
    };
  }
}

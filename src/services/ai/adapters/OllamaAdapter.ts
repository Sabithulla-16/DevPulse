import type {
  IAiAdapter,
  ConnectionTestResult,
  AiDiscoveredModel,
  AiChatPayload,
  AiStreamChunk,
  AiChatResult,
  ModelCapabilities
} from './IAiAdapter';
import { parseNdjsonStream, estimateTokens } from './streamingUtils';

export interface OllamaUsageEvent {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  success: boolean;
  source: string;
  timestamp: number;
}

export class OllamaAdapter implements IAiAdapter {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local LLM)';
  readonly type = 'local' as const;
  readonly requiresKey = false;

  private host: string;
  private pendingUsageEvents: OllamaUsageEvent[] = [];

  constructor(host = 'http://localhost:11434') {
    this.host = host.replace(/\/+$/, '');
  }

  public setHost(host: string): void {
    if (host && host.trim()) {
      this.host = host.trim().replace(/\/+$/, '');
    }
  }

  public getHost(): string {
    return this.host;
  }

  getModelCapabilities(modelId: string): ModelCapabilities {
    const m = (modelId || '').toLowerCase();
    const supportsVision = m.includes('vision') || m.includes('vl') || m.includes('llava') || m.includes('bakllava') || m.includes('moondream') || m.includes('minicpm');
    return {
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsVision,
      supportedParameters: ['temperature', 'topP', 'topK', 'maxTokens', 'stopSequences', 'seed'],
      isLocal: true,
      maxContextTokens: 32768,
      maxOutputTokens: 4096
    };
  }

  /**
   * Explicit instrumentation method for DevPulse integrations and proxies
   * to record request-level Ollama token consumption without storing prompts/responses.
   */
  public recordInstrumentedUsage(
    event: Omit<OllamaUsageEvent, 'timestamp' | 'totalTokens'> & {
      totalTokens?: number;
      timestamp?: number;
    }
  ): OllamaUsageEvent {
    const total = event.totalTokens ?? (event.promptTokens + event.completionTokens);
    const recorded: OllamaUsageEvent = {
      model: event.model || 'llama3',
      promptTokens: event.promptTokens || 0,
      completionTokens: event.completionTokens || 0,
      totalTokens: total,
      durationMs: event.durationMs || 0,
      success: event.success !== false,
      source: event.source || 'ollama-instrumentation',
      timestamp: event.timestamp || Date.now()
    };
    this.pendingUsageEvents.push(recorded);
    return recorded;
  }

  public getAndClearPendingUsage(): OllamaUsageEvent[] {
    const events = [...this.pendingUsageEvents];
    this.pendingUsageEvents = [];
    return events;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const versionRes = await fetch(`${this.host}/api/version`, {
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!versionRes.ok) {
        return {
          success: false,
          message: `Ollama returned HTTP status ${versionRes.status}`
        };
      }

      const versionData = await versionRes.json() as { version?: string };
      const latencyMs = Date.now() - start;

      // Also grab tags if possible
      const models = await this.discoverModels();
      const modelNames = models.map(m => m.name);

      return {
        success: true,
        message: `Ollama reachable at ${this.host} (v${versionData.version || 'unknown'})`,
        latencyMs,
        version: versionData.version,
        models: modelNames
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Unable to connect to Ollama at ${this.host}: ${msg}`
      };
    }
  }

  async discoverModels(): Promise<AiDiscoveredModel[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${this.host}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        return [];
      }

      const data = await res.json() as {
        models?: Array<{
          name: string;
          modified_at?: string;
          size?: number;
          details?: {
            family?: string;
            parameter_size?: string;
          };
        }>;
      };

      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      return data.models.map(m => ({
        name: m.name,
        family: m.details?.family || 'ollama',
        sizeBytes: m.size || 0,
        parameterSize: m.details?.parameter_size,
        modifiedAt: m.modified_at ? new Date(m.modified_at).getTime() : undefined
      }));
    } catch {
      return [];
    }
  }

  async chatStream(
    payload: AiChatPayload,
    _apiKey: string | undefined,
    onChunk: (chunk: AiStreamChunk) => void
  ): Promise<AiChatResult> {
    const start = Date.now();

    const options: Record<string, unknown> = {};
    if (payload.temperature !== undefined) options.temperature = payload.temperature;
    if (payload.topP !== undefined) options.top_p = payload.topP;
    if (payload.topK !== undefined) options.top_k = payload.topK;
    if (payload.maxTokens !== undefined) options.num_predict = payload.maxTokens;
    if (payload.seed !== undefined) options.seed = payload.seed;
    if (payload.stopSequences && payload.stopSequences.length > 0) options.stop = payload.stopSequences;

    const caps = this.getModelCapabilities(payload.model);
    const supportsVision = Boolean(caps.supportsVision);

    const formattedMessages = payload.messages.map(m => {
      const msgObj: Record<string, unknown> = {
        role: m.role,
        content: m.content
      };
      if (supportsVision && m.images && m.images.length > 0) {
        msgObj.images = m.images.map(img => img.base64Data.replace(/^data:[^;]+;base64,/, ''));
      }
      return msgObj;
    });

    const body: Record<string, unknown> = {
      model: payload.model,
      messages: formattedMessages,
      stream: true,
      options
    };

    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: payload.signal
    });

    if (!res.ok) {
      let errMsg = `Ollama error ${res.status}`;
      try {
        const errJson = await res.json() as { error?: string };
        if (errJson?.error) errMsg = errJson.error;
      } catch {}
      throw new Error(errMsg);
    }

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    await parseNdjsonStream(res, (json: any) => {
      if (json.message?.content) {
        fullText += json.message.content;
        onChunk({ text: json.message.content });
      }
      if (json.prompt_eval_count) {
        promptTokens = json.prompt_eval_count;
      }
      if (json.eval_count) {
        completionTokens = json.eval_count;
      }
    });

    const durationMs = Date.now() - start;
    if (promptTokens === 0) {
      promptTokens = estimateTokens(payload.messages.map(m => m.content).join(' '));
    }
    if (completionTokens === 0) {
      completionTokens = estimateTokens(fullText);
    }

    // Record usage for internal telemetry
    this.recordInstrumentedUsage({
      model: payload.model,
      promptTokens,
      completionTokens,
      durationMs,
      success: true,
      source: 'playground'
    });

    return {
      fullText,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      durationMs
    };
  }
}

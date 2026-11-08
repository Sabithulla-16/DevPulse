import type {
  IAiAdapter,
  ConnectionTestResult,
  AiDiscoveredModel,
  AiChatPayload,
  AiStreamChunk,
  AiChatResult,
  ModelCapabilities
} from './IAiAdapter';
import { parseSseStream, estimateTokens } from './streamingUtils';

export class CustomOpenAIAdapter implements IAiAdapter {
  readonly id: string;
  readonly name: string;
  readonly type = 'cloud' as const;
  readonly requiresKey: boolean;

  private baseUrl: string;
  private configuredModels: string[];
  private customHeaders: Record<string, string>;

  constructor(
    id: string,
    name: string,
    baseUrl: string,
    configuredModels: string[] = [],
    customHeaders: Record<string, string> = {},
    requiresKey = true
  ) {
    this.id = id.toLowerCase();
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.configuredModels = configuredModels;
    this.customHeaders = customHeaders;
    this.requiresKey = requiresKey;
  }

  public updateConfig(baseUrl: string, configuredModels: string[], customHeaders: Record<string, string>): void {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.configuredModels = configuredModels;
    this.customHeaders = customHeaders;
  }

  getModelCapabilities(modelId: string): ModelCapabilities {
    const isLocal = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    const m = (modelId || '').toLowerCase();
    const supportsVision = m.includes('vision') || m.includes('vl') || m.includes('llava') || m.includes('4o') || m.includes('qwen');
    return {
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsVision,
      supportedParameters: ['temperature', 'topP', 'maxTokens', 'stopSequences'],
      isLocal,
      maxContextTokens: 32768,
      maxOutputTokens: 4096
    };
  }

  async testConnection(apiKey?: string): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const headers: Record<string, string> = { ...this.customHeaders };
      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const res = await fetch(`${this.baseUrl}/models`, {
        headers,
        signal: controller.signal
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, message: `Unauthorized (401) at ${this.baseUrl}. Check API key.` };
        }
        return { success: false, message: `Endpoint returned HTTP status ${res.status}.` };
      }

      const data = await res.json() as { data?: Array<{ id: string }> };
      const discovered = (data.data || []).map(m => m.id);
      const allModels = discovered.length > 0 ? discovered : this.configuredModels;

      return {
        success: true,
        message: `Successfully connected to ${this.name} (${allModels.length} models available)`,
        latencyMs,
        models: allModels
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection to ${this.baseUrl} failed: ${msg}`
      };
    }
  }

  async discoverModels(apiKey?: string): Promise<AiDiscoveredModel[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const headers: Record<string, string> = { ...this.customHeaders };
      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const res = await fetch(`${this.baseUrl}/models`, {
        headers,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        return this.configuredModels.map(m => ({ name: m, family: 'custom' }));
      }

      const data = await res.json() as { data?: Array<{ id: string }> };
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        return data.data.map(m => ({
          name: m.id,
          family: 'custom'
        }));
      }

      return this.configuredModels.map(m => ({ name: m, family: 'custom' }));
    } catch {
      return this.configuredModels.map(m => ({ name: m, family: 'custom' }));
    }
  }

  async chatStream(
    payload: AiChatPayload,
    apiKey: string | undefined,
    onChunk: (chunk: AiStreamChunk) => void
  ): Promise<AiChatResult> {
    const start = Date.now();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const caps = this.getModelCapabilities(payload.model);
    const supportsVision = Boolean(caps.supportsVision);

    const formattedMessages = payload.messages.map(m => {
      if (supportsVision && m.images && m.images.length > 0) {
        const textPrompt = m.content && m.content.trim() ? m.content : 'Describe this image.';
        const parts: Array<Record<string, unknown>> = [{ type: 'text', text: textPrompt }];
        for (const img of m.images) {
          let mime = (img.mimeType || 'image/jpeg').toLowerCase();
          if (mime === 'image/jpg') mime = 'image/jpeg';
          let url = img.base64Data.startsWith('data:')
            ? img.base64Data
            : `data:${mime};base64,${img.base64Data}`;
          if (url.startsWith('data:image/jpg;')) {
            url = url.replace('data:image/jpg;', 'data:image/jpeg;');
          }
          parts.push({
            type: 'image_url',
            image_url: { url }
          });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    const body: Record<string, unknown> = {
      model: payload.model,
      messages: formattedMessages,
      stream: true
    };

    if (payload.temperature !== undefined) body.temperature = payload.temperature;
    if (payload.topP !== undefined) body.top_p = payload.topP;
    if (payload.maxTokens !== undefined) body.max_tokens = payload.maxTokens;
    if (payload.stopSequences && payload.stopSequences.length > 0) body.stop = payload.stopSequences;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: payload.signal
    });

    if (!res.ok) {
      let errMsg = `Custom Provider error ${res.status}`;
      try {
        const errJson = await res.json() as { error?: { message?: string } | string };
        if (typeof errJson?.error === 'string') errMsg = errJson.error;
        else if (typeof errJson?.error?.message === 'string') errMsg = errJson.error.message;
      } catch {}
      throw new Error(errMsg);
    }

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    await parseSseStream(res, dataStr => {
      try {
        const chunk = JSON.parse(dataStr);
        if (chunk.choices && chunk.choices[0]?.delta?.content) {
          const delta = chunk.choices[0].delta.content;
          fullText += delta;
          onChunk({ text: delta });
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || promptTokens;
          completionTokens = chunk.usage.completion_tokens || completionTokens;
        }
      } catch {}
    });

    const durationMs = Date.now() - start;
    if (promptTokens === 0) {
      promptTokens = estimateTokens(payload.messages.map(m => m.content).join(' '));
    }
    if (completionTokens === 0) {
      completionTokens = estimateTokens(fullText);
    }

    return {
      fullText,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      durationMs
    };
  }
}

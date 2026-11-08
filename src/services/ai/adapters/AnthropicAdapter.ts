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

export class AnthropicAdapter implements IAiAdapter {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly type = 'cloud' as const;
  readonly requiresKey = true;

  getModelCapabilities(modelId: string): ModelCapabilities {
    const m = (modelId || '').toLowerCase();
    const supportsVision = m.includes('claude-3') || m.includes('vision');
    return {
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsVision,
      supportedParameters: ['temperature', 'topP', 'topK', 'maxTokens', 'stopSequences'],
      isLocal: false,
      maxContextTokens: 200000,
      maxOutputTokens: 8192
    };
  }

  async testConnection(apiKey?: string): Promise<ConnectionTestResult> {
    if (!apiKey || !apiKey.trim()) {
      return {
        success: false,
        message: 'No Anthropic API key found in secure storage.'
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, message: 'Invalid Anthropic API key (401 Unauthorized).' };
        }
        return { success: false, message: `Anthropic returned HTTP status ${res.status}.` };
      }

      const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> };
      const models = (data.data || []).map(m => m.id);

      return {
        success: true,
        message: `Successfully connected to Anthropic (${models.length} models discovered)`,
        latencyMs,
        models: models.length > 0 ? models : ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg.replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-***')}`
      };
    }
  }

  async discoverModels(apiKey?: string): Promise<AiDiscoveredModel[]> {
    if (!apiKey) return [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) return [];
      const data = await res.json() as { data?: Array<{ id: string; created_at?: string }> };
      return (data.data || []).map(m => ({
        name: m.id,
        family: 'claude',
        modifiedAt: m.created_at ? new Date(m.created_at).getTime() : undefined
      }));
    } catch {
      return [];
    }
  }

  async chatStream(
    payload: AiChatPayload,
    apiKey: string | undefined,
    onChunk: (chunk: AiStreamChunk) => void
  ): Promise<AiChatResult> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Anthropic API key missing in secure storage.');
    }

    const start = Date.now();
    const caps = this.getModelCapabilities(payload.model);
    const supportsVision = Boolean(caps.supportsVision);

    // Anthropic separates system prompt from chat history
    let systemPrompt: string | undefined;
    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [];

    for (const m of payload.messages) {
      if (m.role === 'system') {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${m.content}` : m.content;
      } else {
        if (supportsVision && m.images && m.images.length > 0) {
          const parts: Array<Record<string, unknown>> = [];
          for (const img of m.images) {
            let mime = (img.mimeType || 'image/jpeg').toLowerCase();
            if (mime === 'image/jpg') mime = 'image/jpeg';
            const rawBase64 = img.base64Data.replace(/^data:[^;]+;base64,/, '');
            parts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mime,
                data: rawBase64
              }
            });
          }
          const textPrompt = m.content && m.content.trim() ? m.content : 'Describe this image.';
          parts.push({ type: 'text', text: textPrompt });
          chatMessages.push({ role: m.role, content: parts });
        } else {
          chatMessages.push({ role: m.role, content: m.content });
        }
      }
    }

    if (chatMessages.length === 0) {
      chatMessages.push({ role: 'user', content: 'Hello' });
    }

    const body: Record<string, unknown> = {
      model: payload.model,
      messages: chatMessages,
      max_tokens: payload.maxTokens || 4096,
      stream: true
    };

    if (systemPrompt) body.system = systemPrompt;
    if (payload.temperature !== undefined) body.temperature = payload.temperature;
    if (payload.topP !== undefined) body.top_p = payload.topP;
    if (payload.topK !== undefined) body.top_k = payload.topK;
    if (payload.stopSequences && payload.stopSequences.length > 0) body.stop_sequences = payload.stopSequences;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: payload.signal
    });

    if (!res.ok) {
      let errMsg = `Anthropic error ${res.status}`;
      try {
        const errJson = await res.json() as { error?: { message?: string } };
        if (errJson?.error?.message) {
          errMsg = errJson.error.message;
        }
      } catch {}
      throw new Error(errMsg);
    }

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    await parseSseStream(res, dataStr => {
      try {
        const chunk = JSON.parse(dataStr);
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          fullText += chunk.delta.text;
          onChunk({ text: chunk.delta.text });
        } else if (chunk.type === 'message_start' && chunk.message?.usage) {
          promptTokens = chunk.message.usage.input_tokens || promptTokens;
        } else if (chunk.type === 'message_delta' && chunk.usage) {
          completionTokens = chunk.usage.output_tokens || completionTokens;
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

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

export class GroqAdapter implements IAiAdapter {
  readonly id = 'groq';
  readonly name = 'Groq Cloud';
  readonly type = 'cloud' as const;
  readonly requiresKey = true;

  getModelCapabilities(modelId: string): ModelCapabilities {
    const m = (modelId || '').toLowerCase();
    const supportsVision = m.includes('vision') || m.includes('vl') || m.includes('llava') || m.includes('qwen');
    return {
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsVision,
      supportedParameters: ['temperature', 'topP', 'maxTokens', 'stopSequences', 'seed'],
      isLocal: false,
      maxContextTokens: 128000,
      maxOutputTokens: 8192
    };
  }

  async testConnection(apiKey?: string): Promise<ConnectionTestResult> {
    if (!apiKey || !apiKey.trim()) {
      return {
        success: false,
        message: 'No Groq API key found in secure storage.'
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, message: 'Invalid Groq API key (401 Unauthorized).' };
        }
        return { success: false, message: `Groq returned HTTP status ${res.status}.` };
      }

      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data || []).map(m => m.id);

      return {
        success: true,
        message: `Successfully connected to Groq (${models.length} ultra-fast models discovered)`,
        latencyMs,
        models
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg.replace(/gsk_[a-zA-Z0-9_-]+/g, 'gsk_***')}`
      };
    }
  }

  async discoverModels(apiKey?: string): Promise<AiDiscoveredModel[]> {
    if (!apiKey) return [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) return [];
      const data = await res.json() as { data?: Array<{ id: string; context_window?: number }> };
      return (data.data || []).map(m => ({
        name: m.id,
        family: 'groq',
        contextWindow: m.context_window
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
      throw new Error('Groq API key missing in secure storage.');
    }

    const start = Date.now();
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
    if (payload.seed !== undefined) body.seed = payload.seed;
    if (payload.stopSequences && payload.stopSequences.length > 0) body.stop = payload.stopSequences;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body),
      signal: payload.signal
    });

    if (!res.ok) {
      let errMsg = `Groq API error ${res.status}`;
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
        if (chunk.choices && chunk.choices[0]?.delta?.content) {
          const delta = chunk.choices[0].delta.content;
          fullText += delta;
          onChunk({ text: delta });
        }
        if (chunk.x_groq?.usage) {
          promptTokens = chunk.x_groq.usage.prompt_tokens || promptTokens;
          completionTokens = chunk.x_groq.usage.completion_tokens || completionTokens;
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

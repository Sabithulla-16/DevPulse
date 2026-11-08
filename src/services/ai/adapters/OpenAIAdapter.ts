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

export class OpenAIAdapter implements IAiAdapter {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly type = 'cloud' as const;
  readonly requiresKey = true;

  getModelCapabilities(modelId: string): ModelCapabilities {
    const isReasoning = modelId.startsWith('o1') || modelId.startsWith('o3');
    const m = (modelId || '').toLowerCase();
    const supportsVision = m.includes('4o') || m.includes('vision') || m.includes('turbo') || m.startsWith('o1') || m.startsWith('o3');
    return {
      supportsStreaming: true,
      supportsSystemPrompt: !isReasoning,
      supportsVision,
      supportedParameters: isReasoning
        ? ['maxTokens']
        : ['temperature', 'topP', 'maxTokens', 'frequencyPenalty', 'presencePenalty', 'stopSequences', 'seed'],
      isLocal: false,
      maxContextTokens: modelId.includes('4o') ? 128000 : 16384,
      maxOutputTokens: 4096
    };
  }

  async testConnection(apiKey?: string): Promise<ConnectionTestResult> {
    if (!apiKey || !apiKey.trim()) {
      return {
        success: false,
        message: 'No OpenAI API key found in secure storage.'
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, message: 'Invalid OpenAI API key (401 Unauthorized).' };
        }
        return { success: false, message: `OpenAI returned HTTP status ${res.status}.` };
      }

      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data || [])
        .map(m => m.id)
        .filter(id => id.includes('gpt') || id.includes('o1') || id.includes('o3'))
        .slice(0, 15);

      return {
        success: true,
        message: `Successfully connected to OpenAI (${models.length} core models discovered)`,
        latencyMs,
        models
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg.replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-***')}`
      };
    }
  }

  async discoverModels(apiKey?: string): Promise<AiDiscoveredModel[]> {
    if (!apiKey) return [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) return [];
      const data = await res.json() as { data?: Array<{ id: string; created?: number }> };
      return (data.data || [])
        .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
        .map(m => ({
          name: m.id,
          family: 'openai',
          modifiedAt: m.created ? m.created * 1000 : undefined
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
      throw new Error('OpenAI API key missing in secure storage.');
    }

    const start = Date.now();
    const isReasoning = payload.model.startsWith('o1') || payload.model.startsWith('o3');
    const caps = this.getModelCapabilities(payload.model);
    const supportsVision = Boolean(caps.supportsVision);

    const formattedMessages = payload.messages.map(m => {
      let content: string | Array<Record<string, unknown>> = m.content;
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
        content = parts;
      }

      if (isReasoning && m.role === 'system') {
        const textContent = typeof content === 'string' ? content : JSON.stringify(content);
        return { role: 'user', content: `[System Instruction]: ${textContent}` };
      }
      return { role: m.role, content };
    });

    const body: Record<string, unknown> = {
      model: payload.model,
      messages: formattedMessages,
      stream: true,
      stream_options: { include_usage: true }
    };

    if (!isReasoning) {
      if (payload.temperature !== undefined) body.temperature = payload.temperature;
      if (payload.topP !== undefined) body.top_p = payload.topP;
      if (payload.frequencyPenalty !== undefined) body.frequency_penalty = payload.frequencyPenalty;
      if (payload.presencePenalty !== undefined) body.presence_penalty = payload.presencePenalty;
      if (payload.seed !== undefined) body.seed = payload.seed;
      if (payload.stopSequences && payload.stopSequences.length > 0) body.stop = payload.stopSequences;
    }
    if (payload.maxTokens !== undefined) {
      if (isReasoning) {
        body.max_completion_tokens = payload.maxTokens;
      } else {
        body.max_tokens = payload.maxTokens;
      }
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body),
      signal: payload.signal
    });

    if (!res.ok) {
      let errMsg = `OpenAI error ${res.status}`;
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

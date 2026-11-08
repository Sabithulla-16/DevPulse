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

const DEFAULT_GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-1.0-pro'
];

export class GeminiAdapter implements IAiAdapter {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly type = 'cloud' as const;
  readonly requiresKey = true;

  getModelCapabilities(modelId: string): ModelCapabilities {
    const m = (modelId || '').toLowerCase();
    const supportsVision = m.includes('gemini') || m.includes('vision');
    return {
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportsVision,
      supportedParameters: ['temperature', 'topP', 'topK', 'maxTokens', 'stopSequences'],
      isLocal: false,
      maxContextTokens: 1000000,
      maxOutputTokens: 8192
    };
  }

  async testConnection(apiKey?: string): Promise<ConnectionTestResult> {
    if (!apiKey || !apiKey.trim()) {
      return {
        success: false,
        message: 'No Google Gemini API key found in secure storage.'
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'x-goog-api-key': apiKey.trim()
        }
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        if (res.status === 400 || res.status === 403) {
          return { success: false, message: 'Invalid Google Gemini API key (Authentication error).' };
        }
        return { success: false, message: `Gemini API returned HTTP status ${res.status}.` };
      }

      const data = await res.json() as {
        models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number }>;
      };

      const models = (data.models || [])
        .map(m => m.name.replace(/^models\//, ''))
        .filter(n => n.includes('gemini'));

      const finalModels = models.length > 0 ? models : DEFAULT_GEMINI_MODELS;

      return {
        success: true,
        message: `Successfully connected to Gemini API (${finalModels.length} models ready)`,
        latencyMs,
        models: finalModels
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg.replace(/AIza[a-zA-Z0-9_-]+/g, 'AIza***')}`
      };
    }
  }

  async discoverModels(apiKey?: string): Promise<AiDiscoveredModel[]> {
    if (!apiKey) return DEFAULT_GEMINI_MODELS.map(name => ({ name, family: 'gemini' }));
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'x-goog-api-key': apiKey.trim()
        }
      });
      clearTimeout(timer);

      if (!res.ok) {
        return DEFAULT_GEMINI_MODELS.map(name => ({ name, family: 'gemini' }));
      }
      const data = await res.json() as {
        models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number }>;
      };

      const models = (data.models || [])
        .filter(m => m.name.includes('gemini'))
        .map(m => ({
          name: m.name.replace(/^models\//, ''),
          family: 'gemini',
          contextWindow: m.inputTokenLimit
        }));

      return models.length > 0 ? models : DEFAULT_GEMINI_MODELS.map(name => ({ name, family: 'gemini' }));
    } catch {
      return DEFAULT_GEMINI_MODELS.map(name => ({ name, family: 'gemini' }));
    }
  }

  async chatStream(
    payload: AiChatPayload,
    apiKey: string | undefined,
    onChunk: (chunk: AiStreamChunk) => void
  ): Promise<AiChatResult> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Gemini API key missing in secure storage.');
    }

    const start = Date.now();
    let cleanModel = (payload.model || 'gemini-1.5-flash').replace(/^models\//, '').trim();
    if (!cleanModel || !cleanModel.toLowerCase().includes('gemini')) {
      cleanModel = 'gemini-1.5-flash';
    }
    const caps = this.getModelCapabilities(cleanModel);
    const supportsVision = Boolean(caps.supportsVision);

    let systemInstruction: { parts: Array<{ text: string }> } | undefined;
    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

    for (const m of payload.messages) {
      if (m.role === 'system') {
        systemInstruction = { parts: [{ text: m.content }] };
      } else {
        const textPrompt = m.content && m.content.trim() ? m.content : (supportsVision && m.images && m.images.length > 0 ? 'Describe this image.' : '');
        const parts: Array<Record<string, unknown>> = textPrompt ? [{ text: textPrompt }] : [];
        if (supportsVision && m.images && m.images.length > 0) {
          for (const img of m.images) {
            let mime = (img.mimeType || 'image/jpeg').toLowerCase();
            if (mime === 'image/jpg') mime = 'image/jpeg';
            const rawBase64 = img.base64Data.replace(/^data:[^;]+;base64,/, '');
            parts.push({
              inlineData: {
                mimeType: mime,
                data: rawBase64
              }
            });
          }
        }
        if (parts.length === 0) {
          parts.push({ text: 'Hello' });
        }
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts
        });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const generationConfig: Record<string, unknown> = {};
    if (payload.temperature !== undefined) generationConfig.temperature = payload.temperature;
    if (payload.topP !== undefined) generationConfig.topP = payload.topP;
    if (payload.topK !== undefined) generationConfig.topK = payload.topK;
    if (payload.maxTokens !== undefined) generationConfig.maxOutputTokens = payload.maxTokens;
    if (payload.stopSequences && payload.stopSequences.length > 0) generationConfig.stopSequences = payload.stopSequences;

    const body: Record<string, unknown> = {
      contents,
      generationConfig
    };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey.trim())}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify(body),
      signal: payload.signal
    });

    if (!res.ok) {
      let errMsg = `Gemini API error ${res.status}`;
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
        const candidates = chunk.candidates || [];
        for (const cand of candidates) {
          const parts = cand.content?.parts || [];
          for (const p of parts) {
            if (typeof p.text === 'string' && p.text) {
              fullText += p.text;
              onChunk({ text: p.text });
            }
          }
        }
        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount || promptTokens;
          completionTokens = chunk.usageMetadata.candidatesTokenCount || completionTokens;
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

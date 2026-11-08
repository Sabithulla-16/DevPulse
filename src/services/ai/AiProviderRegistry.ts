import type { IAiAdapter, ConnectionTestResult, AiDiscoveredModel, ModelCapabilities } from './adapters/IAiAdapter';
import { OllamaAdapter } from './adapters/OllamaAdapter';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { AnthropicAdapter } from './adapters/AnthropicAdapter';
import { GeminiAdapter } from './adapters/GeminiAdapter';
import { GroqAdapter } from './adapters/GroqAdapter';
import { CustomOpenAIAdapter } from './adapters/CustomOpenAIAdapter';
import type { AiIntelligenceRepository } from '../../database/repositories/AiIntelligenceRepository';
import type { AiProviderInfo, AiProviderStatus } from '../../shared/types';

export type SecretGetter = (key: string) => Promise<string | undefined>;

export const FALLBACK_MODELS_BY_PROVIDER: Record<string, string[]> = {
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3.8-27b', 'llama-3.2-11b-vision-preview'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.0-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  ollama: ['llama3:latest', 'mistral:latest', 'codellama:latest']
};

export class AiProviderRegistry {
  private adapters = new Map<string, IAiAdapter>();
  private secretGetter?: SecretGetter;

  constructor(
    private readonly repo?: AiIntelligenceRepository,
    secretGetter?: SecretGetter
  ) {
    this.secretGetter = secretGetter;

    const ollama = new OllamaAdapter();
    const openai = new OpenAIAdapter();
    const anthropic = new AnthropicAdapter();
    const gemini = new GeminiAdapter();
    const groq = new GroqAdapter();

    this.register(ollama);
    this.register(openai);
    this.register(anthropic);
    this.register(gemini);
    this.register(groq);
  }

  public register(adapter: IAiAdapter): void {
    this.adapters.set(adapter.id.toLowerCase(), adapter);
  }

  public unregister(id: string): void {
    this.adapters.delete(id.toLowerCase());
  }

  public getAdapter(id: string): IAiAdapter | undefined {
    return this.adapters.get(id.toLowerCase());
  }

  public getAllAdapters(): IAiAdapter[] {
    return Array.from(this.adapters.values());
  }

  public setSecretGetter(getter: SecretGetter): void {
    this.secretGetter = getter;
  }

  public setOllamaHost(host: string): void {
    const ollama = this.adapters.get('ollama');
    if (ollama instanceof OllamaAdapter) {
      ollama.setHost(host);
    }
  }

  public async getApiKey(providerId: string): Promise<string | undefined> {
    if (!this.secretGetter) return undefined;
    const lower = providerId.toLowerCase();
    // Check custom provider secret first if registered as custom
    if (this.adapters.get(lower) instanceof CustomOpenAIAdapter) {
      return this.secretGetter(`devpulse.ai.custom.${lower}.apiKey`);
    }
    return this.secretGetter(`devpulse.ai.${lower}.apiKey`);
  }

  public getModelCapabilities(providerId: string, modelId: string): ModelCapabilities {
    const adapter = this.adapters.get(providerId.toLowerCase());
    if (adapter && typeof adapter.getModelCapabilities === 'function') {
      return adapter.getModelCapabilities(modelId);
    }
    return {
      supportsStreaming: true,
      supportsSystemPrompt: true,
      supportedParameters: ['temperature', 'topP', 'maxTokens'],
      isLocal: false,
      maxContextTokens: 16384,
      maxOutputTokens: 4096
    };
  }

  public async testProvider(providerId: string, explicitKey?: string): Promise<ConnectionTestResult> {
    const adapter = this.adapters.get(providerId.toLowerCase());
    if (!adapter) {
      return { success: false, message: `Unknown AI provider '${providerId}'.` };
    }

    const key = explicitKey !== undefined ? explicitKey : (await this.getApiKey(providerId));
    const result = await adapter.testConnection(key);

    if (this.repo) {
      const status: AiProviderStatus = result.success ? 'connected' : 'error';
      const fallbackList = FALLBACK_MODELS_BY_PROVIDER[adapter.id.toLowerCase()] || [];
      const models = (result.models && result.models.length > 0) ? result.models : fallbackList;
      this.repo.saveProvider({
        id: adapter.id,
        name: adapter.name,
        status,
        endpoint: adapter instanceof OllamaAdapter ? adapter.getHost() : undefined,
        isLocal: adapter.type === 'local',
        availableModels: models,
        lastSyncedAt: Date.now(),
        error: result.success ? undefined : result.message
      });
    }

    return result;
  }

  public async pollAllProviders(): Promise<AiProviderInfo[]> {
    const list: AiProviderInfo[] = [];

    for (const adapter of this.adapters.values()) {
      let status: AiProviderStatus = 'requires_configuration';
      let error: string | undefined;
      let models: AiDiscoveredModel[] = [];

      try {
        const key = await this.getApiKey(adapter.id);
        if (adapter.requiresKey && !key) {
          status = 'requires_configuration';
          error = 'No API key configured';
        } else {
          const res = await adapter.testConnection(key);
          status = res.success ? 'connected' : 'error';
          error = res.success ? undefined : res.message;
          if (res.success) {
            models = await adapter.discoverModels(key);
          }
        }
      } catch (err: unknown) {
        status = 'error';
        error = err instanceof Error ? err.message : String(err);
      }

      const discoveredNames = models.map(m => m.name);
      const fallbackList = FALLBACK_MODELS_BY_PROVIDER[adapter.id.toLowerCase()] || [];
      const modelNames = discoveredNames.length > 0 ? discoveredNames : fallbackList;

      const info: AiProviderInfo = {
        id: adapter.id,
        name: adapter.name,
        status,
        endpoint: adapter instanceof OllamaAdapter ? adapter.getHost() : undefined,
        isLocal: adapter.type === 'local',
        availableModels: modelNames,
        lastSyncedAt: Date.now(),
        error
      };

      if (this.repo) {
        this.repo.saveProvider(info);
      }
      list.push(info);
    }

    return list;
  }
}

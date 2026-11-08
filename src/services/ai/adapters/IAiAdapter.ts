export interface AiDiscoveredModel {
  name: string;
  family?: string;
  sizeBytes?: number;
  parameterSize?: string;
  contextWindow?: number;
  modifiedAt?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  models?: string[];
  version?: string;
}

export interface AiStreamChunk {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiImagePart {
  mimeType: string;
  base64Data: string; // raw base64 or data URL
}

export interface AiChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: AiImagePart[];
}

export interface AiChatPayload {
  model: string;
  messages: AiChatMessagePayload[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
  signal?: AbortSignal;
}

export interface AiChatResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
  supportsVision?: boolean;
  supportedParameters: string[];
  isLocal: boolean;
  maxContextTokens?: number;
  maxOutputTokens?: number;
}

export interface IAiAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: 'local' | 'cloud';
  readonly requiresKey: boolean;

  testConnection(apiKey?: string): Promise<ConnectionTestResult>;
  discoverModels(apiKey?: string): Promise<AiDiscoveredModel[]>;
  getModelCapabilities(modelId: string): ModelCapabilities;
  chatStream(
    payload: AiChatPayload,
    apiKey: string | undefined,
    onChunk: (chunk: AiStreamChunk) => void
  ): Promise<AiChatResult>;
}

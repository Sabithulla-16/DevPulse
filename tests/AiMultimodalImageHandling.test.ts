import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  validateImageAttachment,
  validateModelVisionCapability,
  normalizeImageMime,
  sanitizeLogOutput,
  SUPPORTED_IMAGE_MIMES
} from '../src/services/ai/multimodal/ImageAttachmentValidator';
import { GroqAdapter } from '../src/services/ai/adapters/GroqAdapter';
import { OpenAIAdapter } from '../src/services/ai/adapters/OpenAIAdapter';
import { AnthropicAdapter } from '../src/services/ai/adapters/AnthropicAdapter';
import { GeminiAdapter } from '../src/services/ai/adapters/GeminiAdapter';
import { OllamaAdapter } from '../src/services/ai/adapters/OllamaAdapter';
import { CustomOpenAIAdapter } from '../src/services/ai/adapters/CustomOpenAIAdapter';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import { AiPlaygroundRepository } from '../src/database/repositories/AiPlaygroundRepository';

// Valid 1x1 sample base64 images
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const VALID_WEBP_BASE64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAD8D+JaQAA3AA/ua1AAA=';

describe('AI Multimodal Image Handling & Vision Pipeline (15 Scenarios)', () => {
  let db: SqlDatabase;
  let playgroundRepo: AiPlaygroundRepository;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const SQL = await initSqlJs();
    db = new SQL.Database();
    runMigrations(db);
    playgroundRepo = new AiPlaygroundRepository(() => db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  // Scenario 1: PNG attachment
  it('1. verifies PNG attachment validation and Groq outbound payload construction', async () => {
    const val = validateImageAttachment({
      name: 'screenshot.png',
      path: '/workspace/screenshot.png',
      mimeType: 'image/png',
      content: `data:image/png;base64,${VALID_PNG_BASE64}`
    });
    expect(val.valid).toBe(true);
    expect(val.normalizedMimeType).toBe('image/png');

    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: {"choices":[{"delta":{"content":"PNG received"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }));

    const adapter = new GroqAdapter();
    const result = await adapter.chatStream(
      {
        model: 'qwen/qwen3.8-27b',
        messages: [{
          role: 'user',
          content: 'What is this diagram?',
          images: [{ mimeType: val.normalizedMimeType!, base64Data: val.dataUrl! }]
        }]
      },
      'gsk_test_api_key_12345',
      () => {}
    );

    expect(capturedBody).toBeDefined();
    expect(capturedBody.model).toBe('qwen/qwen3.8-27b');
    const msg = capturedBody.messages[0];
    expect(msg.role).toBe('user');
    expect(Array.isArray(msg.content)).toBe(true);
    expect(msg.content[0]).toEqual({ type: 'text', text: 'What is this diagram?' });
    expect(msg.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${VALID_PNG_BASE64}` }
    });
    expect(result.fullText).toBe('PNG received');
  });

  // Scenario 2: JPEG attachment (and jpg normalization)
  it('2. normalizes image/jpg to image/jpeg and formats valid outbound payload', async () => {
    expect(normalizeImageMime('image/jpg')).toBe('image/jpeg');
    expect(normalizeImageMime('jpg')).toBe('image/jpeg');

    const val = validateImageAttachment({
      name: 'photo.jpg',
      mimeType: 'image/jpg',
      content: `data:image/jpg;base64,${VALID_JPEG_BASE64}`
    });
    expect(val.valid).toBe(true);
    expect(val.normalizedMimeType).toBe('image/jpeg');
    expect(val.dataUrl).toContain('data:image/jpeg;base64,');

    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const adapter = new GroqAdapter();
    await adapter.chatStream(
      {
        model: 'qwen/qwen3.8-27b',
        messages: [{
          role: 'user',
          content: 'Analyze photo',
          images: [{ mimeType: 'image/jpg', base64Data: `data:image/jpg;base64,${VALID_JPEG_BASE64}` }]
        }]
      },
      'gsk_test_key',
      () => {}
    );

    expect(capturedBody.messages[0].content[1].image_url.url).toContain('data:image/jpeg;base64,');
  });

  // Scenario 3: WebP attachment
  it('3. validates WebP attachment format correctly', () => {
    const val = validateImageAttachment({
      name: 'banner.webp',
      mimeType: 'image/webp',
      content: `data:image/webp;base64,${VALID_WEBP_BASE64}`
    });
    expect(val.valid).toBe(true);
    expect(val.normalizedMimeType).toBe('image/webp');
  });

  // Scenario 4: Multiple image attachments
  it('4. handles multiple image attachments within a single message payload', async () => {
    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const adapter = new GroqAdapter();
    await adapter.chatStream(
      {
        model: 'qwen/qwen3.8-27b',
        messages: [{
          role: 'user',
          content: 'Compare these two images',
          images: [
            { mimeType: 'image/png', base64Data: `data:image/png;base64,${VALID_PNG_BASE64}` },
            { mimeType: 'image/jpeg', base64Data: `data:image/jpeg;base64,${VALID_JPEG_BASE64}` }
          ]
        }]
      },
      'gsk_test_key',
      () => {}
    );

    const parts = capturedBody.messages[0].content;
    expect(parts.length).toBe(3); // 1 text + 2 images
    expect(parts[0].type).toBe('text');
    expect(parts[1].image_url.url).toContain('image/png');
    expect(parts[2].image_url.url).toContain('image/jpeg');
  });

  // Scenario 5: Text-only request
  it('5. preserves standard string format for text-only request without images', async () => {
    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const adapter = new GroqAdapter();
    await adapter.chatStream(
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Explain recursion' }]
      },
      'gsk_test_key',
      () => {}
    );

    expect(typeof capturedBody.messages[0].content).toBe('string');
    expect(capturedBody.messages[0].content).toBe('Explain recursion');
  });

  // Scenario 6: Image-only request (fallback prompt)
  it('6. populates fallback text prompt when message content is empty', async () => {
    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const adapter = new GroqAdapter();
    await adapter.chatStream(
      {
        model: 'qwen/qwen3.8-27b',
        messages: [{
          role: 'user',
          content: '   ', // whitespace only
          images: [{ mimeType: 'image/png', base64Data: VALID_PNG_BASE64 }]
        }]
      },
      'gsk_test_key',
      () => {}
    );

    const parts = capturedBody.messages[0].content;
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toBe('Describe this image.');
  });

  // Scenario 7: Image plus text request
  it('7. sends both text instructions and image part together', async () => {
    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const adapter = new OpenAIAdapter();
    await adapter.chatStream(
      {
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: 'Find UI bugs in this screenshot',
          images: [{ mimeType: 'image/png', base64Data: VALID_PNG_BASE64 }]
        }]
      },
      'sk-test_key',
      () => {}
    );

    const parts = capturedBody.messages[0].content;
    expect(parts[0]).toEqual({ type: 'text', text: 'Find UI bugs in this screenshot' });
    expect(parts[1].type).toBe('image_url');
  });

  // Scenario 8: Missing image data
  it('8. rejects attachments with missing data', () => {
    const val = validateImageAttachment({
      name: 'empty.png',
      mimeType: 'image/png',
      content: ''
    });
    expect(val.valid).toBe(false);
    expect(val.error).toContain('contains no data');
  });

  // Scenario 9: Invalid base64 or raw binary headers
  it('9. rejects corrupted binary UTF-8 headers (e.g. \\x89PNG) and invalid base64 characters', () => {
    const binaryHeader = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...';
    const valBinary = validateImageAttachment({
      name: 'corrupted.png',
      mimeType: 'image/png',
      content: binaryHeader
    });
    expect(valBinary.valid).toBe(false);
    expect(valBinary.error).toContain('raw binary headers');

    const invalidChars = validateImageAttachment({
      name: 'bad_chars.png',
      mimeType: 'image/png',
      content: 'data:image/png;base64,This is not base64!@#$%^&*'
    });
    expect(invalidChars.valid).toBe(false);
    expect(invalidChars.error).toContain('invalid base64 characters');
  });

  // Scenario 10: Unsupported MIME type
  it('10. rejects unsupported MIME types with informative error', () => {
    const val = validateImageAttachment({
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      content: 'data:application/pdf;base64,JVBERi0xLjUK'
    });
    expect(val.valid).toBe(false);
    expect(val.error).toContain('Unsupported image format');
  });

  // Scenario 11: Text-only model receiving an image
  it('11. verifies capability detection rejects text-only models when an image is attached', () => {
    const groq = new GroqAdapter();
    const visionCaps = groq.getModelCapabilities('qwen/qwen3.8-27b');
    expect(visionCaps.supportsVision).toBe(true);

    const textOnlyCaps = groq.getModelCapabilities('openai/gpt-oss-120b');
    expect(textOnlyCaps.supportsVision).toBe(false);

    const check = validateModelVisionCapability('Groq Cloud', 'openai/gpt-oss-120b', textOnlyCaps.supportsVision);
    expect(check.supported).toBe(false);
    expect(check.error).toContain('does not support image/vision inputs');
    expect(check.error).toContain('qwen/qwen3.8-27b');
  });

  // Scenario 12: Conversation restoration with image attachments
  it('12. preserves image attachments across conversation save and restore in database', () => {
    const conv = playgroundRepo.createConversation({
      title: 'Multimodal Chat',
      providerId: 'groq',
      modelId: 'qwen/qwen3.8-27b'
    });

    const userMsg = playgroundRepo.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'Look at this diagram',
      attachments: [{
        name: 'arch.png',
        path: '/workspace/arch.png',
        isImage: true,
        mimeType: 'image/png',
        content: `data:image/png;base64,${VALID_PNG_BASE64}`
      }],
      status: 'completed'
    });

    const retrievedMessages = playgroundRepo.getMessages(conv.id);
    expect(retrievedMessages.length).toBe(1);
    const restored = retrievedMessages[0];
    expect(restored.attachments).toBeDefined();
    expect(restored.attachments![0].isImage).toBe(true);
    expect(restored.attachments![0].mimeType).toBe('image/png');
    expect(restored.attachments![0].content).toContain(VALID_PNG_BASE64);
  });

  // Scenario 13: Provider routing (format checks for all adapters)
  it('13. validates native multimodal formatting across all adapters (OpenAI, Anthropic, Gemini, Ollama, Custom)', async () => {
    // Anthropic Adapter
    let anthropicBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      anthropicBody = JSON.parse(opts.body);
      return new Response('event: message_stop\ndata: {"type": "message_stop"}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }));

    const anthropic = new AnthropicAdapter();
    await anthropic.chatStream(
      {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{
          role: 'user',
          content: 'Analyze Claude image',
          images: [{ mimeType: 'image/png', base64Data: `data:image/png;base64,${VALID_PNG_BASE64}` }]
        }]
      },
      'sk-ant-test_key',
      () => {}
    );

    const anthropicMsg = anthropicBody.messages[0];
    expect(anthropicMsg.content[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: VALID_PNG_BASE64
      }
    });
    expect(anthropicMsg.content[1]).toEqual({ type: 'text', text: 'Analyze Claude image' });

    // Gemini Adapter
    let geminiBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      geminiBody = JSON.parse(opts.body);
      return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Gemini output"}]}}]}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }));

    const gemini = new GeminiAdapter();
    await gemini.chatStream(
      {
        model: 'gemini-1.5-flash',
        messages: [{
          role: 'user',
          content: 'Analyze Gemini image',
          images: [{ mimeType: 'image/jpeg', base64Data: `data:image/jpeg;base64,${VALID_JPEG_BASE64}` }]
        }]
      },
      'AIza_test_key',
      () => {}
    );

    const geminiParts = geminiBody.contents[0].parts;
    expect(geminiParts[0]).toEqual({ text: 'Analyze Gemini image' });
    expect(geminiParts[1]).toEqual({
      inlineData: {
        mimeType: 'image/jpeg',
        data: VALID_JPEG_BASE64
      }
    });

    // Ollama Adapter
    let ollamaBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      ollamaBody = JSON.parse(opts.body);
      return new Response('{"message":{"content":"Ollama output"},"done":true}\n', {
        status: 200
      });
    }));

    const ollama = new OllamaAdapter();
    await ollama.chatStream(
      {
        model: 'llava:latest',
        messages: [{
          role: 'user',
          content: 'Analyze Ollama image',
          images: [{ mimeType: 'image/png', base64Data: `data:image/png;base64,${VALID_PNG_BASE64}` }]
        }]
      },
      undefined,
      () => {}
    );

    expect(ollamaBody.messages[0].images).toEqual([VALID_PNG_BASE64]);

    // Custom OpenAI Adapter
    let customBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      customBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const custom = new CustomOpenAIAdapter('custom-id', 'Custom Endpoints', 'https://custom.ai/v1');
    await custom.chatStream(
      {
        model: 'custom-vision-model',
        messages: [{
          role: 'user',
          content: 'Analyze Custom image',
          images: [{ mimeType: 'image/png', base64Data: `data:image/png;base64,${VALID_PNG_BASE64}` }]
        }]
      },
      'custom-key',
      () => {}
    );

    expect(customBody.messages[0].content[1].image_url.url).toContain(VALID_PNG_BASE64);
  });

  // Scenario 14: Streaming response with image input
  it('14. correctly streams tokens when responding to an image prompt', async () => {
    const sseData = [
      'data: {"choices":[{"delta":{"content":"The "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"image "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"shows a dot."}}]}\n\n',
      'data: [DONE]\n\n'
    ].join('');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(sseData, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    })));

    const chunks: string[] = [];
    const adapter = new GroqAdapter();
    const result = await adapter.chatStream(
      {
        model: 'qwen/qwen3.8-27b',
        messages: [{
          role: 'user',
          content: 'Describe image',
          images: [{ mimeType: 'image/png', base64Data: VALID_PNG_BASE64 }]
        }]
      },
      'gsk_test_key',
      chunk => chunks.push(chunk.text)
    );

    expect(chunks.join('')).toBe('The image shows a dot.');
    expect(result.fullText).toBe('The image shows a dot.');
  });

  // Scenario 15: Request cancellation mid-stream
  it('15. supports request cancellation via AbortSignal without uncaught exceptions', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: any) => {
      opts.signal?.throwIfAborted();
      return new Promise((_, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }));

    const adapter = new GroqAdapter();
    const promise = adapter.chatStream(
      {
        model: 'qwen/qwen3.8-27b',
        messages: [{
          role: 'user',
          content: 'Analyze',
          images: [{ mimeType: 'image/png', base64Data: VALID_PNG_BASE64 }]
        }],
        signal: controller.signal
      },
      'gsk_test_key',
      () => {}
    );

    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toThrow();
  });

  // Scenario 16: Switching from vision-capable model to text-only model in same conversation
  it('16. ensures text-only model (e.g. openai/gpt-oss-120b) in conversation with prior image messages formats string content', async () => {
    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }));

    const adapter = new GroqAdapter();
    // Simulate active conversation where message 0 had an image, but active model is text-only:
    await adapter.chatStream(
      {
        model: 'openai/gpt-oss-120b', // text-only model
        messages: [
          {
            role: 'user',
            content: 'Explain this drone schematic [Attached Image: schematic.png]',
            images: [{ mimeType: 'image/png', base64Data: VALID_PNG_BASE64 }]
          },
          {
            role: 'assistant',
            content: 'This schematic shows an ESP32 and MPU-6050 drone flight controller.'
          },
          {
            role: 'user',
            content: 'esplain me the MPU-6050'
          }
        ]
      },
      'gsk_test_key',
      () => {}
    );

    // Verify all messages have string content, never an array
    expect(capturedBody).toBeDefined();
    for (let i = 0; i < capturedBody.messages.length; i++) {
      const msg = capturedBody.messages[i];
      expect(typeof msg.content).toBe('string');
    }
    expect(capturedBody.messages[0].content).toBe('Explain this drone schematic [Attached Image: schematic.png]');
    expect(capturedBody.messages[2].content).toBe('esplain me the MPU-6050');
  });

  // Bonus security check: Sanitized logging
  it('safeguards sensitive credentials and base64 strings in logs', () => {
    const rawLog = 'User sending gsk_abc1234567890def with payload data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg== and Bearer my_secret_token';
    const sanitized = sanitizeLogOutput(rawLog);

    expect(sanitized).not.toContain('gsk_abc1234567890def');
    expect(sanitized).toContain('gsk_***');
    expect(sanitized).not.toContain('my_secret_token');
    expect(sanitized).toContain('Bearer ***');
    expect(sanitized).not.toContain('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    expect(sanitized).toContain('chars base64 redacted');
  });
});

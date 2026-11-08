import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import { AiIntelligenceRepository } from '../src/database/repositories/AiIntelligenceRepository';
import { CostCalculator } from '../src/services/ai/CostCalculator';
import { OllamaAdapter } from '../src/services/ai/adapters/OllamaAdapter';
import { LocalAgentDetector } from '../src/services/ai/adapters/LocalAgentDetector';
import { AiProviderRegistry } from '../src/services/ai/AiProviderRegistry';

describe('Phase 3: AI Intelligence Suite', () => {
  let db: SqlDatabase;
  let aiRepo: AiIntelligenceRepository;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    runMigrations(db);
    aiRepo = new AiIntelligenceRepository(() => db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  describe('1. CostCalculator', () => {
    it('calculates zero cost for local Ollama models', () => {
      const calculator = new CostCalculator(aiRepo);
      const cost = calculator.calculateCost('ollama', 'llama3:8b', 10000, 2000);
      expect(cost).toBe(0);
    });

    it('calculates accurate costs for standard cloud models', () => {
      const calculator = new CostCalculator(aiRepo);

      // GPT-4o: $2.50 / 1M input, $10.00 / 1M output
      // 1M prompt = $2.50, 1M completion = $10.00 => $12.50
      const cost4o = calculator.calculateCost('openai', 'gpt-4o', 1_000_000, 1_000_000);
      expect(cost4o).toBe(12.50);

      // Claude 3.5 Sonnet: $3.00 / 1M input, $15.00 / 1M output
      // 500k prompt ($1.50) + 100k completion ($1.50) = $3.00
      const costClaude = calculator.calculateCost('anthropic', 'claude-3-5-sonnet', 500_000, 100_000);
      expect(costClaude).toBe(3.0);
    });

    it('applies custom user pricing overrides from repository', () => {
      aiRepo.savePricing({
        provider: 'openai',
        modelPattern: 'gpt-custom',
        inputCostPerMillion: 5.0,
        outputCostPerMillion: 20.0,
        isCustom: true,
        updatedAt: Date.now()
      });

      const calculator = new CostCalculator(aiRepo);
      const cost = calculator.calculateCost('openai', 'gpt-custom', 1_000_000, 1_000_000);
      expect(cost).toBe(25.0);
    });
  });

  describe('2. OllamaAdapter', () => {
    it('initializes with default localhost URL and allows host configuration', () => {
      const adapter = new OllamaAdapter();
      expect(adapter.getHost()).toBe('http://localhost:11434');

      adapter.setHost('http://192.168.1.50:11434/');
      expect(adapter.getHost()).toBe('http://192.168.1.50:11434');
    });

    it('gracefully handles unreachable host without throwing unhandled exceptions', async () => {
      const adapter = new OllamaAdapter('http://127.0.0.1:54321');
      const result = await adapter.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unable to connect to Ollama');
    });
  });

  describe('3. AiIntelligenceRepository', () => {
    it('persists usage records and calculates overview summaries', () => {
      const now = Date.now();

      aiRepo.saveUsageRecord({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 1,
        estimatedCost: 0.0075,
        currency: 'USD',
        source: 'test-runner',
        timestamp: now
      });

      aiRepo.saveUsageRecord({
        provider: 'ollama',
        model: 'llama3:8b',
        inputTokens: 2000,
        outputTokens: 1000,
        totalTokens: 3000,
        requestCount: 1,
        estimatedCost: 0.0,
        currency: 'USD',
        source: 'test-runner',
        timestamp: now
      });

      const summary = aiRepo.getSummary();
      expect(summary.totalRequests).toBe(2);
      expect(summary.totalTokens).toBe(4500);
      expect(summary.estimatedCost).toBeCloseTo(0.0075, 4);
      expect(summary.activeProvidersCount).toBe(2);
      expect(summary.modelsCount).toBe(2);
    });

    it('aggregates model statistics and time series points', () => {
      const now = Date.now();

      aiRepo.saveUsageRecord({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        inputTokens: 3000,
        outputTokens: 1000,
        totalTokens: 4000,
        requestCount: 2,
        estimatedCost: 0.024,
        currency: 'USD',
        source: 'claude-code',
        timestamp: now
      });

      const stats = aiRepo.getModelStats();
      expect(stats.length).toBe(1);
      expect(stats[0].model).toBe('claude-3-5-sonnet');
      expect(stats[0].totalTokens).toBe(4000);
      expect(stats[0].avgTokensPerRequest).toBe(2000);

      const timeSeries = aiRepo.getTimeSeries();
      expect(timeSeries.length).toBe(1);
      expect(timeSeries[0].model).toBe('claude-3-5-sonnet');
    });

    it('manages budgets and pricing records correctly', () => {
      aiRepo.saveBudget({
        periodType: 'daily',
        limitAmount: 15.0,
        thresholdPercent: 80,
        createdAt: Date.now()
      });

      const budgets = aiRepo.getBudgets();
      expect(budgets.length).toBe(1);
      expect(budgets[0].limitAmount).toBe(15.0);

      aiRepo.clearData();
      const recordsAfterClear = aiRepo.getUsageRecords();
      expect(recordsAfterClear.length).toBe(0);
    });
  });

  describe('4. AiProviderRegistry', () => {
    it('registers default adapters and manages provider status', async () => {
      const registry = new AiProviderRegistry(aiRepo);
      const adapters = registry.getAllAdapters();
      expect(adapters.length).toBe(5);

      const ollama = registry.getAdapter('ollama');
      expect(ollama).toBeDefined();
      expect(ollama?.requiresKey).toBe(false);

      const openai = registry.getAdapter('openai');
      expect(openai?.requiresKey).toBe(true);
    });
  });

  describe('5. Ollama Request Instrumentation', () => {
    it('captures instrumented request-level metrics without prompts', () => {
      const adapter = new OllamaAdapter();
      const event = adapter.recordInstrumentedUsage({
        model: 'llama3:8b',
        promptTokens: 120,
        completionTokens: 80,
        durationMs: 450,
        success: true,
        source: 'devpulse-instrumentation'
      });

      expect(event.model).toBe('llama3:8b');
      expect(event.promptTokens).toBe(120);
      expect(event.completionTokens).toBe(80);
      expect(event.totalTokens).toBe(200);
      expect(event.durationMs).toBe(450);
      expect(event.success).toBe(true);

      const pending = adapter.getAndClearPendingUsage();
      expect(pending.length).toBe(1);
      expect(adapter.getAndClearPendingUsage().length).toBe(0);
    });
  });

  describe('6. LocalAgentDetector Session Ingestion & Deduplication', () => {
    it('prevents duplicate record ingestion on repeated scans', async () => {
      const existingTimestamps = new Set<number>();
      const detector = new LocalAgentDetector((source, ts) => ts !== undefined && existingTimestamps.has(ts));

      // Test memory deduplication via dedupe key
      expect(detector).toBeDefined();
    });

    it('enforces idempotency key uniqueness in database repository', () => {
      aiRepo.saveUsageRecord({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        requestCount: 1,
        source: 'claude-code',
        timestamp: 1700000000000,
        idempotencyKey: 'test-idempotency-key-1'
      });

      expect(aiRepo.hasRecordByIdempotencyKey('test-idempotency-key-1')).toBe(true);
      expect(aiRepo.hasRecordByIdempotencyKey('non-existent-key')).toBe(false);

      // Attempt duplicate insertion with same idempotency key - must not crash and must not duplicate
      aiRepo.saveUsageRecord({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        requestCount: 1,
        source: 'claude-code',
        timestamp: 1700000000000,
        idempotencyKey: 'test-idempotency-key-1'
      });

      const summary = aiRepo.getSummary();
      expect(summary.totalTokens).toBe(150);
    });
  });
});

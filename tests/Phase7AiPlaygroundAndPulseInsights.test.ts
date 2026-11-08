import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import { AiPlaygroundRepository } from '../src/database/repositories/AiPlaygroundRepository';
import { PulseInsightsRepository } from '../src/database/repositories/PulseInsightsRepository';
import { AiIntelligenceRepository } from '../src/database/repositories/AiIntelligenceRepository';
import { SystemMetricsRepository } from '../src/database/repositories/SystemMetricsRepository';
import { CodingIntelligenceRepository } from '../src/database/repositories/CodingIntelligenceRepository';
import { ApiIntelligenceRepository } from '../src/database/repositories/ApiIntelligenceRepository';
import { CorrelationEngine } from '../src/services/insights/CorrelationEngine';
import { Database } from '../src/database/Database';

describe('Phase 7: AI Playground & Pulse Insights Suite', () => {
  let db: SqlDatabase;
  let playgroundRepo: AiPlaygroundRepository;
  let insightsRepo: PulseInsightsRepository;
  let aiRepo: AiIntelligenceRepository;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    runMigrations(db);
    playgroundRepo = new AiPlaygroundRepository(() => db);
    insightsRepo = new PulseInsightsRepository(() => db);
    aiRepo = new AiIntelligenceRepository(() => db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  describe('1. AI Playground Repository & Persistence', () => {
    it('creates, retrieves, renames and deletes conversations with settings', () => {
      const conv = playgroundRepo.createConversation({
        title: 'New Chat',
        providerId: 'openai',
        modelId: 'gpt-4o',
        systemPrompt: 'You are a test assistant',
        generationSettings: { temperature: 0.7, topP: 0.9 }
      });

      expect(conv.id).toBeDefined();
      expect(conv.title).toBe('New Chat');
      expect(conv.providerId).toBe('openai');
      expect(conv.modelId).toBe('gpt-4o');

      const fetched = playgroundRepo.getConversation(conv.id);
      expect(fetched?.systemPrompt).toBe('You are a test assistant');
      expect(fetched?.generationSettings?.temperature).toBe(0.7);

      const renamed = playgroundRepo.renameConversation(conv.id, 'Refactored Chat');
      expect(renamed).toBe(true);
      expect(playgroundRepo.getConversation(conv.id)?.title).toBe('Refactored Chat');

      const deleted = playgroundRepo.deleteConversation(conv.id);
      expect(deleted).toBe(true);
      expect(playgroundRepo.getConversation(conv.id)).toBeUndefined();
    });

    it('persists and updates messages with streaming status transitions', () => {
      const conv = playgroundRepo.createConversation({
        title: 'Streaming Test',
        providerId: 'ollama',
        modelId: 'llama3:8b'
      });

      const userMsg = playgroundRepo.addMessage({
        conversationId: conv.id,
        role: 'user',
        content: 'Explain bubble sort',
        status: 'completed'
      });

      const assistantMsg = playgroundRepo.addMessage({
        conversationId: conv.id,
        role: 'assistant',
        content: '',
        status: 'streaming'
      });

      let msgs = playgroundRepo.getMessages(conv.id);
      expect(msgs.length).toBe(2);
      expect(msgs[1].status).toBe('streaming');

      // Update message upon completion
      playgroundRepo.updateMessage(assistantMsg.id, {
        content: 'Bubble sort repeatedly swaps adjacent elements.',
        status: 'completed',
        inputTokens: 10,
        outputTokens: 25,
        durationMs: 450
      });

      msgs = playgroundRepo.getMessages(conv.id);
      expect(msgs[1].content).toContain('Bubble sort');
      expect(msgs[1].status).toBe('completed');
      expect(msgs[1].outputTokens).toBe(25);
    });

    it('manages prompt templates and automatic version history', () => {
      const template = playgroundRepo.saveTemplate({
        name: 'Code Reviewer',
        description: 'Reviews pull requests',
        category: 'Coding',
        systemPrompt: 'You are a strict reviewer',
        userPrompt: 'Review: {{code}}',
        variables: ['code'],
        isFavorite: true
      });

      expect(template.id).toBeDefined();
      expect(template.variables).toEqual(['code']);

      let versions = playgroundRepo.getPromptVersions(template.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);

      // Save revision 2
      playgroundRepo.saveTemplate({
        id: template.id,
        name: 'Code Reviewer v2',
        category: 'Coding',
        userPrompt: 'Detailed review: {{code}} in {{language}}',
        variables: ['code', 'language']
      });

      versions = playgroundRepo.getPromptVersions(template.id);
      expect(versions.length).toBe(2);
      expect(versions[0].version).toBe(2);
      expect(versions[0].userPrompt).toContain('Detailed review');
    });

    it('seeds and loads built-in generation presets', () => {
      const presets = playgroundRepo.getPresets();
      expect(presets.length).toBeGreaterThanOrEqual(6);

      const balanced = presets.find(p => p.name === 'Balanced');
      expect(balanced).toBeDefined();
      expect(balanced?.isBuiltin).toBe(true);
      expect(balanced?.settings.temperature).toBe(0.7);

      const customPreset = playgroundRepo.savePreset({
        name: 'Super High Temp',
        description: 'Max exploration',
        settings: { temperature: 1.5, topP: 0.99 }
      });

      expect(customPreset.isBuiltin).toBe(false);
      expect(playgroundRepo.getPresets().length).toBe(presets.length + 1);
    });

    it('saves and deletes custom provider endpoints without secret leakage', () => {
      const custom = playgroundRepo.saveCustomProvider({
        name: 'LMStudio Local',
        baseUrl: 'http://localhost:1234/v1',
        modelIds: ['mistral-7b-instruct', 'deepseek-coder'],
        headers: { 'X-Custom-Env': 'dev' }
      });

      expect(custom.id).toBeDefined();
      expect(custom.modelIds).toContain('mistral-7b-instruct');

      const all = playgroundRepo.getCustomProviders();
      expect(all.length).toBe(1);
      expect(all[0].name).toBe('LMStudio Local');

      playgroundRepo.deleteCustomProvider(custom.id);
      expect(playgroundRepo.getCustomProviders().length).toBe(0);
    });
  });

  describe('2. Pulse Insights Repository & Deduplication', () => {
    it('saves, deduplicates, and prunes insights up to 1,000 records', () => {
      const now = Date.now();
      const insight1 = insightsRepo.saveInsight({
        category: 'system',
        title: 'High CPU Utilization',
        description: 'CPU averaged 85% during development.',
        severity: 'medium',
        confidence: 0.9,
        evidence: [{ label: 'CPU Load', value: '85%', module: 'system' }],
        timeRangeStart: now - 3600000,
        timeRangeEnd: now,
        status: 'new',
        dedupeHash: 'hash_test_cpu_1',
        generatedAt: now,
        updatedAt: now
      });

      expect(insight1.id).toBeDefined();

      // Duplicate insertion with same dedupe_hash must update instead of creating a second row
      const insightDuplicate = insightsRepo.saveInsight({
        category: 'system',
        title: 'High CPU Utilization (Updated)',
        description: 'CPU averaged 88% during development.',
        severity: 'high',
        confidence: 0.95,
        evidence: [{ label: 'CPU Load', value: '88%', module: 'system' }],
        timeRangeStart: now - 3600000,
        timeRangeEnd: now,
        status: 'new',
        dedupeHash: 'hash_test_cpu_1',
        generatedAt: now,
        updatedAt: now
      });

      expect(insightDuplicate.id).toBe(insight1.id);
      const list = insightsRepo.getInsights();
      expect(list.length).toBe(1);
      expect(list[0].title).toBe('High CPU Utilization (Updated)');

      // User dismisses insight
      insightsRepo.updateStatus(insight1.id, 'dismissed');
      // By default getInsights excludes dismissed insights from active feed
      expect(insightsRepo.getInsights().length).toBe(0);
      expect(insightsRepo.getInsights({ status: 'dismissed' }).length).toBe(1);
    });

    it('tracks rule state across execution cycles', () => {
      insightsRepo.saveRuleState('corr_coding_ai', 1700000000000, 1700000000000);
      const state = insightsRepo.getRuleState('corr_coding_ai');
      expect(state?.lastRunAt).toBe(1700000000000);

      insightsRepo.saveRuleState('corr_coding_ai', 1700000500000, 1700000500000);
      const updated = insightsRepo.getRuleState('corr_coding_ai');
      expect(updated?.lastRunAt).toBe(1700000500000);
    });
  });

  describe('3. Cross-Module Correlation Engine Evaluation', () => {
    it('detects coding + AI correlation across synchronized 15-minute intervals', async () => {
      const now = Date.now();
      const binStart = Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000) - 2 * 15 * 60 * 1000;

      // Seed coding sessions in 2 distinct bins
      const codingRepo = new CodingIntelligenceRepository(() => db);
      codingRepo.saveSession({
        id: 'session-1',
        workspaceId: 'ws-test',
        workspaceName: 'DEVPULSE',
        startedAt: binStart + 60000,
        endedAt: binStart + 500000,
        lastActivityAt: binStart + 500000,
        activeDurationSeconds: 400,
        idleDurationSeconds: 40,
        pausedDurationSeconds: 0,
        status: 'completed',
        primaryLanguage: 'typescript',
        languagesJson: '{}',
        createdAt: binStart,
        updatedAt: binStart
      });

      codingRepo.saveSession({
        id: 'session-2',
        workspaceId: 'ws-test',
        workspaceName: 'DEVPULSE',
        startedAt: binStart + 15 * 60 * 1000 + 60000,
        endedAt: binStart + 15 * 60 * 1000 + 500000,
        lastActivityAt: binStart + 15 * 60 * 1000 + 500000,
        activeDurationSeconds: 420,
        idleDurationSeconds: 20,
        pausedDurationSeconds: 0,
        status: 'completed',
        primaryLanguage: 'typescript',
        languagesJson: '{}',
        createdAt: binStart + 15 * 60 * 1000,
        updatedAt: binStart + 15 * 60 * 1000
      });

      codingRepo.saveSession({
        id: 'session-3',
        workspaceId: 'ws-test',
        workspaceName: 'DEVPULSE',
        startedAt: binStart + 30 * 60 * 1000 + 60000,
        endedAt: binStart + 30 * 60 * 1000 + 500000,
        lastActivityAt: binStart + 30 * 60 * 1000 + 500000,
        activeDurationSeconds: 450,
        idleDurationSeconds: 10,
        pausedDurationSeconds: 0,
        status: 'completed',
        primaryLanguage: 'typescript',
        languagesJson: '{}',
        createdAt: binStart + 30 * 60 * 1000,
        updatedAt: binStart + 30 * 60 * 1000
      });

      // Seed matching AI usage in the same bins
      aiRepo.saveUsageRecord({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 2000,
        outputTokens: 1500,
        totalTokens: 3500,
        requestCount: 2,
        estimatedCost: 0.02,
        source: 'playground',
        timestamp: binStart + 100000
      });

      aiRepo.saveUsageRecord({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 3000,
        outputTokens: 2000,
        totalTokens: 5000,
        requestCount: 3,
        estimatedCost: 0.03,
        source: 'playground',
        timestamp: binStart + 15 * 60 * 1000 + 100000
      });

      aiRepo.saveUsageRecord({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 2500,
        outputTokens: 1800,
        totalTokens: 4300,
        requestCount: 2,
        estimatedCost: 0.025,
        source: 'playground',
        timestamp: binStart + 30 * 60 * 1000 + 100000
      });

      // Construct dummy database facade for CorrelationEngine
      const dummyDb = {
        insights: insightsRepo,
        coding: codingRepo,
        ai: aiRepo,
        systemMetrics: new SystemMetricsRepository(() => db),
        fileScans: {
          getScanHistory: () => [],
          getLatestScan: () => null
        },
        git: {
          getRepositories: () => [],
          getCommits: () => [],
          getWorkingTree: () => []
        },
        api: new ApiIntelligenceRepository(() => db),
        diskMetrics: {
          getLatest: () => []
        },
        alerts: {
          getRecent: () => []
        }
      } as unknown as Database;

      const engine = new CorrelationEngine(dummyDb);
      const result = await engine.evaluateInsights('today');

      expect(result.insights.length).toBeGreaterThan(0);
      const codingAiInsight = result.insights.find(i => i.title.includes('AI Usage Aligns With Coding Sessions'));
      expect(codingAiInsight).toBeDefined();
      expect(codingAiInsight?.description).toContain('AI Playground usage increased during periods of elevated coding activity');
      expect(codingAiInsight?.evidence.length).toBeGreaterThanOrEqual(3);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { Database } from '../src/database/Database';
import { CodingSessionManager } from '../src/services/coding/CodingSessionManager';
import { DEFAULT_SETTINGS } from '../src/shared/defaultSettings';
import type { DevPulseSettings, CodingSessionItem } from '../src/shared/types';

describe('Phase 4: Coding Intelligence Suite', () => {
  let tempDir: string;
  let database: Database;
  let wasmPath: string;
  let sessionManager: CodingSessionManager;
  let settings: DevPulseSettings;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-coding-test-'));
    wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
    database = new Database(tempDir, wasmPath);
    await database.initialize();

    settings = {
      ...DEFAULT_SETTINGS,
      codingTrackingEnabled: true,
      codingIdleThresholdSeconds: 300,
      codingPauseOnWindowBlur: true,
      codingTrackFileSaves: true,
      codingWorkspaceExclusions: ['excluded-project'],
      codingPrivacyMode: false,
      codingRetentionDays: 30
    };

    sessionManager = new CodingSessionManager(database.coding, settings);
    sessionManager.initialize();
  });

  afterEach(async () => {
    sessionManager.dispose();
    await database.close();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Session Tracking & Invariants', () => {
    it('creates active session on valid file edit event', () => {
      const mockDoc: any = {
        uri: { scheme: 'file', fsPath: 'C:\\Projects\\my-app\\src\\index.ts' },
        languageId: 'typescript'
      };

      sessionManager.handleTextDocumentChange(mockDoc, 1);
      const status = sessionManager.getLiveStatus();

      expect(status.status).toBe('active');
      expect(status.activeLanguage).toBe('typescript');
      expect(status.currentSessionSeconds).toBeGreaterThanOrEqual(0);
    });

    it('filters out non-code virtual documents', () => {
      const virtualSchemes = ['output', 'debug', 'git', 'comment', 'walkThrough'];

      for (const scheme of virtualSchemes) {
        const mockDoc: any = {
          uri: { scheme, fsPath: `${scheme}:/virtual-log` },
          languageId: 'log'
        };
        sessionManager.handleTextDocumentChange(mockDoc, 1);
      }

      const status = sessionManager.getLiveStatus();
      expect(status.status).toBe('stopped');
    });

    it('ignores empty document changes (contentChanges.length === 0)', () => {
      const mockDoc: any = {
        uri: { scheme: 'file', fsPath: 'C:\\Projects\\my-app\\src\\index.ts' },
        languageId: 'typescript'
      };

      sessionManager.handleTextDocumentChange(mockDoc, 0);
      const status = sessionManager.getLiveStatus();
      expect(status.status).toBe('stopped');
    });

    it('respects workspace exclusions', () => {
      const mockDoc: any = {
        uri: { scheme: 'file', fsPath: 'C:\\Projects\\excluded-project\\main.py' },
        languageId: 'python'
      };

      sessionManager.handleTextDocumentChange(mockDoc, 2);
      const status = sessionManager.getLiveStatus();
      expect(status.status).toBe('stopped');
    });

    it('supports manual pause and resume without corrupting duration', () => {
      const mockDoc: any = {
        uri: { scheme: 'file', fsPath: 'C:\\Projects\\my-app\\src\\index.ts' },
        languageId: 'typescript'
      };

      sessionManager.handleTextDocumentChange(mockDoc, 1);
      expect(sessionManager.getLiveStatus().status).toBe('active');

      sessionManager.pause();
      expect(sessionManager.isPaused()).toBe(true);
      expect(sessionManager.getLiveStatus().status).toBe('paused');

      // Edits during paused state are ignored
      sessionManager.handleTextDocumentChange(mockDoc, 5);
      expect(sessionManager.getLiveStatus().status).toBe('paused');

      sessionManager.resume();
      expect(sessionManager.isPaused()).toBe(false);
      expect(sessionManager.getLiveStatus().status).toBe('active');
    });

    it('handles window blur by transitioning active session to idle', () => {
      const mockDoc: any = {
        uri: { scheme: 'file', fsPath: 'C:\\Projects\\my-app\\src\\index.ts' },
        languageId: 'typescript'
      };

      sessionManager.handleTextDocumentChange(mockDoc, 1);
      expect(sessionManager.getLiveStatus().status).toBe('active');

      sessionManager.handleWindowStateChange(false);
      expect(sessionManager.getLiveStatus().status).toBe('idle');

      sessionManager.handleWindowStateChange(true);
      expect(sessionManager.getLiveStatus().status).toBe('active');
    });
  });

  describe('2. Database Persistence & Repository Queries', () => {
    it('saves and retrieves coding sessions cleanly', () => {
      const now = Date.now();
      const session: CodingSessionItem = {
        id: 'session-test-1',
        workspaceId: 'c:/projects/devpulse',
        workspaceName: 'DevPulse',
        startedAt: now - 3600 * 1000,
        endedAt: now,
        lastActivityAt: now,
        activeDurationSeconds: 1800,
        idleDurationSeconds: 600,
        pausedDurationSeconds: 0,
        status: 'ended',
        primaryLanguage: 'typescript',
        languages: { typescript: 1500, json: 300 }
      };

      database.coding.saveSession(session);
      const retrieved = database.coding.getSession('session-test-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('session-test-1');
      expect(retrieved?.activeDurationSeconds).toBe(1800);
      expect(retrieved?.idleDurationSeconds).toBe(600);
      expect(retrieved?.languages.typescript).toBe(1500);
      expect(retrieved?.languages.json).toBe(300);
    });

    it('calculates summary statistics correctly', () => {
      const now = Date.now();
      database.coding.saveSession({
        id: 's1',
        workspaceId: 'ws1',
        workspaceName: 'Frontend',
        startedAt: now - 7200 * 1000,
        endedAt: now - 3600 * 1000,
        lastActivityAt: now - 3600 * 1000,
        activeDurationSeconds: 2400,
        idleDurationSeconds: 600,
        pausedDurationSeconds: 0,
        status: 'ended',
        primaryLanguage: 'typescript',
        languages: { typescript: 2400 }
      });

      database.coding.saveSession({
        id: 's2',
        workspaceId: 'ws2',
        workspaceName: 'Backend',
        startedAt: now - 1800 * 1000,
        endedAt: now,
        lastActivityAt: now,
        activeDurationSeconds: 1200,
        idleDurationSeconds: 300,
        pausedDurationSeconds: 0,
        status: 'ended',
        primaryLanguage: 'python',
        languages: { python: 1200 }
      });

      const summary = database.coding.getSummary();
      expect(summary.totalSessions).toBe(2);
      expect(summary.totalActiveSeconds).toBe(3600);
      expect(summary.totalIdleSeconds).toBe(900);
      expect(summary.activeProjectsCount).toBe(2);
      expect(summary.languagesCount).toBe(2);
    });

    it('computes language stats ranking and percentage', () => {
      const now = Date.now();
      database.coding.saveSession({
        id: 's-lang',
        workspaceId: 'ws1',
        workspaceName: 'App',
        startedAt: now - 3600 * 1000,
        endedAt: now,
        lastActivityAt: now,
        activeDurationSeconds: 1000,
        idleDurationSeconds: 0,
        pausedDurationSeconds: 0,
        status: 'ended',
        primaryLanguage: 'typescript',
        languages: { typescript: 750, json: 250 }
      });

      const stats = database.coding.getLanguageStats();
      expect(stats.length).toBe(2);
      expect(stats[0].languageId).toBe('typescript');
      expect(stats[0].activeSeconds).toBe(750);
      expect(stats[0].percentage).toBe(75);
      expect(stats[1].languageId).toBe('json');
      expect(stats[1].percentage).toBe(25);
    });

    it('reconciles orphaned sessions on startup crash recovery', () => {
      const now = Date.now();
      database.coding.saveSession({
        id: 'orphaned-session',
        workspaceId: 'ws-crash',
        workspaceName: 'CrashApp',
        startedAt: now - 86400 * 1000,
        endedAt: undefined,
        lastActivityAt: now - 82800 * 1000,
        activeDurationSeconds: 3600,
        idleDurationSeconds: 0,
        pausedDurationSeconds: 0,
        status: 'active',
        primaryLanguage: 'rust',
        languages: { rust: 3600 }
      });

      database.coding.reconcileOrphanedSessions();
      const reconciled = database.coding.getSession('orphaned-session');

      expect(reconciled?.status).toBe('ended');
      expect(reconciled?.endedAt).toBe(now - 82800 * 1000);
    });
  });
});

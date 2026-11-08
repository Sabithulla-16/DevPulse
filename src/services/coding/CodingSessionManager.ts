import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CodingIntelligenceRepository } from '../../database/repositories/CodingIntelligenceRepository';
import type { CodingSessionItem, DevPulseSettings, CodingStatusEvent } from '../../shared/types';

export interface TextDocumentLike {
  uri: { scheme: string; fsPath: string };
  languageId: string;
}

export interface TextEditorLike {
  document: TextDocumentLike;
}

export type WorkspaceFolderResolver = (uri: { scheme: string; fsPath: string }) => { uri: { fsPath: string }; name: string } | undefined;

export class CodingSessionManager {
  private currentSession: CodingSessionItem | null = null;
  private lastHeartbeatAt = Date.now();
  private lastEditAt = 0;
  private isManuallyPaused = false;
  private isWindowFocused = true;
  private persistDebounceTimer: NodeJS.Timeout | undefined;
  private statusCheckTimer: NodeJS.Timeout | undefined;
  private onStatusChangeCallbacks: Array<(status: CodingStatusEvent) => void> = [];

  constructor(
    private readonly repository: CodingIntelligenceRepository,
    private settings: DevPulseSettings,
    private readonly getWorkspaceFolder?: WorkspaceFolderResolver
  ) {}

  initialize(): void {
    // 1. Crash recovery: close any sessions left open from prior crash/kill
    this.repository.reconcileOrphanedSessions();

    // 2. Start periodic 5s status check to detect idle transitions
    this.statusCheckTimer = setInterval(() => {
      this.tickIdleCheck();
    }, 5000);
  }

  updateSettings(settings: DevPulseSettings): void {
    this.settings = settings;
    if (!settings.codingTrackingEnabled && this.currentSession) {
      this.endCurrentSession();
    }
  }

  onStatusChange(cb: (status: CodingStatusEvent) => void): { dispose: () => void } {
    this.onStatusChangeCallbacks.push(cb);
    return {
      dispose: () => {
        const idx = this.onStatusChangeCallbacks.indexOf(cb);
        if (idx >= 0) this.onStatusChangeCallbacks.splice(idx, 1);
      }
    };
  }

  private emitStatus(): void {
    const status = this.getLiveStatus();
    for (const cb of this.onStatusChangeCallbacks) {
      try {
        cb(status);
      } catch {}
    }
  }

  getLiveStatus(): CodingStatusEvent {
    if (!this.settings.codingTrackingEnabled) {
      return {
        status: 'stopped',
        currentSessionSeconds: 0,
        activeDurationSeconds: 0
      };
    }

    if (this.isManuallyPaused) {
      return {
        status: 'paused',
        activeProject: this.currentSession?.workspaceName,
        activeLanguage: this.currentSession?.primaryLanguage,
        currentSessionSeconds: this.currentSession ? Math.round((Date.now() - this.currentSession.startedAt) / 1000) : 0,
        activeDurationSeconds: this.currentSession?.activeDurationSeconds || 0
      };
    }

    if (!this.currentSession) {
      return {
        status: 'stopped',
        currentSessionSeconds: 0,
        activeDurationSeconds: 0
      };
    }

    const idleLimit = this.settings.codingIdleThresholdSeconds || 300;
    const isIdle = (Date.now() - this.lastHeartbeatAt) > (idleLimit * 1000) || (!this.isWindowFocused && this.settings.codingPauseOnWindowBlur);

    return {
      status: isIdle ? 'idle' : 'active',
      activeProject: this.currentSession.workspaceName,
      activeLanguage: this.currentSession.primaryLanguage,
      currentSessionSeconds: Math.round((Date.now() - this.currentSession.startedAt) / 1000),
      activeDurationSeconds: this.currentSession.activeDurationSeconds
    };
  }

  pause(): void {
    this.isManuallyPaused = true;
    if (this.currentSession) {
      this.currentSession.status = 'paused';
      this.schedulePersistSession();
    }
    this.emitStatus();
  }

  resume(): void {
    this.isManuallyPaused = false;
    this.lastHeartbeatAt = Date.now();
    if (this.currentSession) {
      this.currentSession.status = 'active';
      this.schedulePersistSession();
    }
    this.emitStatus();
  }

  isPaused(): boolean {
    return this.isManuallyPaused;
  }

  handleTextDocumentChange(document: TextDocumentLike, contentChangesCount: number): void {
    if (!this.settings.codingTrackingEnabled || this.isManuallyPaused) return;
    if (contentChangesCount === 0) return;

    // Filter virtual schemes
    const scheme = document.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled') return;

    const workspaceFolder = this.getWorkspaceFolder ? this.getWorkspaceFolder(document.uri) : undefined;
    const workspaceId = this.normalizeWorkspaceId(workspaceFolder?.uri.fsPath || document.uri.fsPath || 'default');
    const workspaceName = workspaceFolder?.name || 'Workspace';

    if (this.isWorkspaceExcluded(workspaceId)) return;

    const now = Date.now();
    // 1,000ms debouncing for active typing
    const isDebounced = (now - this.lastEditAt) < 1000;
    this.lastEditAt = now;

    this.recordActivity(workspaceId, workspaceName, document.languageId, now, !isDebounced);
  }

  handleActiveEditorChange(editor: TextEditorLike | undefined): void {
    if (!this.settings.codingTrackingEnabled || this.isManuallyPaused || !editor) return;

    const doc = editor.document;
    const scheme = doc.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled') return;

    const workspaceFolder = this.getWorkspaceFolder ? this.getWorkspaceFolder(doc.uri) : undefined;
    const workspaceId = this.normalizeWorkspaceId(workspaceFolder?.uri.fsPath || doc.uri.fsPath || 'default');
    const workspaceName = workspaceFolder?.name || 'Workspace';

    if (this.isWorkspaceExcluded(workspaceId)) return;

    this.recordActivity(workspaceId, workspaceName, doc.languageId, Date.now(), false);
  }

  handleDocumentSave(document: TextDocumentLike): void {
    if (!this.settings.codingTrackingEnabled || this.isManuallyPaused || !this.settings.codingTrackFileSaves) return;
    const scheme = document.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled') return;

    const workspaceFolder = this.getWorkspaceFolder ? this.getWorkspaceFolder(document.uri) : undefined;
    const workspaceId = this.normalizeWorkspaceId(workspaceFolder?.uri.fsPath || document.uri.fsPath || 'default');
    const workspaceName = workspaceFolder?.name || 'Workspace';

    if (this.isWorkspaceExcluded(workspaceId)) return;

    this.recordActivity(workspaceId, workspaceName, document.languageId, Date.now(), true);
  }

  handleWindowStateChange(focused: boolean): void {
    this.isWindowFocused = focused;
    if (!focused && this.settings.codingPauseOnWindowBlur && this.currentSession) {
      if (this.currentSession.status === 'active') {
        this.currentSession.status = 'idle';
        this.schedulePersistSession();
      }
    } else if (focused && this.currentSession && !this.isManuallyPaused) {
      this.lastHeartbeatAt = Date.now();
      this.currentSession.status = 'active';
    }
    this.emitStatus();
  }

  private recordActivity(
    workspaceId: string,
    workspaceName: string,
    languageId: string,
    now: number,
    isSubstantiveEdit: boolean
  ): void {
    const idleThresholdSeconds = this.settings.codingIdleThresholdSeconds || 300;
    const idleThresholdMs = idleThresholdSeconds * 1000;

    // Check if switching workspace or starting new session
    if (!this.currentSession || this.currentSession.workspaceId !== workspaceId) {
      if (this.currentSession) {
        this.endCurrentSession();
      }
      this.startNewSession(workspaceId, workspaceName, languageId, now);
      return;
    }

    // Accumulate heartbeat delta
    const deltaMs = now - this.lastHeartbeatAt;
    const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000));

    if (deltaMs <= idleThresholdMs) {
      // Active period
      if (deltaSeconds > 0) {
        this.currentSession.activeDurationSeconds += deltaSeconds;
        const currentLangSeconds = this.currentSession.languages[languageId] || 0;
        this.currentSession.languages[languageId] = currentLangSeconds + deltaSeconds;
      }
      this.currentSession.status = 'active';
    } else {
      // Prior period had elapsed into idle
      this.currentSession.activeDurationSeconds += idleThresholdSeconds;
      const idleElapsed = deltaSeconds - idleThresholdSeconds;
      if (idleElapsed > 0) {
        this.currentSession.idleDurationSeconds += idleElapsed;
      }
      this.currentSession.status = 'active';
    }

    this.currentSession.lastActivityAt = now;
    this.currentSession.primaryLanguage = languageId;
    this.lastHeartbeatAt = now;

    if (isSubstantiveEdit) {
      this.schedulePersistSession();
    }
    this.emitStatus();
  }

  private startNewSession(workspaceId: string, workspaceName: string, languageId: string, now: number): void {
    const langs: Record<string, number> = {};
    langs[languageId] = 0;

    this.currentSession = {
      id: randomUUID(),
      workspaceId,
      workspaceName,
      startedAt: now,
      lastActivityAt: now,
      activeDurationSeconds: 0,
      idleDurationSeconds: 0,
      pausedDurationSeconds: 0,
      status: 'active',
      primaryLanguage: languageId,
      languages: langs
    };

    this.lastHeartbeatAt = now;
    this.schedulePersistSession();
    this.emitStatus();
  }

  private tickIdleCheck(): void {
    if (!this.currentSession || this.isManuallyPaused || this.currentSession.status !== 'active') {
      return;
    }

    const idleThresholdMs = (this.settings.codingIdleThresholdSeconds || 300) * 1000;
    const elapsedSinceLast = Date.now() - this.lastHeartbeatAt;

    if (elapsedSinceLast > idleThresholdMs) {
      this.currentSession.status = 'idle';
      this.schedulePersistSession();
      this.emitStatus();
    }
  }

  endCurrentSession(): void {
    if (!this.currentSession) return;
    const now = Date.now();
    this.currentSession.endedAt = this.currentSession.lastActivityAt || now;
    this.currentSession.status = 'ended';
    this.repository.saveSession(this.currentSession);
    this.currentSession = null;
    this.emitStatus();
  }

  private schedulePersistSession(): void {
    if (!this.currentSession) return;
    if (this.persistDebounceTimer) return;

    this.persistDebounceTimer = setTimeout(() => {
      this.persistDebounceTimer = undefined;
      if (this.currentSession) {
        this.repository.saveSession(this.currentSession);
      }
    }, 5000);
  }

  private isWorkspaceExcluded(workspaceId: string): boolean {
    const exclusions = this.settings.codingWorkspaceExclusions || [];
    return exclusions.some(ex => workspaceId.includes(ex.toLowerCase()));
  }

  private normalizeWorkspaceId(rawPath: string): string {
    return rawPath.replace(/\\/g, '/').toLowerCase();
  }

  dispose(): void {
    if (this.statusCheckTimer) {
      clearInterval(this.statusCheckTimer);
      this.statusCheckTimer = undefined;
    }
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
      this.persistDebounceTimer = undefined;
    }
    this.endCurrentSession();
    this.onStatusChangeCallbacks = [];
  }
}

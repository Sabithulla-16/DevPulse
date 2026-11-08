import * as vscode from 'vscode';
import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent } from '../../shared/types';
import type { Database } from '../../database/Database';
import type { CodingSessionManager } from '../../services/coding/CodingSessionManager';

export class CodingCollector implements Collector {
  readonly id = 'coding';
  readonly name = 'Coding Intelligence';
  readonly description = 'Tracks active coding sessions and language breakdown without inspecting source content.';
  readonly category = 'coding' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private disposables: vscode.Disposable[] = [];
  private lastCollectedAt: number | undefined;

  constructor(
    private readonly database: Database,
    private readonly sessionManager: CodingSessionManager
  ) {}

  async initialize(): Promise<void> {
    this.sessionManager.initialize();
    this.state = 'idle';
  }

  async start(): Promise<void> {
    if (this.state === 'running') return;

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        this.sessionManager.handleTextDocumentChange(e.document, e.contentChanges.length);
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.sessionManager.handleActiveEditorChange(editor);
      }),
      vscode.workspace.onDidSaveTextDocument(doc => {
        this.sessionManager.handleDocumentSave(doc);
      }),
      vscode.window.onDidChangeWindowState(ws => {
        this.sessionManager.handleWindowStateChange(ws.focused);
      })
    );

    // Initial inspection of active editor
    if (vscode.window.activeTextEditor) {
      this.sessionManager.handleActiveEditorChange(vscode.window.activeTextEditor);
    }

    this.state = 'running';
  }

  async stop(): Promise<void> {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.sessionManager.endCurrentSession();
    this.state = 'idle';
  }

  async collect(): Promise<MetricEvent[]> {
    this.lastCollectedAt = Date.now();
    const summary = this.database.coding.getSummary();
    const live = this.sessionManager.getLiveStatus();

    return [
      {
        id: `coding-metric-${this.lastCollectedAt}`,
        collectorId: this.id,
        type: 'coding.summary',
        timestamp: this.lastCollectedAt,
        payload: {
          summary,
          live
        }
      }
    ];
  }

  getStatus(): CollectorStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: this.state === 'running',
      state: this.state,
      implemented: true,
      lastCollectedAt: this.lastCollectedAt
    };
  }

  getSessionManager(): CodingSessionManager {
    return this.sessionManager;
  }
}

import * as vscode from 'vscode';
import type { PulseEngine } from '../core/PulseEngine';
import type { FilesystemCollector } from '../collectors/filesystem/FilesystemCollector';

export class MonitorTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    options?: {
      description?: string;
      tooltip?: string;
      iconPath?: vscode.ThemeIcon;
      command?: vscode.Command;
      collapsibleState?: vscode.TreeItemCollapsibleState;
      contextValue?: string;
    }
  ) {
    super(label, options?.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
    this.description = options?.description;
    this.tooltip = options?.tooltip ?? label;
    this.iconPath = options?.iconPath;
    this.command = options?.command;
    this.contextValue = options?.contextValue;
  }
}

export class MonitorTreeProvider implements vscode.TreeDataProvider<MonitorTreeItem> {
  private readonly emitter = new vscode.EventEmitter<MonitorTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly engine: PulseEngine) {
    this.unsubscribe = this.engine.events.subscribe(() => {
      this.refresh();
    });
  }

  getTreeItem(element: MonitorTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MonitorTreeItem): MonitorTreeItem[] {
    if (element) {
      return [];
    }

    const isRunning = this.engine.isRunning();
    const systemSnapshot = this.engine.getLatestSystemSnapshot();
    const statuses = this.engine.getStatuses();
    const alerts = this.engine.getActiveAlerts(10, true);

    const fsCol = this.engine.getCollector<FilesystemCollector>('filesystem');
    const scan = fsCol?.getCurrentScan();

    const items: MonitorTreeItem[] = [];

    // 1. Dashboard Launcher (PRIMARY)
    items.push(
      new MonitorTreeItem('Open Dashboard', {
        description: isRunning ? 'Live' : 'Paused',
        iconPath: new vscode.ThemeIcon('dashboard'),
        command: {
          command: 'devpulse.openDashboard',
          title: 'Open DevPulse Dashboard',
          arguments: ['Overview']
        }
      })
    );

    // 2. Monitoring Status Toggle (MONITORING & INTELLIGENCE)
    items.push(
      new MonitorTreeItem('Monitoring Status', {
        description: isRunning ? 'Active · Click to Pause' : 'Paused · Click to Resume',
        tooltip: isRunning
          ? 'DevPulse telemetry engine is actively sampling system metrics. Click to pause.'
          : 'DevPulse monitoring is paused. Click to resume.',
        iconPath: new vscode.ThemeIcon(isRunning ? 'pulse' : 'debug-pause'),
        command: {
          command: isRunning ? 'devpulse.pauseMonitoring' : 'devpulse.resumeMonitoring',
          title: isRunning ? 'Pause Monitoring' : 'Resume Monitoring'
        }
      })
    );

    // 3. Pulse Insights
    items.push(
      new MonitorTreeItem('Pulse Insights', {
        description: 'Correlations & Health',
        iconPath: new vscode.ThemeIcon('compass'),
        command: {
          command: 'devpulse.openPulseInsights',
          title: 'Open Pulse Insights'
        }
      })
    );

    // 4. AI Playground
    const aiSummary = this.engine.database.ai.getSummary();
    items.push(
      new MonitorTreeItem('AI Playground', {
        description: aiSummary && aiSummary.todayTokens > 0
          ? `${aiSummary.todayTokens.toLocaleString()} tokens ($${aiSummary.todayCost.toFixed(2)})`
          : 'Multi-model studio',
        iconPath: new vscode.ThemeIcon('sparkle'),
        command: {
          command: 'devpulse.openAiPlayground',
          title: 'Open AI Playground'
        }
      })
    );

    // 5. Git Intelligence
    const gitSummary = this.engine.database.git.getSummary();
    items.push(
      new MonitorTreeItem('Git Intelligence', {
        description: gitSummary?.currentBranch
          ? `${gitSummary.currentBranch} · ${gitSummary.uncommittedChangesCount} uncommitted`
          : 'Clean workspace',
        iconPath: new vscode.ThemeIcon('source-control'),
        command: {
          command: 'devpulse.openGitIntelligence',
          title: 'Open Git Intelligence'
        }
      })
    );

    // 6. Coding Intelligence
    let codingDesc = 'Active tracking';
    try {
      const codingSummary = this.engine.database.coding.getSummary();
      if (codingSummary && codingSummary.totalActiveSeconds > 0) {
        codingDesc = `${Math.round(codingSummary.totalActiveSeconds / 60)}m active`;
      }
    } catch {}
    items.push(
      new MonitorTreeItem('Coding Intelligence', {
        description: codingDesc,
        iconPath: new vscode.ThemeIcon('history'),
        command: {
          command: 'devpulse.openCodingIntelligence',
          title: 'Open Coding Intelligence'
        }
      })
    );

    // 7. API Intelligence
    let apiDesc = 'Local ingestion';
    try {
      const apiSummary = this.engine.database.api.getSummary();
      if (apiSummary && apiSummary.totalRequests > 0) {
        apiDesc = `${apiSummary.totalRequests} requests`;
      }
    } catch {}
    items.push(
      new MonitorTreeItem('API Intelligence', {
        description: apiDesc,
        iconPath: new vscode.ThemeIcon('globe'),
        command: {
          command: 'devpulse.openApiIntelligence',
          title: 'Open API Intelligence'
        }
      })
    );

    // 8. API Testing Studio
    let testDesc = 'Interactive runner';
    try {
      const collections = this.engine.database.testing.getCollections();
      if (collections && collections.length > 0) {
        testDesc = `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`;
      }
    } catch {}
    items.push(
      new MonitorTreeItem('API Testing Studio', {
        description: testDesc,
        iconPath: new vscode.ThemeIcon('beaker'),
        command: {
          command: 'devpulse.openApiTestingStudio',
          title: 'Open API Testing Studio'
        }
      })
    );

    // 9. File Intelligence
    const scanSizeStr = scan ? formatBytes(scan.totalSizeBytes) : 'Not scanned';
    items.push(
      new MonitorTreeItem('File Intelligence', {
        description: scan ? `${scanSizeStr} · ${scan.totalFileCount} files` : 'Click to Scan',
        iconPath: new vscode.ThemeIcon('folder-active'),
        command: {
          command: 'devpulse.openFileIntelligence',
          title: 'Open File Intelligence'
        }
      })
    );

    // 10. System Intelligence
    const cpuStr = systemSnapshot ? `${systemSnapshot.cpuPercent.toFixed(0)}%` : '—';
    const ramStr = systemSnapshot ? `${systemSnapshot.memoryUsedPercent.toFixed(0)}%` : '—';
    items.push(
      new MonitorTreeItem('System Intelligence', {
        description: `CPU ${cpuStr} · RAM ${ramStr}`,
        iconPath: new vscode.ThemeIcon('server-process'),
        command: {
          command: 'devpulse.openSystemIntelligence',
          title: 'Open System Intelligence'
        }
      })
    );

    // 11. Alerts (MANAGEMENT)
    items.push(
      new MonitorTreeItem(alerts.length > 0 ? `Alerts (${alerts.length})` : 'Alerts', {
        description: alerts.length > 0 ? alerts[0].title : '0 unresolved',
        iconPath: new vscode.ThemeIcon(alerts.length > 0 ? 'warning' : 'bell'),
        command: {
          command: 'devpulse.openAlerts',
          title: 'Open Alerts'
        }
      })
    );

    // 12. Settings & Privacy
    items.push(
      new MonitorTreeItem('Settings & Privacy', {
        description: 'Local-first',
        iconPath: new vscode.ThemeIcon('settings-gear'),
        command: {
          command: 'devpulse.openSettings',
          title: 'Open Settings'
        }
      })
    );

    return items;
  }

  refresh(): void {
    this.emitter.fire();
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.emitter.dispose();
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

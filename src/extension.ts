import * as vscode from 'vscode';
import * as path from 'node:path';
import { Database } from './database/Database';
import { PulseEngine } from './core/PulseEngine';
import { SettingsManager } from './core/SettingsManager';
import { SystemCollector } from './collectors/system/SystemCollector';
import { FilesystemCollector } from './collectors/filesystem/FilesystemCollector';
import { DiskCollector } from './collectors/disk/DiskCollector';
import { ProcessCollector } from './collectors/process/ProcessCollector';
import { PortCollector } from './collectors/port/PortCollector';
import { AiCollector } from './collectors/ai/AiCollector';
import { GitCollector } from './collectors/git/GitCollector';
import { CodingCollector } from './collectors/coding/CodingCollector';
import { ApiCollector } from './collectors/api/ApiCollector';
import { DashboardProvider } from './providers/DashboardProvider';
import { MonitorTreeProvider } from './sidebar/MonitorTreeProvider';
import { StatusBarManager } from './statusbar/StatusBarManager';
import { AiProviderRegistry } from './services/ai/AiProviderRegistry';
import { CodingSessionManager } from './services/coding/CodingSessionManager';
import { ApiIngestionServer } from './services/api/ApiIngestionServer';

let activeEngine: PulseEngine | undefined;
let activeApiServer: ApiIngestionServer | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storagePath = context.globalStorageUri.fsPath;
  const wasmPath = path.join(context.extensionPath, 'out', 'vendor', 'sql-wasm.wasm');

  // 1. Initialize Database
  const database = new Database(storagePath, wasmPath);
  try {
    await database.initialize();
  } catch (err) {
    console.error('[DevPulse] Non-fatal database initialization warning:', err);
  }

  // 2. Settings Manager
  const settingsManager = new SettingsManager(database);
  const settings = settingsManager.getSettings();

  // 3. Initialize AI Provider Registry
  const aiRegistry = new AiProviderRegistry(
    database.ai,
    async (secretKey: string) => context.secrets.get(secretKey)
  );
  if (settings.aiOllamaHost) {
    aiRegistry.setOllamaHost(settings.aiOllamaHost);
  }

  // 4. Initialize Pulse Engine with collectors
  const intervalMs = Math.max(5000, settings.sampleIntervalSeconds * 1000);
  const engine = new PulseEngine(database, intervalMs);

  const filesystemCollector = new FilesystemCollector(database);
  const diskCollector = new DiskCollector(database);
  const processCollector = new ProcessCollector(database);
  const portCollector = new PortCollector(database);
  processCollector.setPortCollector(portCollector);

  const aiCollector = new AiCollector(database.ai, aiRegistry);
  const gitCollector = new GitCollector(
    database.git,
    () => (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath)
  );

  const codingSessionManager = new CodingSessionManager(
    database.coding,
    settings,
    uri => vscode.workspace.getWorkspaceFolder(uri as vscode.Uri)
  );
  const apiIngestionServer = new ApiIngestionServer(database.api, settings);

  const codingCollector = new CodingCollector(database, codingSessionManager);
  const apiCollector = new ApiCollector(database, apiIngestionServer);

  const collectors = [
    new SystemCollector(),
    filesystemCollector,
    diskCollector,
    processCollector,
    portCollector,
    aiCollector,
    gitCollector,
    codingCollector,
    apiCollector
  ];

  await engine.initialize(collectors);

  if (settings.monitoringEnabled) {
    await engine.start();
  }

  activeEngine = engine;
  activeApiServer = apiIngestionServer;

  // 5. Dashboard Provider
  const dashboard = new DashboardProvider(
    context,
    engine,
    settingsManager,
    aiRegistry,
    codingSessionManager,
    apiIngestionServer
  );

  // 6. Tree View Provider
  const tree = new MonitorTreeProvider(engine);

  // 7. Status Bar Manager
  const status = new StatusBarManager(engine, settingsManager);
  status.start();

  // 8. Configuration change listener
  const configWatcher = vscode.workspace.onDidChangeConfiguration(async e => {
    if (e.affectsConfiguration('devpulse')) {
      const updated = settingsManager.getSettings();
      engine.setSampleInterval(updated.sampleIntervalSeconds);
      if (updated.aiOllamaHost) {
        aiRegistry.setOllamaHost(updated.aiOllamaHost);
      }
      codingSessionManager.updateSettings(updated);
      apiIngestionServer.updateSettings(updated);

      if (updated.monitoringEnabled && !engine.isRunning()) {
        await engine.start();
      } else if (!updated.monitoringEnabled && engine.isRunning()) {
        await engine.pause();
      }
      tree.refresh();
      status.update();
    }
  });

  context.subscriptions.push(
    configWatcher,
    vscode.window.registerTreeDataProvider('devpulse.explorer', tree),
    vscode.commands.registerCommand('devpulse.openDashboard', (tab?: string) => dashboard.open(tab || 'Overview')),
    vscode.commands.registerCommand('devpulse.openSettings', () => dashboard.open('Settings')),
    vscode.commands.registerCommand('devpulse.openFileIntelligence', () => dashboard.open('File Intelligence')),
    vscode.commands.registerCommand('devpulse.openSystemIntelligence', () => dashboard.open('System Intelligence')),
    vscode.commands.registerCommand('devpulse.openAiPlayground', () => dashboard.open('AI Playground')),
    vscode.commands.registerCommand('devpulse.openAiIntelligence', () => dashboard.open('AI Playground')),
    vscode.commands.registerCommand('devpulse.openPulseInsights', () => dashboard.open('Pulse Insights')),
    vscode.commands.registerCommand('devpulse.openGitIntelligence', () => dashboard.open('Git Intelligence')),
    vscode.commands.registerCommand('devpulse.openCodingIntelligence', () => dashboard.open('Coding Intelligence')),
    vscode.commands.registerCommand('devpulse.openApiIntelligence', () => dashboard.open('API Intelligence')),
    vscode.commands.registerCommand('devpulse.openApiTestingStudio', () => dashboard.open('API Testing Studio')),
    vscode.commands.registerCommand('devpulse.openAlerts', () => dashboard.open('Alerts')),
    vscode.commands.registerCommand('devpulse.pauseCoding', () => {
      codingSessionManager.pause();
      vscode.window.showInformationMessage('DevPulse: Coding tracking paused.');
    }),
    vscode.commands.registerCommand('devpulse.resumeCoding', () => {
      codingSessionManager.resume();
      vscode.window.showInformationMessage('DevPulse: Coding tracking resumed.');
    }),
    vscode.commands.registerCommand('devpulse.refreshGit', async () => {
      await gitCollector.collect();
      await dashboard.sendGitData();
      await dashboard.sendOverview();
      vscode.window.showInformationMessage('DevPulse: Git intelligence refreshed.');
    }),
    vscode.commands.registerCommand('devpulse.scanWorkspace', () => dashboard.startScan()),
    vscode.commands.registerCommand('devpulse.cancelScan', () => {
      filesystemCollector.cancelScan();
      vscode.window.showInformationMessage('DevPulse: Workspace scan cancelled.');
    }),
    vscode.commands.registerCommand('devpulse.refreshProcesses', async () => {
      await processCollector.collect();
      await dashboard.sendExtendedSystem();
      vscode.window.showInformationMessage('DevPulse: Process metrics refreshed.');
    }),
    vscode.commands.registerCommand('devpulse.refreshDisk', async () => {
      await diskCollector.collect();
      await dashboard.sendExtendedSystem();
      await dashboard.sendOverview();
      vscode.window.showInformationMessage('DevPulse: Disk metrics refreshed.');
    }),
    vscode.commands.registerCommand('devpulse.clearScanHistory', async () => {
      const answer = await vscode.window.showWarningMessage(
        'Delete all historical workspace scans from local SQLite database?',
        { modal: true },
        'Clear History'
      );
      if (answer === 'Clear History') {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        database.fileScans.clearScanHistory(workspaceFolder?.uri.fsPath);
        database.schedulePersist();
        await dashboard.sendFileIntelligence();
        await dashboard.sendOverview();
        vscode.window.showInformationMessage('DevPulse: Workspace scan history cleared.');
      }
    }),
    vscode.commands.registerCommand('devpulse.refreshMetrics', async () => {
      await dashboard.refresh();
      tree.refresh();
      status.update();
      vscode.window.showInformationMessage('DevPulse metrics refreshed.');
    }),
    vscode.commands.registerCommand('devpulse.pauseMonitoring', async () => {
      await engine.pause();
      await settingsManager.updateSettings({ monitoringEnabled: false });
      tree.refresh();
      status.update();
      vscode.window.showInformationMessage('DevPulse monitoring paused.');
    }),
    vscode.commands.registerCommand('devpulse.resumeMonitoring', async () => {
      await engine.start();
      await settingsManager.updateSettings({ monitoringEnabled: true });
      tree.refresh();
      status.update();
      vscode.window.showInformationMessage('DevPulse monitoring resumed.');
    }),
    vscode.commands.registerCommand('devpulse.resetData', async () => {
      const answer = await vscode.window.showWarningMessage(
        'Delete all locally stored DevPulse metrics from your SQLite database?',
        { modal: true },
        'Delete data'
      );
      if (answer === 'Delete data') {
        await engine.reset();
        await dashboard.refresh();
        tree.refresh();
        status.update();
        vscode.window.showInformationMessage('DevPulse local metrics cleared.');
      }
    }),
    {
      dispose: () => {
        codingSessionManager.dispose();
        void apiIngestionServer.stop();
        tree.dispose();
        status.dispose();
        void engine.dispose();
      }
    }
  );
}

export async function deactivate(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (activeApiServer) {
    tasks.push(activeApiServer.stop());
    activeApiServer = undefined;
  }
  if (activeEngine) {
    tasks.push(activeEngine.dispose());
    activeEngine = undefined;
  }
  await Promise.all(tasks);
}

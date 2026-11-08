import * as vscode from 'vscode';
import type { PulseEngine } from '../core/PulseEngine';
import type { SettingsManager } from '../core/SettingsManager';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;
  private unsubscribe: (() => void) | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly engine: PulseEngine,
    private readonly settingsManager: SettingsManager
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'devpulse.openDashboard';
    this.item.name = 'DevPulse Status';
    this.item.tooltip = 'Click to open DevPulse Dashboard';
    this.item.show();
  }

  start(): void {
    this.update();
    // Subscribe to EventBus for instant updates on each sample
    this.unsubscribe = this.engine.events.subscribe(event => {
      if (event.type === 'system.snapshot') {
        this.update();
      }
    });

    // Periodic check in case of pause/idle transitions
    this.timer = setInterval(() => this.update(), 5000);
  }

  update(): void {
    const settings = this.settingsManager.getSettings();
    const isRunning = this.engine.isRunning();
    const snapshot = this.engine.getLatestSystemSnapshot();

    const parts: string[] = [];

    if (settings.statusBarShowState) {
      parts.push(isRunning ? '$(pulse)' : '$(debug-pause)');
    }

    if (snapshot) {
      if (settings.statusBarShowCpu && settings.enableCpuMonitoring) {
        parts.push(`CPU ${snapshot.cpuPercent.toFixed(0)}%`);
      }
      if (settings.statusBarShowMemory && settings.enableMemoryMonitoring) {
        parts.push(`RAM ${snapshot.memoryUsedPercent.toFixed(0)}%`);
      }
    } else if (parts.length === 0 || (parts.length === 1 && !isRunning)) {
      parts.push('DevPulse');
    }

    if (parts.length === 0) {
      parts.push('$(pulse) DevPulse');
    }

    this.item.text = parts.join(' · ');

    // Color indicators for critical resource usage
    if (snapshot && (snapshot.cpuPercent >= 90 || snapshot.memoryUsedPercent >= 90)) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.tooltip = `DevPulse Alert: High resource utilization!\nCPU: ${snapshot.cpuPercent.toFixed(1)}%\nRAM: ${snapshot.memoryUsedPercent.toFixed(1)}%`;
    } else {
      this.item.backgroundColor = undefined;
      this.item.tooltip = isRunning
        ? `DevPulse Monitoring Active (Click to open dashboard)\nCPU: ${snapshot?.cpuPercent.toFixed(1) ?? '—'}%\nRAM: ${snapshot?.memoryUsedPercent.toFixed(1) ?? '—'}%`
        : 'DevPulse Monitoring Paused (Click to open dashboard)';
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.item.dispose();
  }
}

import React from 'react';
import {
  Settings,
  Shield,
  HardDrive,
  Cpu,
  Clock,
  Layers,
  Sparkles,
  Trash2,
  CheckCircle,
  Sun,
  Moon,
  FolderTree,
  Activity,
  AlertTriangle,
  Radio,
  Clock3,
  Network,
  Download,
  BrainCircuit,
  GitBranch,
  FlaskConical,
  Compass,
  Bell
} from 'lucide-react';
import { updateSettings, resetData, clearScanHistory, exportLocalData } from '../services/vscode';
import type { DevPulseSettings } from '../types';

interface SettingsPageProps {
  settings: DevPulseSettings;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings }) => {
  const handleToggle = (key: keyof DevPulseSettings, currentValue?: boolean) => {
    updateSettings({ [key]: !currentValue });
  };

  const handleNumberChange = (key: keyof DevPulseSettings, value: number) => {
    if (!isNaN(value)) {
      updateSettings({ [key]: value });
    }
  };

  const handleStringChange = (key: keyof DevPulseSettings, value: string) => {
    updateSettings({ [key]: value });
  };

  const handleThemeChange = (theme: 'dark' | 'light') => {
    updateSettings({ theme });
  };

  return (
    <div className="page-container custom-scrollbar">
      <section className="section-header-row">
        <div>
          <div className="eyebrow-tag">
            <Settings size={13} />
            <span>CONFIGURATION & PRIVACY</span>
          </div>
          <h2 className="section-title">Settings & Observability Center</h2>
          <p className="section-desc">
            Configure telemetry sampling frequencies, threshold limits, privacy isolation,
            and manage local SQLite data export and retention.
          </p>
        </div>
      </section>

      <div className="settings-grid">
        {/* 1. Core Engine Settings */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Core Engine Settings</h3>
              <p className="card-subtitle">Global background collection and sampling rates</p>
            </div>
            <Clock size={16} className="header-icon-muted text-accent" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Enable Metric Collection</strong>
                <span>Controls all background polling and sampling across active collectors</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.monitoringEnabled}
                  onChange={() => handleToggle('monitoringEnabled', settings.monitoringEnabled)}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>System Sampling Rate</strong>
                <span>Frequency of CPU and memory sampling ticks</span>
              </div>
              <select
                className="select-input"
                value={settings.sampleIntervalSeconds}
                onChange={e => handleNumberChange('sampleIntervalSeconds', parseInt(e.target.value, 10))}
              >
                <option value={5}>5 seconds (Default)</option>
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>CPU & Kernel Monitoring</strong>
                <span>Sample CPU delta ticks and utilization percentages</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.enableCpuMonitoring}
                  onChange={() => handleToggle('enableCpuMonitoring', settings.enableCpuMonitoring)}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>RAM / Memory Monitoring</strong>
                <span>Collect memory allocation, available RAM, and cache buffers</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.enableMemoryMonitoring}
                  onChange={() => handleToggle('enableMemoryMonitoring', settings.enableMemoryMonitoring)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 2. Alert Thresholds & Health Warnings */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Alert Thresholds & Limits</h3>
              <p className="card-subtitle">Trigger automated warnings when hardware metrics spike</p>
            </div>
            <Bell size={16} className="header-icon-muted text-warning" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>CPU Load Threshold (%)</strong>
                <span>Generates an alert if sustained CPU exceeds threshold</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 100 }}
                value={settings.alertCpuThreshold ?? 90}
                onChange={e => handleNumberChange('alertCpuThreshold', parseInt(e.target.value, 10))}
                min={50}
                max={100}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Memory Usage Threshold (%)</strong>
                <span>Generates an alert if memory utilization exceeds threshold</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 100 }}
                value={settings.alertMemoryThreshold ?? 90}
                onChange={e => handleNumberChange('alertMemoryThreshold', parseInt(e.target.value, 10))}
                min={50}
                max={100}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Disk Space Threshold (%)</strong>
                <span>Warns if primary volume utilization exceeds threshold</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 100 }}
                value={settings.alertDiskThreshold ?? 90}
                onChange={e => handleNumberChange('alertDiskThreshold', parseInt(e.target.value, 10))}
                min={50}
                max={100}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Alert Cooldown Period (seconds)</strong>
                <span>Minimum quiet period before repeating duplicate hardware alerts</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 100 }}
                value={settings.alertCooldownSeconds ?? 60}
                onChange={e => handleNumberChange('alertCooldownSeconds', parseInt(e.target.value, 10))}
                min={10}
                max={3600}
              />
            </div>
          </div>
        </article>

        {/* 3. AI Telemetry & Budgets */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">AI Telemetry & Budgets</h3>
              <p className="card-subtitle">Cost metering, local daemon discovery, and budget caps</p>
            </div>
            <BrainCircuit size={16} className="header-icon-muted text-accent" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Local Ollama Daemon URL</strong>
                <span>Endpoint address for local model discovery and chat</span>
              </div>
              <input
                type="text"
                className="select-input"
                style={{ width: 220 }}
                value={settings.aiOllamaHost || 'http://localhost:11434'}
                onChange={e => handleStringChange('aiOllamaHost', e.target.value)}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Daily AI Spend Limit ($ USD)</strong>
                <span>Triggers budget notification if daily LLM tokens exceed limit</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 100 }}
                value={settings.aiDailyBudgetLimit ?? 10}
                onChange={e => handleNumberChange('aiDailyBudgetLimit', parseFloat(e.target.value))}
                min={1}
                max={1000}
                step={1}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Monthly AI Spend Limit ($ USD)</strong>
                <span>Upper spend threshold across all cloud model providers</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 100 }}
                value={settings.aiMonthlyBudgetLimit ?? 100}
                onChange={e => handleNumberChange('aiMonthlyBudgetLimit', parseFloat(e.target.value))}
                min={5}
                max={10000}
                step={5}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Local Agent Detection</strong>
                <span>Detect and display local LLMs running on loopback ports</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.aiEnableLocalAgentDetection}
                  onChange={() => handleToggle('aiEnableLocalAgentDetection', settings.aiEnableLocalAgentDetection)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 4. Git Intelligence Settings */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Git Intelligence Settings</h3>
              <p className="card-subtitle">Local repository synchronization and commit history depth</p>
            </div>
            <GitBranch size={16} className="header-icon-muted text-accent" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Repository Polling Frequency</strong>
                <span>Interval between local git status and branch checks</span>
              </div>
              <select
                className="select-input"
                value={settings.gitPollIntervalSeconds ?? 15}
                onChange={e => handleNumberChange('gitPollIntervalSeconds', parseInt(e.target.value, 10))}
              >
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds (Default)</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Max Commits to Index</strong>
                <span>Number of recent commits analyzed for velocity and contributors</span>
              </div>
              <select
                className="select-input"
                value={settings.gitMaxCommits ?? 200}
                onChange={e => handleNumberChange('gitMaxCommits', parseInt(e.target.value, 10))}
              >
                <option value={50}>50 commits</option>
                <option value={100}>100 commits</option>
                <option value={200}>200 commits (Default)</option>
                <option value={500}>500 commits</option>
              </select>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Track Remote Tracking Branches</strong>
                <span>Inspect ahead/behind sync status relative to origin</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.gitTrackRemoteBranches}
                  onChange={() => handleToggle('gitTrackRemoteBranches', settings.gitTrackRemoteBranches)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 5. Coding Intelligence Settings */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Coding Intelligence Settings</h3>
              <p className="card-subtitle">Focus session thresholds, privacy mode, and active tracking</p>
            </div>
            <Clock3 size={16} className="header-icon-muted" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Enable Coding Tracking</strong>
                <span>Records active developer focus intervals and language distributions</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.codingTrackingEnabled}
                  onChange={() => handleToggle('codingTrackingEnabled', settings.codingTrackingEnabled)}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Idle Detection Threshold</strong>
                <span>Inactivity interval before active coding time stops accumulating</span>
              </div>
              <select
                className="select-input"
                value={settings.codingIdleThresholdSeconds || 300}
                onChange={e => handleNumberChange('codingIdleThresholdSeconds', parseInt(e.target.value, 10))}
              >
                <option value={60}>1 minute</option>
                <option value={180}>3 minutes</option>
                <option value={300}>5 minutes (Default)</option>
                <option value={600}>10 minutes</option>
              </select>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Pause on Window Blur</strong>
                <span>Automatically pause active tracking when switching to another application</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.codingPauseOnWindowBlur}
                  onChange={() => handleToggle('codingPauseOnWindowBlur', settings.codingPauseOnWindowBlur)}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Track Document Saves</strong>
                <span>Include explicit file save heartbeats in focus duration calculations</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.codingTrackFileSaves}
                  onChange={() => handleToggle('codingTrackFileSaves', settings.codingTrackFileSaves)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 6. API Intelligence & Ingestion */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">API Intelligence & Ingestion</h3>
              <p className="card-subtitle">Loopback HTTP middleware listener and latency alert thresholds</p>
            </div>
            <Network size={16} className="header-icon-muted text-accent" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Ingestion Port</strong>
                <span>Local port for development frameworks to report request spans</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 120 }}
                value={settings.apiIngestionPort || 49152}
                onChange={e => handleNumberChange('apiIngestionPort', parseInt(e.target.value, 10))}
                min={1024}
                max={65535}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>P95 Latency Alert Threshold (ms)</strong>
                <span>Triggers alert if 95th percentile response time exceeds threshold</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 120 }}
                value={settings.apiAlertLatencyP95ThresholdMs || 1000}
                onChange={e => handleNumberChange('apiAlertLatencyP95ThresholdMs', parseInt(e.target.value, 10))}
                min={50}
                max={30000}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Error Rate Alert Threshold (%)</strong>
                <span>Triggers alert if 4xx/5xx error percentage exceeds threshold</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 120 }}
                value={settings.apiAlertErrorRateThresholdPercent || 5.0}
                onChange={e => handleNumberChange('apiAlertErrorRateThresholdPercent', parseFloat(e.target.value))}
                min={1}
                max={100}
                step={0.5}
              />
            </div>
          </div>
        </article>

        {/* 7. API Testing Studio Settings */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">API Testing Studio</h3>
              <p className="card-subtitle">Request execution limits, sandbox timeouts, and telemetry routing</p>
            </div>
            <FlaskConical size={16} className="header-icon-muted text-accent" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Default Request Timeout (ms)</strong>
                <span>Maximum wait time for response before aborting single request</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 120 }}
                value={settings.apiTestingDefaultTimeoutMs || 30000}
                onChange={e => handleNumberChange('apiTestingDefaultTimeoutMs', parseInt(e.target.value, 10))}
                min={1000}
                max={300000}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Maximum Response Body Size (MB)</strong>
                <span>Payload truncation limit to prevent webview memory exhaustion</span>
              </div>
              <input
                type="number"
                className="select-input"
                style={{ width: 120 }}
                value={settings.apiTestingMaxResponseBodySizeMb || 20}
                onChange={e => handleNumberChange('apiTestingMaxResponseBodySizeMb', parseInt(e.target.value, 10))}
                min={1}
                max={100}
              />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Route Testing Spans to API Intelligence</strong>
                <span>Include test runner executions in the main API throughput telemetry</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.apiTestingLogToApiIntelligence}
                  onChange={() => handleToggle('apiTestingLogToApiIntelligence', settings.apiTestingLogToApiIntelligence)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 8. Pulse Insights Settings */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Pulse Insights Configuration</h3>
              <p className="card-subtitle">Automated environment health and heuristic explanation preferences</p>
            </div>
            <Compass size={16} className="header-icon-muted text-accent" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Enable AI Deep Explanations</strong>
                <span>Allow optional LLM synthesis when requesting in-depth insight analysis</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.pulseInsightsAiExplanationEnabled ?? true}
                  onChange={() => handleToggle('pulseInsightsAiExplanationEnabled', settings.pulseInsightsAiExplanationEnabled ?? true)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 9. Appearance & Status Bar */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Appearance & Status Bar</h3>
              <p className="card-subtitle">VS Code status bar indicators and UI theme</p>
            </div>
            <Sparkles size={16} className="header-icon-muted" />
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Dashboard Visual Theme</strong>
                <span>Select preferred color scheme</span>
              </div>
              <div className="theme-toggle-group">
                <button
                  type="button"
                  className={`theme-pill ${settings.theme === 'dark' ? 'is-selected' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                >
                  <Moon size={13} /> Dark
                </button>
                <button
                  type="button"
                  className={`theme-pill ${settings.theme === 'light' ? 'is-selected' : ''}`}
                  onClick={() => handleThemeChange('light')}
                >
                  <Sun size={13} /> Light
                </button>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Status Bar: Show CPU Load</strong>
                <span>Displays live CPU % in the VS Code bottom status bar</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.statusBarShowCpu}
                  onChange={() => handleToggle('statusBarShowCpu', settings.statusBarShowCpu)}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>Status Bar: Show RAM Usage</strong>
                <span>Displays live RAM % in the VS Code bottom status bar</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.statusBarShowMemory}
                  onChange={() => handleToggle('statusBarShowMemory', settings.statusBarShowMemory)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </article>

        {/* 10. Local-First Privacy Architecture & Data Management */}
        <article className="card panel-card privacy-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Local-First Privacy Architecture</h3>
              <p className="card-subtitle">Your code, credentials, and telemetry remain strictly on this device</p>
            </div>
            <Shield size={16} className="text-accent" />
          </div>

          <div className="privacy-manifesto-list">
            <div className="manifesto-item">
              <CheckCircle size={16} className="text-accent" />
              <div>
                <strong>Zero Cloud Uploads & 100% On-Device</strong>
                <p>DevPulse operates entirely offline. There are no analytics pings, remote servers, or external tracking telemetry.</p>
              </div>
            </div>

            <div className="manifesto-item">
              <CheckCircle size={16} className="text-accent" />
              <div>
                <strong>Source Code Integrity</strong>
                <p>DevPulse never copies, transmits, or logs your source code files or editor buffers.</p>
              </div>
            </div>

            <div className="manifesto-item">
              <CheckCircle size={16} className="text-accent" />
              <div>
                <strong>Encrypted Secret Storage</strong>
                <p>
                  All API keys, custom provider tokens, and test secrets are stored exclusively in VS Code&apos;s encrypted SecretStorage (never written to disk in plaintext).
                </p>
              </div>
            </div>
          </div>

          <div className="data-reset-row" style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong>Local Telemetry Management</strong>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>
                Export your recorded local telemetry to JSON or reset the database.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="secondary-btn" onClick={exportLocalData} title="Export recorded telemetry data as formatted JSON">
                <Download size={14} />
                <span>Export Telemetry (JSON)</span>
              </button>
              <button type="button" className="secondary-btn btn-danger" onClick={resetData} title="Delete stored telemetry records">
                <Trash2 size={14} />
                <span>Purge Database</span>
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};

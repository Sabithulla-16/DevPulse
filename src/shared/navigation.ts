export type NavigationCategory =
  | 'Overview'
  | 'Intelligence'
  | 'AI'
  | 'Development Tools'
  | 'Monitoring'
  | 'Configuration';

export interface NavigationRoute {
  id: string;
  label: string;
  category: NavigationCategory;
  vscodeIcon: string;
  commandId: string;
  commandArg?: string;
  description: string;
  collectorId?: string;
}

export const NAVIGATION_REGISTRY: NavigationRoute[] = [
  {
    id: 'Overview',
    label: 'Open Dashboard',
    category: 'Overview',
    vscodeIcon: 'dashboard',
    commandId: 'devpulse.openDashboard',
    commandArg: 'Overview',
    description: 'Unified Developer Observability'
  },
  {
    id: 'Pulse Insights',
    label: 'Pulse Insights',
    category: 'Intelligence',
    vscodeIcon: 'compass',
    commandId: 'devpulse.openPulseInsights',
    description: 'Correlations & Environment Health'
  },
  {
    id: 'AI Playground',
    label: 'AI Playground',
    category: 'AI',
    vscodeIcon: 'sparkle',
    commandId: 'devpulse.openAiPlayground',
    description: 'Multi-Model Studio & Token Analytics',
    collectorId: 'ai'
  },
  {
    id: 'Git Intelligence',
    label: 'Git Intelligence',
    category: 'Intelligence',
    vscodeIcon: 'source-control',
    commandId: 'devpulse.openGitIntelligence',
    description: 'Branch Telemetry & Commit History',
    collectorId: 'git'
  },
  {
    id: 'Coding Intelligence',
    label: 'Coding Intelligence',
    category: 'Development Tools',
    vscodeIcon: 'history',
    commandId: 'devpulse.openCodingIntelligence',
    description: 'Developer Focus & Language Metrics',
    collectorId: 'coding'
  },
  {
    id: 'API Intelligence',
    label: 'API Intelligence',
    category: 'Development Tools',
    vscodeIcon: 'globe',
    commandId: 'devpulse.openApiIntelligence',
    description: 'Local Ingestion & Latency Percentiles',
    collectorId: 'api'
  },
  {
    id: 'API Testing Studio',
    label: 'API Testing Studio',
    category: 'Development Tools',
    vscodeIcon: 'beaker',
    commandId: 'devpulse.openApiTestingStudio',
    description: 'Interactive HTTP Runner & Collections'
  },
  {
    id: 'File Intelligence',
    label: 'File Intelligence',
    category: 'Monitoring',
    vscodeIcon: 'folder-active',
    commandId: 'devpulse.openFileIntelligence',
    description: 'Workspace Storage & Large Assets',
    collectorId: 'filesystem'
  },
  {
    id: 'System Intelligence',
    label: 'System Intelligence',
    category: 'Intelligence',
    vscodeIcon: 'server-process',
    commandId: 'devpulse.openSystemIntelligence',
    description: 'CPU, RAM, GPU, Disks & Ports',
    collectorId: 'system'
  },
  {
    id: 'Alerts',
    label: 'Alerts',
    category: 'Monitoring',
    vscodeIcon: 'bell',
    commandId: 'devpulse.openAlerts',
    description: 'Active & Historical Warnings'
  },
  {
    id: 'Settings',
    label: 'Settings & Privacy',
    category: 'Configuration',
    vscodeIcon: 'settings-gear',
    commandId: 'devpulse.openSettings',
    description: 'Local-First Configuration & Retention'
  }
];

export const CATEGORY_ORDER: NavigationCategory[] = [
  'Overview',
  'Intelligence',
  'AI',
  'Development Tools',
  'Monitoring',
  'Configuration'
];

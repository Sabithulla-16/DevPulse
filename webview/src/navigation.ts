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
  description: string;
  collectorId?: string;
}

export const NAVIGATION_REGISTRY: NavigationRoute[] = [
  {
    id: 'Overview',
    label: 'Overview',
    category: 'Overview',
    description: 'Unified Developer Observability'
  },
  {
    id: 'Pulse Insights',
    label: 'Pulse Insights',
    category: 'Intelligence',
    description: 'Correlations & Environment Health'
  },
  {
    id: 'Git Intelligence',
    label: 'Git Intelligence',
    category: 'Intelligence',
    description: 'Branch Telemetry & Commit History',
    collectorId: 'git'
  },
  {
    id: 'System Intelligence',
    label: 'System Intelligence',
    category: 'Intelligence',
    description: 'CPU, RAM, GPU, Disks & Ports',
    collectorId: 'system'
  },
  {
    id: 'AI Playground',
    label: 'AI Playground',
    category: 'AI',
    description: 'Multi-Model Studio & Token Analytics',
    collectorId: 'ai'
  },
  {
    id: 'Coding Intelligence',
    label: 'Coding Intelligence',
    category: 'Development Tools',
    description: 'Developer Focus & Language Metrics',
    collectorId: 'coding'
  },
  {
    id: 'API Intelligence',
    label: 'API Intelligence',
    category: 'Development Tools',
    description: 'Local Ingestion & Latency Percentiles',
    collectorId: 'api'
  },
  {
    id: 'API Testing Studio',
    label: 'API Testing Studio',
    category: 'Development Tools',
    description: 'Interactive HTTP Runner & Collections'
  },
  {
    id: 'File Intelligence',
    label: 'File Intelligence',
    category: 'Monitoring',
    description: 'Workspace Storage & Large Assets',
    collectorId: 'filesystem'
  },
  {
    id: 'Alerts',
    label: 'Alerts',
    category: 'Monitoring',
    description: 'Active & Historical Warnings'
  },
  {
    id: 'Settings',
    label: 'Settings & Privacy',
    category: 'Configuration',
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

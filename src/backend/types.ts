// Types partagés pour l'API REST du tableau de bord

export interface DashboardResponse {
  online: boolean;
  uptime: number;
  memoryMB: number;
  cpuPercent: number;
  loadAvg: number[];
  ping: number;
  guildCount: number;
  userCount: number;
  activePlatforms: number;
  totalPlatforms: number;
  cacheTotal: number;
  alertsTotal: number;
  pid: number;
  version: string;
}

export interface MetricSnapshot {
  timestamp: string;
  cpu: number;
  ram: number;
  ping: number;
  events: number;
  errors: number;
}

export interface MetricsResponse {
  period: '1h' | '24h' | '7d';
  interval: number;
  data: MetricSnapshot[];
  summary: {
    avgCpu: number;
    maxCpu: number;
    avgRam: number;
    maxRam: number;
    avgPing: number;
    totalEvents: number;
    totalErrors: number;
  };
}

export interface FeedInfo {
  id: string;
  label: string;
  active: boolean;
  cacheCount: number;
  lastRun: string | null;
  responseTime: number | null;
  recentErrors: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  message: string;
  module?: string;
}

export interface LogsQuery {
  level?: string;
  search?: string;
  limit?: number;
  before?: string;
}

export interface LogsResponse {
  total: number;
  logs: LogEntry[];
}

export interface AppSettings {
  token?: string;
  port?: number;
  refreshInterval?: number;
  theme?: 'dark' | 'light';
  notifications?: boolean;
  autoReconnect?: boolean;
}

export interface AlertInfo {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export type WsEventType =
  | 'dashboard-update'
  | 'platform-update'
  | 'cache-update'
  | 'log'
  | 'alert'
  | 'bot-status'
  | 'fortnite-update'
  | 'connected'
  | 'metric-snapshot';

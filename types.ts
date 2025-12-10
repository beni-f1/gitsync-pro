export enum UserRole {
  VIEWER = 'VIEWER',
  EDITOR = 'EDITOR',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  email: string;
  createdAt: string;
}

export enum CredentialType {
  USERNAME_PASSWORD = 'USERNAME_PASSWORD',
  SSH_KEY = 'SSH_KEY',
  PERSONAL_ACCESS_TOKEN = 'PERSONAL_ACCESS_TOKEN'
}

export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  username?: string; // For User/Pass or SSH user
  createdAt: string;
}

export enum SyncStatus {
  IDLE = 'IDLE',
  SYNCING = 'SYNCING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export interface SyncJob {
  id: string;
  name: string;
  sourceUrl: string;
  sourceCredentialId?: string;
  destinationUrl: string;
  destinationCredentialId?: string;
  branchFilter: string; // Regex or glob pattern
  tagFilter: string;    // Regex or glob pattern
  cronSchedule: string; // e.g. "0 * * * *"
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus: SyncStatus;
  lastRunMessage?: string;
}

export interface JobRunStats {
  branchesSynced: number;
  tagsSynced: number;
  commitsPushed: number;
  filesChanged: number;
  bytesTransferred: number;
}

export interface JobRun {
  id: string;
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: SyncStatus;
  message: string;
  stats?: JobRunStats;
  logs: JobRunLogEntry[];
}

export interface JobRunLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
}

export interface LogEntry {
  id: string;
  jobId: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface AppSettings {
  gitTimeout: number;
  maxRetries: number;
  logRetentionDays: number;
  demoMode?: boolean;
}

// Compare types
export interface BranchComparison {
  name: string;
  sourceCommit?: string;
  destCommit?: string;
  ahead: number;
  behind: number;
  status: 'synced' | 'ahead' | 'behind' | 'diverged' | 'new_in_source' | 'new_in_dest';
}

export interface TagComparison {
  name: string;
  sourceCommit?: string;
  destCommit?: string;
  status: 'synced' | 'new_in_source' | 'new_in_dest' | 'different';
}

export interface CompareSummary {
  totalBranches: number;
  branchesSynced: number;
  branchesAhead: number;
  branchesBehind: number;
  branchesDiverged: number;
  branchesNewInSource: number;
  branchesNewInDest: number;
  totalTags: number;
  tagsSynced: number;
  tagsNewInSource: number;
  tagsNewInDest: number;
  tagsDifferent: number;
}

export interface CompareResult {
  success: boolean;
  message: string;
  branches: BranchComparison[];
  tags: TagComparison[];
  summary: CompareSummary;
  logs: JobRunLogEntry[];
}

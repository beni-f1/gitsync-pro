/**
 * API Service - HTTP client for backend communication
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    // Restore token from session storage
    this.token = sessionStorage.getItem('gs_token');
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401) {
      this.logout();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || 'Request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await this.request<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      this.token = response.access_token;
      sessionStorage.setItem('gs_token', this.token);
      
      // Fetch and store user info
      const user = await this.getCurrentUser();
      if (user) {
        sessionStorage.setItem('gs_current_user', JSON.stringify(user));
      }
      
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentUser() {
    if (!this.token) return null;
    try {
      return await this.request<any>('/auth/me');
    } catch {
      return null;
    }
  }

  logout() {
    this.token = null;
    sessionStorage.removeItem('gs_token');
    sessionStorage.removeItem('gs_current_user');
  }

  isLoggedIn(): boolean {
    return !!this.token;
  }

  // Users
  async getUsers() {
    return this.request<any[]>('/users');
  }

  async createUser(data: any) {
    return this.request<any>('/users', { method: 'POST', body: data });
  }

  async updateUser(id: string, data: any) {
    return this.request<any>(`/users/${id}`, { method: 'PUT', body: data });
  }

  async deleteUser(id: string) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  }

  // Credentials
  async getCredentials() {
    return this.request<any[]>('/credentials');
  }

  async createCredential(data: any) {
    return this.request<any>('/credentials', { method: 'POST', body: data });
  }

  async updateCredential(id: string, data: any) {
    return this.request<any>(`/credentials/${id}`, { method: 'PUT', body: data });
  }

  async deleteCredential(id: string) {
    return this.request(`/credentials/${id}`, { method: 'DELETE' });
  }

  // Jobs
  async getJobs() {
    return this.request<any[]>('/jobs');
  }

  async createJob(data: any) {
    // Map frontend field names to backend
    const mappedData = {
      name: data.name,
      source_url: data.sourceUrl,
      source_credential_id: data.sourceCredentialId || null,
      destination_url: data.destinationUrl,
      destination_credential_id: data.destinationCredentialId || null,
      branch_filter: data.branchFilter || '.*',
      tag_filter: data.tagFilter || '',
      cron_schedule: data.cronSchedule || '0 * * * *',
      enabled: data.enabled ?? true,
    };
    return this.request<any>('/jobs', { method: 'POST', body: mappedData });
  }

  async updateJob(id: string, data: any) {
    // Map frontend field names to backend
    const mappedData: any = {};
    if (data.name !== undefined) mappedData.name = data.name;
    if (data.sourceUrl !== undefined) mappedData.source_url = data.sourceUrl;
    if (data.sourceCredentialId !== undefined) mappedData.source_credential_id = data.sourceCredentialId || null;
    if (data.destinationUrl !== undefined) mappedData.destination_url = data.destinationUrl;
    if (data.destinationCredentialId !== undefined) mappedData.destination_credential_id = data.destinationCredentialId || null;
    if (data.branchFilter !== undefined) mappedData.branch_filter = data.branchFilter;
    if (data.tagFilter !== undefined) mappedData.tag_filter = data.tagFilter;
    if (data.cronSchedule !== undefined) mappedData.cron_schedule = data.cronSchedule;
    if (data.enabled !== undefined) mappedData.enabled = data.enabled;
    
    return this.request<any>(`/jobs/${id}`, { method: 'PUT', body: mappedData });
  }

  async deleteJob(id: string) {
    return this.request(`/jobs/${id}`, { method: 'DELETE' });
  }

  async triggerJob(id: string) {
    return this.request<{ run_id: string }>(`/jobs/${id}/trigger`, { method: 'POST' });
  }

  async compareJob(id: string) {
    return this.request<any>(`/jobs/${id}/compare`, { method: 'POST' });
  }

  async getJobRuns(jobId: string) {
    return this.request<any[]>(`/jobs/${jobId}/runs`);
  }

  async getJobRun(jobId: string, runId: string) {
    return this.request<any>(`/jobs/${jobId}/runs/${runId}`);
  }

  // WebSocket for live logs
  createLogsWebSocket(jobId: string): WebSocket {
    const wsBase = API_BASE.replace('http', 'ws').replace('/api', '');
    return new WebSocket(`${wsBase}/api/jobs/${jobId}/logs`);
  }

  // Settings
  async getSettings() {
    return this.request<any>('/settings');
  }

  async updateSettings(data: any) {
    // Map frontend field names to backend
    const mappedData = {
      git_timeout: data.gitTimeout,
      max_retries: data.maxRetries,
      log_retention_days: data.logRetentionDays,
      demo_mode: data.demoMode,
    };
    return this.request<any>('/settings', { method: 'PUT', body: mappedData });
  }

  // Logs
  async getLogs(params?: { source?: string; level?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.source) query.set('source', params.source);
    if (params?.level) query.set('level', params.level);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryStr = query.toString();
    return this.request<any[]>(`/logs${queryStr ? '?' + queryStr : ''}`);
  }

  // Health
  async getHealth() {
    return this.request<{ status: string; demo_mode: boolean }>('/health');
  }
}

export const apiService = new ApiService();

// Helper to map backend job to frontend format
export function mapJobFromApi(job: any): any {
  return {
    id: job.id,
    name: job.name,
    sourceUrl: job.source_url,
    sourceCredentialId: job.source_credential_id,
    destinationUrl: job.destination_url,
    destinationCredentialId: job.destination_credential_id,
    branchFilter: job.branch_filter,
    tagFilter: job.tag_filter,
    cronSchedule: job.cron_schedule,
    enabled: job.enabled,
    lastRunAt: job.last_run_at,
    lastRunStatus: job.last_run_status,
    lastRunMessage: job.last_run_message,
  };
}

// Helper to map backend job run to frontend format
export function mapJobRunFromApi(run: any): any {
  return {
    id: run.id,
    jobId: run.job_id,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    status: run.status,
    message: run.message,
    stats: run.stats ? {
      branchesSynced: run.stats.branches_synced,
      tagsSynced: run.stats.tags_synced,
      commitsPushed: run.stats.commits_pushed,
      filesChanged: run.stats.files_changed,
      bytesTransferred: run.stats.bytes_transferred,
    } : undefined,
    logs: run.logs || [],
  };
}

// Helper to map backend credential to frontend format
export function mapCredentialFromApi(cred: any): any {
  return {
    id: cred.id,
    name: cred.name,
    type: cred.type,
    username: cred.username,
    createdAt: cred.created_at,
  };
}

// Helper to map backend user to frontend format
export function mapUserFromApi(user: any): any {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
  };
}

// Helper to map backend settings to frontend format
export function mapSettingsFromApi(settings: any): any {
  return {
    gitTimeout: settings.git_timeout,
    maxRetries: settings.max_retries,
    logRetentionDays: settings.log_retention_days,
    demoMode: settings.demo_mode,
  };
}

// Helper to map backend compare result to frontend format
export function mapCompareResultFromApi(result: any): any {
  return {
    success: result.success,
    message: result.message,
    branches: result.branches.map((b: any) => ({
      name: b.name,
      sourceCommit: b.source_commit,
      destCommit: b.dest_commit,
      ahead: b.ahead,
      behind: b.behind,
      status: b.status,
    })),
    tags: result.tags.map((t: any) => ({
      name: t.name,
      sourceCommit: t.source_commit,
      destCommit: t.dest_commit,
      status: t.status,
    })),
    summary: {
      totalBranches: result.summary.total_branches,
      branchesSynced: result.summary.branches_synced,
      branchesAhead: result.summary.branches_ahead,
      branchesBehind: result.summary.branches_behind,
      branchesDiverged: result.summary.branches_diverged,
      branchesNewInSource: result.summary.branches_new_in_source,
      branchesNewInDest: result.summary.branches_new_in_dest,
      totalTags: result.summary.total_tags,
      tagsSynced: result.summary.tags_synced,
      tagsNewInSource: result.summary.tags_new_in_source,
      tagsNewInDest: result.summary.tags_new_in_dest,
      tagsDifferent: result.summary.tags_different,
    },
    logs: result.logs || [],
  };
}

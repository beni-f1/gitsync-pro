/**
 * Data Store - Abstraction layer that switches between demo mode (mockStore) and real API
 */

import { mockStore } from './mockStore';
import { 
  apiService, 
  mapJobFromApi, 
  mapJobRunFromApi, 
  mapCredentialFromApi, 
  mapUserFromApi,
  mapSettingsFromApi 
} from './api';
import { User, Credential, SyncJob, AppSettings, JobRun } from '../types';

// Check if we should use demo mode (mockStore)
// This can be set via env var or localStorage for development
const isDemoMode = (): boolean => {
  // Check localStorage first (allows runtime switching)
  const localDemo = localStorage.getItem('gs_demo_mode');
  if (localDemo !== null) {
    return localDemo === 'true';
  }
  // Fall back to env var
  return import.meta.env.VITE_DEMO_MODE === 'true';
};

class DataStore {
  // Auth
  async login(username: string, password: string): Promise<boolean> {
    if (isDemoMode()) {
      const user = await mockStore.login(username, password);
      return user !== null;
    }
    const success = await apiService.login(username, password);
    if (success) {
      const user = await apiService.getCurrentUser();
      if (user) {
        sessionStorage.setItem('gs_current_user', JSON.stringify(mapUserFromApi(user)));
      }
    }
    return success;
  }

  getCurrentUser(): User | null {
    if (isDemoMode()) {
      return mockStore.getCurrentUser();
    }
    const userJson = sessionStorage.getItem('gs_current_user');
    return userJson ? JSON.parse(userJson) : null;
  }

  async fetchCurrentUser(): Promise<User | null> {
    if (isDemoMode()) {
      return mockStore.getCurrentUser();
    }
    const user = await apiService.getCurrentUser();
    if (user) {
      const mapped = mapUserFromApi(user);
      sessionStorage.setItem('gs_current_user', JSON.stringify(mapped));
      return mapped;
    }
    return null;
  }

  logout(): void {
    if (isDemoMode()) {
      mockStore.logout();
    } else {
      apiService.logout();
    }
  }

  // Users
  async getUsers(): Promise<User[]> {
    if (isDemoMode()) {
      return mockStore.getUsers();
    }
    const users = await apiService.getUsers();
    return users.map(mapUserFromApi);
  }

  async createUser(data: any): Promise<User> {
    if (isDemoMode()) {
      return mockStore.createUser(data);
    }
    const user = await apiService.createUser(data);
    return mapUserFromApi(user);
  }

  async updateUser(id: string, data: Partial<User>): Promise<void> {
    if (isDemoMode()) {
      return mockStore.updateUser(id, data);
    }
    await apiService.updateUser(id, data);
  }

  async deleteUser(id: string): Promise<void> {
    if (isDemoMode()) {
      return mockStore.deleteUser(id);
    }
    await apiService.deleteUser(id);
  }

  // Credentials
  async getCredentials(): Promise<Credential[]> {
    if (isDemoMode()) {
      return mockStore.getCredentials();
    }
    const creds = await apiService.getCredentials();
    return creds.map(mapCredentialFromApi);
  }

  async createCredential(data: any): Promise<Credential> {
    if (isDemoMode()) {
      return mockStore.createCredential(data);
    }
    const cred = await apiService.createCredential(data);
    return mapCredentialFromApi(cred);
  }

  async updateCredential(id: string, data: Partial<Credential>): Promise<void> {
    if (isDemoMode()) {
      return mockStore.updateCredential(id, data);
    }
    await apiService.updateCredential(id, data);
  }

  async deleteCredential(id: string): Promise<void> {
    if (isDemoMode()) {
      return mockStore.deleteCredential(id);
    }
    await apiService.deleteCredential(id);
  }

  // Jobs
  async getJobs(): Promise<SyncJob[]> {
    if (isDemoMode()) {
      return mockStore.getJobs();
    }
    const jobs = await apiService.getJobs();
    return jobs.map(mapJobFromApi);
  }

  async createJob(data: any): Promise<SyncJob> {
    if (isDemoMode()) {
      return mockStore.createJob(data);
    }
    const job = await apiService.createJob(data);
    return mapJobFromApi(job);
  }

  async updateJob(id: string, data: Partial<SyncJob>): Promise<void> {
    if (isDemoMode()) {
      return mockStore.updateJob(id, data);
    }
    await apiService.updateJob(id, data);
  }

  async deleteJob(id: string): Promise<void> {
    if (isDemoMode()) {
      return mockStore.deleteJob(id);
    }
    await apiService.deleteJob(id);
  }

  async triggerJob(id: string): Promise<string> {
    if (isDemoMode()) {
      return mockStore.triggerJob(id);
    }
    const result = await apiService.triggerJob(id);
    return result.run_id;
  }

  async getJobRuns(jobId: string): Promise<JobRun[]> {
    if (isDemoMode()) {
      return mockStore.getJobRuns(jobId);
    }
    const runs = await apiService.getJobRuns(jobId);
    return runs.map(mapJobRunFromApi);
  }

  async getJobRun(jobId: string, runId: string): Promise<JobRun | null> {
    if (isDemoMode()) {
      return mockStore.getJobRun(runId);
    }
    const run = await apiService.getJobRun(jobId, runId);
    return run ? mapJobRunFromApi(run) : null;
  }

  // For demo mode - get active run
  getActiveRun(jobId: string): JobRun | null {
    if (isDemoMode()) {
      return mockStore.getActiveRun(jobId);
    }
    // In API mode, this is handled via WebSocket
    return null;
  }

  // Settings
  async getSettings(): Promise<AppSettings> {
    if (isDemoMode()) {
      return mockStore.getSettings();
    }
    const settings = await apiService.getSettings();
    return mapSettingsFromApi(settings);
  }

  async updateSettings(data: AppSettings): Promise<void> {
    if (isDemoMode()) {
      return mockStore.updateSettings(data);
    }
    await apiService.updateSettings(data);
  }

  // WebSocket for live logs (API mode only)
  createLogsWebSocket(jobId: string): WebSocket | null {
    if (isDemoMode()) {
      return null; // Demo mode uses event-based updates
    }
    return apiService.createLogsWebSocket(jobId);
  }

  // Check if in demo mode
  isDemoMode(): boolean {
    return isDemoMode();
  }

  // Toggle demo mode
  setDemoMode(enabled: boolean): void {
    localStorage.setItem('gs_demo_mode', enabled.toString());
    // Force page reload to apply change
    window.location.reload();
  }
}

export const dataStore = new DataStore();

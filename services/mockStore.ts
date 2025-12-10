import { User, UserRole, Credential, SyncJob, SyncStatus, CredentialType, AppSettings, LogEntry, JobRun, JobRunLogEntry } from '../types';

// Extend Window interface for config
declare global {
  interface Window {
    env?: {
      ADMIN_USERNAME?: string;
      ADMIN_PASSWORD?: string;
    }
  }
}

// Initial Data Bootstrapping
const INITIAL_USERS: User[] = [
  { id: '1', username: 'admin', role: UserRole.ADMIN, email: 'admin@local.host', createdAt: new Date().toISOString() },
  { id: '2', username: 'dev_lead', role: UserRole.EDITOR, email: 'dev@local.host', createdAt: new Date().toISOString() },
  { id: '3', username: 'auditor', role: UserRole.VIEWER, email: 'audit@local.host', createdAt: new Date().toISOString() },
];

const INITIAL_PASSWORDS: Record<string, string> = {
  '1': 'admin',
  '2': 'password',
  '3': 'password'
};

const INITIAL_CREDS: Credential[] = [
  { id: 'c1', name: 'GitHub Enterprise Read', type: CredentialType.PERSONAL_ACCESS_TOKEN, username: 'svc_reader', createdAt: new Date().toISOString() },
  { id: 'c2', name: 'GitLab Production Write', type: CredentialType.SSH_KEY, username: 'git', createdAt: new Date().toISOString() },
];

const INITIAL_JOBS: SyncJob[] = [
  {
    id: 'j1',
    name: 'Core Backend Mirror',
    sourceUrl: 'https://github.com/company/core-backend.git',
    sourceCredentialId: 'c1',
    destinationUrl: 'git@gitlab.internal:infrastructure/core-mirror.git',
    destinationCredentialId: 'c2',
    branchFilter: 'main|production',
    tagFilter: 'v.*',
    cronSchedule: '*/15 * * * *',
    enabled: true,
    lastRunStatus: SyncStatus.SUCCESS,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    lastRunMessage: 'Synced 5 commits, 1 tag.',
  },
  {
    id: 'j2',
    name: 'Frontend Release Sync',
    sourceUrl: 'https://github.com/company/frontend-app.git',
    sourceCredentialId: 'c1',
    destinationUrl: 'https://bitbucket.org/partner/frontend-delivery.git',
    destinationCredentialId: '',
    branchFilter: 'release/.*',
    tagFilter: '',
    cronSchedule: '0 2 * * *',
    enabled: true,
    lastRunStatus: SyncStatus.FAILED,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    lastRunMessage: 'Error: Remote rejected master (pre-receive hook declined).',
  }
];

// Helper to simulate network delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

class MockStore {
  private users: User[] = [];
  private userPasswords: Record<string, string> = {}; // userId -> password
  private credentials: Credential[] = [];
  private jobs: SyncJob[] = [];
  private jobRuns: JobRun[] = [];
  private logs: LogEntry[] = [];
  private settings: AppSettings = { gitTimeout: 300, maxRetries: 3, logRetentionDays: 14 };
  private currentUser: User | null = null;

  constructor() {
    this.load();
    this.applyEnvOverrides();
    this.generateInitialJobHistory();
  }

  private generateInitialJobHistory() {
    // Only generate if no history exists
    if (this.jobRuns.length > 0) return;
    
    // Generate some historical runs for existing jobs
    this.jobs.forEach(job => {
      const numRuns = Math.floor(Math.random() * 8) + 3; // 3-10 runs per job
      for (let i = 0; i < numRuns; i++) {
        const hoursAgo = i * (Math.random() * 4 + 1); // Spread out over time
        const startTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const success = Math.random() > 0.2;
        const duration = Math.floor(Math.random() * 45) + 5; // 5-50 seconds
        
        const run = this.createMockJobRun(job.id, startTime, success, duration);
        this.jobRuns.push(run);
      }
    });
    
    // Sort by date descending
    this.jobRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    this.save();
  }

  private createMockJobRun(jobId: string, startTime: Date, success: boolean, durationSecs: number): JobRun {
    const endTime = new Date(startTime.getTime() + durationSecs * 1000);
    const branchesSynced = Math.floor(Math.random() * 5) + 1;
    const tagsSynced = Math.floor(Math.random() * 3);
    const commitsPushed = success ? Math.floor(Math.random() * 20) + 1 : 0;
    const filesChanged = success ? Math.floor(Math.random() * 50) + commitsPushed : 0;
    
    const logs: JobRunLogEntry[] = [];
    let currentTime = new Date(startTime);
    
    logs.push({ timestamp: currentTime.toISOString(), level: 'INFO', message: 'Starting sync job...' });
    currentTime = new Date(currentTime.getTime() + 500);
    
    logs.push({ timestamp: currentTime.toISOString(), level: 'INFO', message: 'Connecting to source repository...' });
    currentTime = new Date(currentTime.getTime() + 1200);
    
    logs.push({ timestamp: currentTime.toISOString(), level: 'INFO', message: 'Fetching remote refs...' });
    currentTime = new Date(currentTime.getTime() + 800);
    
    logs.push({ timestamp: currentTime.toISOString(), level: 'DEBUG', message: `Found ${branchesSynced} branches matching filter` });
    currentTime = new Date(currentTime.getTime() + 300);
    
    if (tagsSynced > 0) {
      logs.push({ timestamp: currentTime.toISOString(), level: 'DEBUG', message: `Found ${tagsSynced} tags matching filter` });
      currentTime = new Date(currentTime.getTime() + 200);
    }
    
    logs.push({ timestamp: currentTime.toISOString(), level: 'INFO', message: 'Connecting to destination repository...' });
    currentTime = new Date(currentTime.getTime() + 1000);
    
    if (success) {
      logs.push({ timestamp: currentTime.toISOString(), level: 'INFO', message: `Pushing ${commitsPushed} commits...` });
      currentTime = new Date(currentTime.getTime() + 2000);
      
      logs.push({ timestamp: currentTime.toISOString(), level: 'INFO', message: `Transferred ${filesChanged} files (${(Math.random() * 5 + 0.5).toFixed(2)} MB)` });
      currentTime = new Date(currentTime.getTime() + 500);
      
      logs.push({ timestamp: endTime.toISOString(), level: 'INFO', message: `Sync completed successfully in ${durationSecs}s` });
    } else {
      const errors = [
        'Connection timed out while pushing to destination',
        'Authentication failed: Invalid credentials',
        'Remote rejected push: pre-receive hook declined',
        'Network error: Unable to resolve host',
        'Permission denied: Insufficient access rights'
      ];
      logs.push({ timestamp: currentTime.toISOString(), level: 'WARN', message: 'Push operation taking longer than expected...' });
      currentTime = new Date(currentTime.getTime() + 3000);
      
      logs.push({ timestamp: endTime.toISOString(), level: 'ERROR', message: errors[Math.floor(Math.random() * errors.length)] });
    }

    return {
      id: Math.random().toString(36).substr(2, 9),
      jobId,
      startedAt: startTime.toISOString(),
      completedAt: endTime.toISOString(),
      status: success ? SyncStatus.SUCCESS : SyncStatus.FAILED,
      message: success ? `Synced ${branchesSynced} branches, ${tagsSynced} tags, ${commitsPushed} commits` : logs[logs.length - 1].message,
      stats: success ? {
        branchesSynced,
        tagsSynced,
        commitsPushed,
        filesChanged,
        bytesTransferred: Math.floor(Math.random() * 5000000) + 100000
      } : undefined,
      logs
    };
  }

  private applyEnvOverrides() {
    // Check for Docker injected Env Vars for Admin
    const env = (window as any).env;
    if (env && env.ADMIN_USERNAME) {
        const adminIndex = this.users.findIndex(u => u.id === '1');
        if (adminIndex !== -1) {
            this.users[adminIndex].username = env.ADMIN_USERNAME;
        }
    }
    if (env && env.ADMIN_PASSWORD) {
        this.userPasswords['1'] = env.ADMIN_PASSWORD;
    }
  }

  private load() {
    const sUsers = localStorage.getItem('gs_users');
    const sPass = localStorage.getItem('gs_user_passwords');
    const sCreds = localStorage.getItem('gs_creds');
    const sJobs = localStorage.getItem('gs_jobs');
    const sJobRuns = localStorage.getItem('gs_job_runs');
    const sSettings = localStorage.getItem('gs_settings');

    this.users = sUsers ? JSON.parse(sUsers) : [...INITIAL_USERS];
    this.userPasswords = sPass ? JSON.parse(sPass) : {...INITIAL_PASSWORDS};
    this.credentials = sCreds ? JSON.parse(sCreds) : INITIAL_CREDS;
    this.jobs = sJobs ? JSON.parse(sJobs) : INITIAL_JOBS;
    this.jobRuns = sJobRuns ? JSON.parse(sJobRuns) : [];
    this.settings = sSettings ? JSON.parse(sSettings) : this.settings;
  }

  private save() {
    localStorage.setItem('gs_users', JSON.stringify(this.users));
    localStorage.setItem('gs_user_passwords', JSON.stringify(this.userPasswords));
    localStorage.setItem('gs_creds', JSON.stringify(this.credentials));
    localStorage.setItem('gs_jobs', JSON.stringify(this.jobs));
    localStorage.setItem('gs_job_runs', JSON.stringify(this.jobRuns));
    localStorage.setItem('gs_settings', JSON.stringify(this.settings));
  }

  // Auth
  async login(username: string, password?: string): Promise<User> {
    await delay(600);
    const user = this.users.find(u => u.username === username);
    
    if (!user) {
        throw new Error('Invalid username or password.');
    }

    // Check password if exists in our map
    const storedPass = this.userPasswords[user.id];
    if (storedPass && storedPass !== password) {
        throw new Error('Invalid username or password.');
    }

    this.currentUser = user;
    sessionStorage.setItem('gs_current_user', JSON.stringify(user));
    return user;
  }

  getCurrentUser() {
    if (!this.currentUser) {
      const stored = sessionStorage.getItem('gs_current_user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    }
    return this.currentUser;
  }

  logout() {
    this.currentUser = null;
    sessionStorage.removeItem('gs_current_user');
  }

  // Users
  async getUsers() { await delay(400); return [...this.users]; }
  
  async createUser(u: Omit<User, 'id' | 'createdAt'>, password?: string) {
    await delay(400);
    const newUser: User = { ...u, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    
    this.users.push(newUser);
    if (password) {
        this.userPasswords[newUser.id] = password;
    } else {
        // Default password if none provided
        this.userPasswords[newUser.id] = 'password'; 
    }
    
    this.save();
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>, password?: string) {
    await delay(400);
    this.users = this.users.map(u => u.id === id ? { ...u, ...updates } : u);
    
    if (password && password.trim() !== '') {
        this.userPasswords[id] = password;
    }
    
    this.save();
  }

  async deleteUser(id: string) {
    await delay(400);
    this.users = this.users.filter(u => u.id !== id);
    delete this.userPasswords[id];
    this.save();
  }

  // Credentials
  async getCredentials() { await delay(300); return [...this.credentials]; }
  async createCredential(c: Omit<Credential, 'id' | 'createdAt'>) {
    await delay(500);
    const newCred: Credential = { ...c, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    this.credentials.push(newCred);
    this.save();
    return newCred;
  }
  async updateCredential(id: string, updates: Partial<Credential>) {
    await delay(400);
    this.credentials = this.credentials.map(c => c.id === id ? { ...c, ...updates } : c);
    this.save();
  }
  async deleteCredential(id: string) {
    await delay(300);
    this.credentials = this.credentials.filter(c => c.id !== id);
    this.save();
  }

  // Jobs
  async getJobs() { await delay(300); return [...this.jobs]; }
  async createJob(j: Omit<SyncJob, 'id' | 'lastRunStatus'>) {
    await delay(500);
    const newJob: SyncJob = {
      ...j,
      id: Math.random().toString(36).substr(2, 9),
      lastRunStatus: SyncStatus.IDLE,
      enabled: true
    };
    this.jobs.push(newJob);
    this.save();
    return newJob;
  }
  async updateJob(id: string, updates: Partial<SyncJob>) {
    await delay(400);
    this.jobs = this.jobs.map(j => j.id === id ? { ...j, ...updates } : j);
    this.save();
  }
  async deleteJob(id: string) {
    await delay(400);
    this.jobs = this.jobs.filter(j => j.id !== id);
    // Also delete job history
    this.jobRuns = this.jobRuns.filter(r => r.jobId !== id);
    this.save();
  }
  
  async getJobRuns(jobId: string) {
    await delay(200);
    return this.jobRuns.filter(r => r.jobId === jobId).sort((a, b) => 
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }
  
  async getJobRun(runId: string) {
    await delay(100);
    return this.jobRuns.find(r => r.id === runId) || null;
  }

  // Get currently running job (if any)
  getActiveRun(jobId: string): JobRun | null {
    return this.jobRuns.find(r => r.jobId === jobId && r.status === SyncStatus.SYNCING) || null;
  }

  async triggerJob(id: string): Promise<string> {
    await delay(200);
    const startTime = new Date();
    
    // Create a new run entry
    const runId = Math.random().toString(36).substr(2, 9);
    const newRun: JobRun = {
      id: runId,
      jobId: id,
      startedAt: startTime.toISOString(),
      status: SyncStatus.SYNCING,
      message: 'Sync started manually...',
      logs: [
        { timestamp: startTime.toISOString(), level: 'INFO', message: 'Sync job triggered manually' }
      ]
    };
    this.jobRuns.unshift(newRun);
    
    this.updateJob(id, { lastRunStatus: SyncStatus.SYNCING, lastRunMessage: 'Sync started manually...' });
    this.save();
    window.dispatchEvent(new Event('store-updated'));
    
    // Simulate job run with progressive log updates
    const success = Math.random() > 0.3;
    const logMessages = [
      { delay: 500, level: 'INFO', message: 'Connecting to source repository...' },
      { delay: 1200, level: 'INFO', message: 'Fetching remote refs...' },
      { delay: 800, level: 'DEBUG', message: `Found ${Math.floor(Math.random() * 5) + 1} branches matching filter` },
      { delay: 500, level: 'INFO', message: 'Connecting to destination repository...' },
      { delay: 1000, level: 'INFO', message: 'Analyzing changes...' },
    ];
    
    if (success) {
      const commits = Math.floor(Math.random() * 20) + 1;
      const files = Math.floor(Math.random() * 50) + commits;
      logMessages.push(
        { delay: 1500, level: 'INFO', message: `Pushing ${commits} commits...` },
        { delay: 2000, level: 'INFO', message: `Transferred ${files} files (${(Math.random() * 5 + 0.5).toFixed(2)} MB)` },
        { delay: 500, level: 'INFO', message: 'Sync completed successfully' }
      );
    } else {
      const errors = [
        'Connection timed out while pushing to destination',
        'Authentication failed: Invalid credentials',
        'Remote rejected push: pre-receive hook declined',
        'Network error: Unable to resolve host',
        'Permission denied: Insufficient access rights'
      ];
      logMessages.push(
        { delay: 1500, level: 'WARN', message: 'Push operation taking longer than expected...' },
        { delay: 2000, level: 'ERROR', message: errors[Math.floor(Math.random() * errors.length)] }
      );
    }
    
    // Process logs progressively
    let totalDelay = 0;
    logMessages.forEach((logMsg, index) => {
      totalDelay += logMsg.delay;
      setTimeout(() => {
        const run = this.jobRuns.find(r => r.id === runId);
        if (run) {
          run.logs = run.logs || [];
          run.logs.push({
            timestamp: new Date().toISOString(),
            level: logMsg.level as 'INFO' | 'DEBUG' | 'WARN' | 'ERROR',
            message: logMsg.message
          });
          run.message = logMsg.message;
          this.save();
          window.dispatchEvent(new CustomEvent('job-log-updated', { detail: { runId, jobId: id } }));
          
          // Final message - complete the job
          if (index === logMessages.length - 1) {
            const endTime = new Date();
            const durationSecs = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
            
            run.status = success ? SyncStatus.SUCCESS : SyncStatus.FAILED;
            run.completedAt = endTime.toISOString();
            
            if (success) {
              const branchesSynced = Math.floor(Math.random() * 5) + 1;
              const tagsSynced = Math.floor(Math.random() * 3);
              const commitsPushed = Math.floor(Math.random() * 20) + 1;
              const filesChanged = Math.floor(Math.random() * 50) + commitsPushed;
              run.stats = {
                branchesSynced,
                tagsSynced,
                commitsPushed,
                filesChanged,
                bytesTransferred: Math.floor(Math.random() * 5000000) + 100000
              };
              run.message = `Synced ${branchesSynced} branches, ${tagsSynced} tags, ${commitsPushed} commits in ${durationSecs}s`;
            }
            
            this.updateJob(id, {
              lastRunStatus: run.status,
              lastRunAt: endTime.toISOString(),
              lastRunMessage: run.message
            });
            this.save();
            window.dispatchEvent(new Event('store-updated'));
          }
        }
      }, totalDelay);
    });
    
    return runId;
  }

  // Settings
  async getSettings() { return this.settings; }
  async updateSettings(s: AppSettings) { this.settings = s; this.save(); }
}

export const mockStore = new MockStore();
import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, Input, Select, StatusBadge } from '../components/ui';
import { apiService, mapJobFromApi, mapJobRunFromApi, mapCredentialFromApi } from '../services/api';
import { SyncJob, Credential, UserRole, User, JobRun, SyncStatus } from '../types';
import { Plus, Play, MoreHorizontal, Trash2, Edit2, RefreshCw, History, X, GitBranch, Tag, GitCommit, FileText, Clock, ChevronDown, ChevronRight, Power, Terminal } from 'lucide-react';

export const Jobs = () => {
  const userStr = sessionStorage.getItem('gs_current_user');
  const user: User | null = userStr ? JSON.parse(userStr) : null;
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<SyncJob | null>(null);
  const [formData, setFormData] = useState<Partial<SyncJob>>({});
  
  // History modal state
  const [historyJob, setHistoryJob] = useState<SyncJob | null>(null);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Live log view state
  const [liveLogJobId, setLiveLogJobId] = useState<string | null>(null);
  const [liveRun, setLiveRun] = useState<JobRun | null>(null);
  const [liveWs, setLiveWs] = useState<WebSocket | null>(null);
  const liveLogRef = useRef<HTMLDivElement>(null);
  
  // Permissions
  const canEdit = user?.role !== UserRole.VIEWER;

  const fetchData = async () => {
    try {
      const [jobsData, credsData] = await Promise.all([
        apiService.getJobs(),
        apiService.getCredentials()
      ]);
      setJobs(jobsData.map(mapJobFromApi));
      setCreds(credsData.map(mapCredentialFromApi));
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds while syncing
    const interval = setInterval(() => {
      if (jobs.some(j => j.lastRunStatus === SyncStatus.SYNCING)) {
        fetchData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (liveWs) {
        liveWs.close();
      }
    };
  }, [liveWs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    try {
      if (editingJob) {
        await apiService.updateJob(editingJob.id, formData);
      } else {
        await apiService.createJob(formData as any);
      }
      setIsModalOpen(false);
      setEditingJob(null);
      setFormData({});
      fetchData();
    } catch (err) {
      console.error('Failed to save job:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit || !window.confirm('Are you sure you want to delete this job?')) return;
    try {
      await apiService.deleteJob(id);
      fetchData();
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  const handleToggleEnabled = async (job: SyncJob) => {
    if (!canEdit) return;
    try {
      await apiService.updateJob(job.id, { enabled: !job.enabled });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle job:', err);
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      const response = await apiService.triggerJob(id);
      
      // Open live log view with WebSocket
      setLiveLogJobId(id);
      setLiveRun({
        id: response.run_id,
        jobId: id,
        startedAt: new Date().toISOString(),
        status: SyncStatus.SYNCING,
        message: 'Starting sync...',
        logs: []
      });
      
      // Connect WebSocket for live logs
      const ws = apiService.createLogsWebSocket(id);
      setLiveWs(ws);
      
      ws.onmessage = (event) => {
        const logEntry = JSON.parse(event.data);
        setLiveRun(prev => {
          if (!prev) return prev;
          const newLogs = [...(prev.logs || []), logEntry];
          const isComplete = logEntry.level === 'COMPLETE' || logEntry.level === 'FAILED';
          return {
            ...prev,
            logs: newLogs,
            message: logEntry.message,
            status: isComplete ? (logEntry.level === 'COMPLETE' ? SyncStatus.SUCCESS : SyncStatus.FAILED) : prev.status,
            completedAt: isComplete ? new Date().toISOString() : prev.completedAt
          };
        });
        // Auto-scroll
        setTimeout(() => {
          if (liveLogRef.current) {
            liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
          }
        }, 50);
      };
      
      ws.onclose = () => {
        fetchData();
      };
      
    } catch (err) {
      console.error('Failed to trigger job:', err);
    }
  };

  const closeLiveLog = () => {
    if (liveWs) {
      liveWs.close();
      setLiveWs(null);
    }
    setLiveLogJobId(null);
    setLiveRun(null);
    fetchData();
  };

  const openModal = (job?: SyncJob) => {
    if (job) {
      setEditingJob(job);
      setFormData(job);
    } else {
      setEditingJob(null);
      setFormData({
        name: '',
        sourceUrl: '',
        destinationUrl: '',
        cronSchedule: '0 * * * *',
        branchFilter: '.*',
        tagFilter: '',
        enabled: true
      });
    }
    setIsModalOpen(true);
  };

  const openHistory = async (job: SyncJob) => {
    setHistoryJob(job);
    setLoadingHistory(true);
    setExpandedRun(null);
    try {
      const runs = await apiService.getJobRuns(job.id);
      setJobRuns(runs.map(mapJobRunFromApi));
    } catch (e) {
      console.error('Failed to load job history', e);
    }
    setLoadingHistory(false);
  };

  const closeHistory = () => {
    setHistoryJob(null);
    setJobRuns([]);
    setExpandedRun(null);
  };

  const formatDuration = (start: string, end?: string) => {
    if (!end) return 'Running...';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ${secs % 60}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (!user) return null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Synchronization Jobs</h2>
        <div className="flex space-x-2">
            <Button variant="secondary" onClick={() => fetchData()}><RefreshCw size={16} /></Button>
            {canEdit && (
                <Button onClick={() => openModal()}>
                <Plus size={18} className="mr-2" /> New Sync Job
                </Button>
            )}
        </div>
      </div>

      <div className="grid gap-4">
        {jobs.map(job => (
          <Card key={job.id} className={`p-6 transition-all hover:border-slate-700 ${!job.enabled ? 'bg-slate-900/50 opacity-60' : ''}`}>
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className={`font-semibold text-lg ${job.enabled ? 'text-white' : 'text-slate-400'}`}>{job.name}</h3>
                  <StatusBadge status={job.lastRunStatus} />
                  {!job.enabled && <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">Disabled</span>}
                </div>
                
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm ${job.enabled ? 'text-slate-400' : 'text-slate-500'}`}>
                  <div className="flex flex-col">
                    <span className={`text-xs font-mono mb-1 ${job.enabled ? 'text-indigo-400' : 'text-indigo-400/50'}`}>SOURCE</span>
                    <span className="truncate">{job.sourceUrl}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-xs font-mono mb-1 ${job.enabled ? 'text-emerald-400' : 'text-emerald-400/50'}`}>DESTINATION</span>
                    <span className="truncate">{job.destinationUrl}</span>
                  </div>
                </div>
                
                <div className="mt-4 flex flex-wrap gap-2">
                    {job.branchFilter && (
                        <span className={`px-2 py-1 rounded text-xs font-mono ${job.enabled ? 'bg-slate-800 text-slate-300' : 'bg-slate-800/50 text-slate-500'}`}>
                           Branch: {job.branchFilter}
                        </span>
                    )}
                    {job.tagFilter && (
                        <span className={`px-2 py-1 rounded text-xs font-mono ${job.enabled ? 'bg-slate-800 text-slate-300' : 'bg-slate-800/50 text-slate-500'}`}>
                           Tag: {job.tagFilter}
                        </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs font-mono ${job.enabled ? 'bg-slate-800 text-slate-300' : 'bg-slate-800/50 text-slate-500'}`}>
                        Cron: {job.cronSchedule}
                    </span>
                </div>
                
                {job.lastRunMessage && (
                    <div className="mt-3 text-xs text-slate-500 italic">
                        Last log: {job.lastRunMessage}
                    </div>
                )}
              </div>

              <div className="flex items-center space-x-2 self-start md:self-center">
                 {/* Enable/Disable Toggle */}
                 {canEdit && (
                   <button
                     onClick={() => handleToggleEnabled(job)}
                     className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                       job.enabled ? 'bg-emerald-600' : 'bg-slate-700'
                     }`}
                     title={job.enabled ? 'Disable job' : 'Enable job'}
                   >
                     <span
                       className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                         job.enabled ? 'translate-x-6' : 'translate-x-1'
                       }`}
                     />
                   </button>
                 )}
                 <Button variant="secondary" onClick={() => openHistory(job)} title="View history">
                    <History size={16} />
                 </Button>
                 <Button variant="secondary" onClick={() => handleTrigger(job.id)} disabled={job.lastRunStatus === 'SYNCING' || !job.enabled} title={!job.enabled ? 'Job disabled' : job.lastRunStatus === 'SYNCING' ? 'Sync in progress' : 'Run sync'}>
                    <Play size={16} className={job.lastRunStatus === 'SYNCING' || !job.enabled ? 'text-slate-500' : 'text-emerald-400'} />
                 </Button>
                 {canEdit && (
                     <>
                        <Button variant="secondary" onClick={() => openModal(job)} title="Edit job">
                            <Edit2 size={16} />
                        </Button>
                        <Button variant="danger" onClick={() => handleDelete(job.id)} title="Delete job">
                            <Trash2 size={16} />
                        </Button>
                     </>
                 )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{editingJob ? 'Edit Sync Job' : 'Create New Sync Job'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><Plus className="rotate-45" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <Input 
                label="Job Name" 
                value={formData.name || ''} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                required 
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Input 
                        label="Source Repo URL" 
                        value={formData.sourceUrl || ''} 
                        onChange={e => setFormData({...formData, sourceUrl: e.target.value})}
                        placeholder="https://github.com/org/repo.git"
                        required 
                    />
                    <Select 
                        label="Source Credentials"
                        value={formData.sourceCredentialId || ''}
                        onChange={e => setFormData({...formData, sourceCredentialId: e.target.value})}
                        options={[{value: '', label: 'None (Public)'}, ...creds.map(c => ({value: c.id, label: c.name}))]}
                    />
                </div>
                <div>
                    <Input 
                        label="Destination Repo URL" 
                        value={formData.destinationUrl || ''} 
                        onChange={e => setFormData({...formData, destinationUrl: e.target.value})}
                        placeholder="git@gitlab.com:org/repo.git"
                        required 
                    />
                    <Select 
                        label="Destination Credentials"
                        value={formData.destinationCredentialId || ''}
                        onChange={e => setFormData({...formData, destinationCredentialId: e.target.value})}
                        options={[{value: '', label: 'None'}, ...creds.map(c => ({value: c.id, label: c.name}))]}
                    />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <Input 
                    label="Branch Filter (Regex)" 
                    value={formData.branchFilter || ''} 
                    onChange={e => setFormData({...formData, branchFilter: e.target.value})}
                    placeholder="main|master|prod" 
                 />
                 <Input 
                    label="Tag Filter (Regex)" 
                    value={formData.tagFilter || ''} 
                    onChange={e => setFormData({...formData, tagFilter: e.target.value})}
                    placeholder="v.*" 
                 />
                 <Input 
                    label="Cron Schedule" 
                    value={formData.cronSchedule || ''} 
                    onChange={e => setFormData({...formData, cronSchedule: e.target.value})}
                    placeholder="0 * * * *" 
                 />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                 <input 
                    type="checkbox" 
                    id="enabled"
                    checked={formData.enabled}
                    onChange={e => setFormData({...formData, enabled: e.target.checked})}
                    className="rounded bg-slate-800 border-slate-600 text-indigo-600 focus:ring-indigo-500"
                 />
                 <label htmlFor="enabled" className="text-sm text-slate-300">Enable automated syncing based on schedule</label>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-slate-800 mt-6">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit">{editingJob ? 'Update Job' : 'Create Job'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-bold text-white">Run History</h3>
                <p className="text-sm text-slate-400 mt-1">{historyJob.name}</p>
              </div>
              <button onClick={closeHistory} className="text-slate-400 hover:text-white p-2">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="animate-spin text-indigo-400" size={24} />
                </div>
              ) : jobRuns.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No run history available for this job.
                </div>
              ) : (
                <div className="space-y-3">
                  {jobRuns.map(run => (
                    <div key={run.id} className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
                      {/* Run Header */}
                      <button
                        onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                        className="w-full p-4 flex items-center justify-between hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center space-x-4">
                          {expandedRun === run.id ? (
                            <ChevronDown size={16} className="text-slate-400" />
                          ) : (
                            <ChevronRight size={16} className="text-slate-400" />
                          )}
                          <StatusBadge status={run.status} />
                          <span className="text-sm text-slate-300">{formatDate(run.startedAt)}</span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-slate-400">
                          <span className="flex items-center space-x-1">
                            <Clock size={14} />
                            <span>{formatDuration(run.startedAt, run.completedAt)}</span>
                          </span>
                          {run.stats && (
                            <>
                              <span className="flex items-center space-x-1">
                                <GitBranch size={14} />
                                <span>{run.stats.branchesSynced}</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <Tag size={14} />
                                <span>{run.stats.tagsSynced}</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <GitCommit size={14} />
                                <span>{run.stats.commitsPushed}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                      
                      {/* Expanded Details */}
                      {expandedRun === run.id && (
                        <div className="border-t border-slate-700 p-4 space-y-4">
                          {/* Stats Summary */}
                          {run.stats && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div className="bg-slate-900 rounded-lg p-3 text-center">
                                <div className="flex items-center justify-center space-x-2 text-indigo-400 mb-1">
                                  <GitBranch size={16} />
                                  <span className="text-lg font-bold">{run.stats.branchesSynced}</span>
                                </div>
                                <div className="text-xs text-slate-500">Branches</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3 text-center">
                                <div className="flex items-center justify-center space-x-2 text-amber-400 mb-1">
                                  <Tag size={16} />
                                  <span className="text-lg font-bold">{run.stats.tagsSynced}</span>
                                </div>
                                <div className="text-xs text-slate-500">Tags</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3 text-center">
                                <div className="flex items-center justify-center space-x-2 text-emerald-400 mb-1">
                                  <GitCommit size={16} />
                                  <span className="text-lg font-bold">{run.stats.commitsPushed}</span>
                                </div>
                                <div className="text-xs text-slate-500">Commits</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3 text-center">
                                <div className="flex items-center justify-center space-x-2 text-blue-400 mb-1">
                                  <FileText size={16} />
                                  <span className="text-lg font-bold">{run.stats.filesChanged}</span>
                                </div>
                                <div className="text-xs text-slate-500">Files</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3 text-center">
                                <div className="text-lg font-bold text-purple-400 mb-1">
                                  {formatBytes(run.stats.bytesTransferred)}
                                </div>
                                <div className="text-xs text-slate-500">Transferred</div>
                              </div>
                            </div>
                          )}
                          
                          {/* Log Output */}
                          <div>
                            <h4 className="text-sm font-medium text-slate-300 mb-2">Execution Log</h4>
                            <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto">
                              {run.logs.map((log, idx) => (
                                <div key={idx} className="flex space-x-2 py-0.5">
                                  <span className="text-slate-600 shrink-0">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                  </span>
                                  <span className={`shrink-0 w-12 ${
                                    log.level === 'ERROR' ? 'text-red-400' :
                                    log.level === 'WARN' ? 'text-amber-400' :
                                    log.level === 'DEBUG' ? 'text-slate-500' :
                                    'text-slate-400'
                                  }`}>
                                    [{log.level}]
                                  </span>
                                  <span className={`${
                                    log.level === 'ERROR' ? 'text-red-300' :
                                    log.level === 'WARN' ? 'text-amber-300' :
                                    'text-slate-300'
                                  }`}>
                                    {log.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Log Modal */}
      {liveLogJobId && liveRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <Terminal className="text-emerald-400" size={20} />
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span>Live Sync Log</span>
                    {liveRun.status === SyncStatus.SYNCING && (
                      <RefreshCw className="animate-spin text-indigo-400" size={16} />
                    )}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {jobs.find(j => j.id === liveLogJobId)?.name || 'Unknown Job'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <StatusBadge status={liveRun.status} />
                <button onClick={closeLiveLog} className="text-slate-400 hover:text-white p-2">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div 
              ref={liveLogRef}
              className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-xs"
            >
              {liveRun.logs?.map((log, idx) => (
                <div key={idx} className="flex space-x-2 py-0.5">
                  <span className="text-slate-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 w-12 ${
                    log.level === 'ERROR' ? 'text-red-400' :
                    log.level === 'WARN' ? 'text-amber-400' :
                    log.level === 'DEBUG' ? 'text-slate-500' :
                    'text-slate-400'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className={`${
                    log.level === 'ERROR' ? 'text-red-300' :
                    log.level === 'WARN' ? 'text-amber-300' :
                    'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {liveRun.status === SyncStatus.SYNCING && (
                <div className="flex items-center space-x-2 py-1 text-slate-500">
                  <span className="animate-pulse">▋</span>
                </div>
              )}
            </div>
            
            {liveRun.status !== SyncStatus.SYNCING && (
              <div className={`p-4 border-t ${liveRun.status === SyncStatus.SUCCESS ? 'border-emerald-800 bg-emerald-900/20' : 'border-red-800 bg-red-900/20'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${liveRun.status === SyncStatus.SUCCESS ? 'text-emerald-400' : 'text-red-400'}`}>
                    {liveRun.status === SyncStatus.SUCCESS ? '✓ Sync completed successfully' : '✗ Sync failed'}
                  </span>
                  <span className="text-sm text-slate-400">
                    Duration: {formatDuration(liveRun.startedAt, liveRun.completedAt)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
import React, { useEffect, useState } from 'react';
import { Card, StatusBadge } from '../components/ui';
import { apiService, mapJobFromApi, mapJobRunFromApi } from '../services/api';
import { SyncJob, SyncStatus, JobRun } from '../types';
import { 
  ArrowRight, 
  GitCommit, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  GitBranch,
  Tag,
  FileText,
  ChevronDown,
  ChevronRight,
  X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const Dashboard = () => {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [recentRuns, setRecentRuns] = useState<(JobRun & { jobName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<(JobRun & { jobName: string }) | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const jobsData = await apiService.getJobs();
        const mappedJobs = jobsData.map(mapJobFromApi);
        setJobs(mappedJobs);
        
        // Fetch recent runs from all jobs
        const allRuns: (JobRun & { jobName: string })[] = [];
        for (const job of mappedJobs) {
          try {
            const runs = await apiService.getJobRuns(job.id);
            runs.forEach((run: any) => {
              const mappedRun = mapJobRunFromApi(run);
              allRuns.push({ ...mappedRun, jobName: job.name });
            });
          } catch (e) {
            // Job may have no runs yet
          }
        }
        // Sort by date and take most recent 10
        allRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        setRecentRuns(allRuns.slice(0, 10));
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setLoading(false);
      }
    };
    fetchData();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Stats based on recent runs (not just last job status)
  const runStats = {
    total: recentRuns.length,
    success: recentRuns.filter(r => r.status === SyncStatus.SUCCESS).length,
    failed: recentRuns.filter(r => r.status === SyncStatus.FAILED).length,
    syncing: recentRuns.filter(r => r.status === SyncStatus.SYNCING).length,
  };

  // Stats based on jobs (for job count display)
  const jobStats = {
    total: jobs.length,
    success: jobs.filter(j => j.lastRunStatus === SyncStatus.SUCCESS).length,
    failed: jobs.filter(j => j.lastRunStatus === SyncStatus.FAILED).length,
    syncing: jobs.filter(j => j.lastRunStatus === SyncStatus.SYNCING).length,
  };

  const data = [
    { name: 'Success', value: runStats.success, color: '#10b981' },
    { name: 'Failed', value: runStats.failed, color: '#ef4444' },
    { name: 'Syncing', value: runStats.syncing, color: '#3b82f6' },
    { name: 'Pending', value: runStats.total - (runStats.success + runStats.failed + runStats.syncing), color: '#475569' },
  ];

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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) return <div className="text-slate-400 flex items-center justify-center h-64">Loading dashboard data...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4 border-l-4 border-l-indigo-500">
          <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-400">
            <GitCommit size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Total Sync Jobs</p>
            <p className="text-2xl font-bold text-white">{jobStats.total}</p>
          </div>
        </Card>
        
        <Card className="p-4 flex items-center space-x-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Healthy</p>
            <p className="text-2xl font-bold text-white">{jobStats.success}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4 border-l-4 border-l-red-500">
          <div className="p-3 bg-red-500/10 rounded-full text-red-400">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Failing</p>
            <p className="text-2xl font-bold text-white">{jobStats.failed}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4 border-l-4 border-l-blue-500">
          <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Active Syncs</p>
            <p className="text-2xl font-bold text-white">{jobStats.syncing}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Sync Activity</h2>
          <div className="space-y-3">
            {recentRuns.map(run => (
              <button
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className="w-full flex items-center justify-between p-4 bg-slate-950/50 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 transition-all text-left"
              >
                <div className="flex items-center space-x-4">
                   <StatusBadge status={run.status} />
                   <div>
                     <h3 className="font-medium text-white">{run.jobName}</h3>
                     <p className="text-xs text-slate-500 mt-1 truncate max-w-[300px]">
                       {run.message}
                     </p>
                   </div>
                </div>
                <div className="flex items-center space-x-4 text-sm text-slate-400">
                    {run.stats && (
                      <div className="hidden md:flex items-center space-x-3 text-xs">
                        <span className="flex items-center space-x-1">
                          <GitBranch size={12} className="text-indigo-400" />
                          <span>{run.stats.branchesSynced}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Tag size={12} className="text-amber-400" />
                          <span>{run.stats.tagsSynced}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <GitCommit size={12} className="text-emerald-400" />
                          <span>{run.stats.commitsPushed}</span>
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-slate-500">{formatDate(run.startedAt)}</span>
                      <span className="text-xs text-slate-600">{formatDuration(run.startedAt, run.completedAt)}</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600" />
                </div>
              </button>
            ))}
            {recentRuns.length === 0 && <p className="text-slate-500 text-center py-8">No recent sync activity.</p>}
          </div>
        </Card>

        {/* Chart */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Runs Overview</h2>
          <p className="text-sm text-slate-500 mb-4">Based on last {recentRuns.length} sync runs</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Run Detail Modal */}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center space-x-3">
                  <StatusBadge status={selectedRun.status} />
                  <h3 className="text-xl font-bold text-white">{selectedRun.jobName}</h3>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  {new Date(selectedRun.startedAt).toLocaleString()} • Duration: {formatDuration(selectedRun.startedAt, selectedRun.completedAt)}
                </p>
              </div>
              <button onClick={() => setSelectedRun(null)} className="text-slate-400 hover:text-white p-2">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Stats Summary */}
              {selectedRun.stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-2 text-indigo-400 mb-1">
                      <GitBranch size={16} />
                      <span className="text-lg font-bold">{selectedRun.stats.branchesSynced}</span>
                    </div>
                    <div className="text-xs text-slate-500">Branches</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-2 text-amber-400 mb-1">
                      <Tag size={16} />
                      <span className="text-lg font-bold">{selectedRun.stats.tagsSynced}</span>
                    </div>
                    <div className="text-xs text-slate-500">Tags</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-2 text-emerald-400 mb-1">
                      <GitCommit size={16} />
                      <span className="text-lg font-bold">{selectedRun.stats.commitsPushed}</span>
                    </div>
                    <div className="text-xs text-slate-500">Commits</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center space-x-2 text-blue-400 mb-1">
                      <FileText size={16} />
                      <span className="text-lg font-bold">{selectedRun.stats.filesChanged}</span>
                    </div>
                    <div className="text-xs text-slate-500">Files</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-purple-400 mb-1">
                      {formatBytes(selectedRun.stats.bytesTransferred)}
                    </div>
                    <div className="text-xs text-slate-500">Transferred</div>
                  </div>
                </div>
              )}
              
              {/* Log Output */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-2">Execution Log</h4>
                <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto">
                  {selectedRun.logs.map((log, idx) => (
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
          </div>
        </div>
      )}
    </div>
  );
};

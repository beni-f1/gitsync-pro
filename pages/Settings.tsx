import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '../components/ui';
import { Save, FlaskConical, AlertTriangle } from 'lucide-react';
import { apiService, mapSettingsFromApi } from '../services/api';
import { UserRole, AppSettings } from '../types';

export const Settings = () => {
  const userStr = sessionStorage.getItem('gs_current_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isAdmin = user?.role === UserRole.ADMIN;
  
  const [settings, setSettings] = useState<AppSettings>({
    gitTimeout: 300,
    maxRetries: 3,
    logRetentionDays: 14,
    demoMode: false
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load current settings from API
    apiService.getSettings()
      .then(data => {
        setSettings(mapSettingsFromApi(data));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load settings:', err);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    try {
      await apiService.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const toggleDemoMode = async () => {
    const newSettings = { ...settings, demoMode: !settings.demoMode };
    setSettings(newSettings);
    try {
      await apiService.updateSettings(newSettings);
      // Reload to apply changes
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      console.error('Failed to toggle demo mode:', err);
      setSettings(settings); // Revert on error
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-white mb-6">System Settings</h2>
      
      {/* Demo Mode Banner */}
      {settings.demoMode && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start space-x-3">
          <FlaskConical className="text-amber-400 mt-0.5" size={20} />
          <div>
            <h4 className="text-amber-400 font-medium">Demo Mode Active</h4>
            <p className="text-sm text-amber-300/80 mt-1">
              The application is using simulated data. Git sync operations are not real.
              Disable demo mode to connect to the real backend API.
            </p>
          </div>
        </div>
      )}
      
      <Card className="p-6 space-y-6">
        <div>
            <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">Git Engine Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                  label="Git Operation Timeout (seconds)" 
                  type="number"
                  value={settings.gitTimeout} 
                  onChange={e => setSettings({...settings, gitTimeout: parseInt(e.target.value) || 300})}
                />
                <Input 
                  label="Max Retries" 
                  type="number"
                  value={settings.maxRetries} 
                  onChange={e => setSettings({...settings, maxRetries: parseInt(e.target.value) || 3})}
                />
            </div>
        </div>

        <div>
            <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">Logs & Retention</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                  label="Keep Logs For (Days)" 
                  type="number"
                  value={settings.logRetentionDays} 
                  onChange={e => setSettings({...settings, logRetentionDays: parseInt(e.target.value) || 14})}
                />
            </div>
        </div>

        {isAdmin && (
          <div>
              <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">Admin Settings</h3>
              
              <div className="space-y-4">
                {/* Demo Mode Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center space-x-3">
                    <FlaskConical className={settings.demoMode ? "text-amber-400" : "text-slate-500"} size={20} />
                    <div>
                      <div className="text-white font-medium">Demo Mode</div>
                      <div className="text-sm text-slate-400">Use simulated data instead of real git operations</div>
                    </div>
                  </div>
                  <button
                    onClick={toggleDemoMode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.demoMode ? 'bg-amber-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.demoMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {!settings.demoMode && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start space-x-3">
                    <AlertTriangle className="text-emerald-400 mt-0.5" size={18} />
                    <div className="text-sm text-emerald-300/80">
                      Real mode is active. Git operations will actually clone and push to repositories.
                      Make sure your credentials are configured correctly.
                    </div>
                  </div>
                )}
              </div>
          </div>
        )}

        <div className="pt-4 flex justify-between items-center">
            {saved && <span className="text-emerald-400 text-sm">✓ Settings saved</span>}
            <div className="ml-auto">
              <Button onClick={handleSave}>
                  <Save size={18} className="mr-2" /> Save Configuration
              </Button>
            </div>
        </div>
      </Card>
    </div>
  );
};

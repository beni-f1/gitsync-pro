import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Button, Input, Card } from '../components/ui';
import { GitGraph, ArrowRight } from 'lucide-react';

export const Login = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const success = await apiService.login(username, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Invalid username or password');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
       <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-4">
             <GitGraph className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">GitSync Pro</h1>
          <p className="text-slate-400 mt-2">Enterprise Repository Synchronization</p>
       </div>

       <Card className="w-full max-w-md p-8 bg-slate-900/50 backdrop-blur-xl border-slate-800">
          <form onSubmit={handleLogin} className="space-y-6">
            <Input 
                label="Username" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                placeholder="Enter your username"
            />
            
            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Password</label>
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" 
                />
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                    {error}
                </div>
            )}

            <Button type="submit" className="w-full py-3 text-base" disabled={loading}>
                {loading ? 'Authenticating...' : (
                    <span className="flex items-center justify-center">
                        Sign In <ArrowRight className="ml-2 w-4 h-4" />
                    </span>
                )}
            </Button>

            <div className="text-center text-xs text-slate-500 mt-4">
                Available users (default pass: 'password', admin pass: 'admin'):<br/> admin, dev_lead, auditor
            </div>
          </form>
       </Card>
    </div>
  );
};
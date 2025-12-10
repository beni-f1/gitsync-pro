import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { Credentials } from './pages/Credentials';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { apiService, mapUserFromApi } from './services/api';
import { User, UserRole } from './types';

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
     const checkAuth = async () => {
       if (!apiService.isLoggedIn()) {
         setUser(null);
         setLoading(false);
         return;
       }
       try {
         const userData = await apiService.getCurrentUser();
         if (userData) {
           setUser(mapUserFromApi(userData));
         } else {
           setUser(null);
         }
       } catch {
         setUser(null);
       }
       setLoading(false);
     };
     checkAuth();
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Layout user={user}>{children}</Layout>;
};

const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  // This relies on the parent RequireAuth already having validated the user
  // We check via sessionStorage as a quick check
  const userStr = sessionStorage.getItem('gs_current_user');
  const user = userStr ? JSON.parse(userStr) : null;
  if (!user || user.role !== UserRole.ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        
        <Route path="/dashboard" element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        } />
        
        <Route path="/jobs" element={
          <RequireAuth>
             <Jobs />
          </RequireAuth>
        } />
        
        <Route path="/credentials" element={
          <RequireAuth>
             <Credentials />
          </RequireAuth>
        } />
        
        <Route path="/users" element={
          <RequireAuth>
            <RequireAdmin>
                <Users />
            </RequireAdmin>
          </RequireAuth>
        } />

        <Route path="/settings" element={
          <RequireAuth>
            <RequireAdmin>
                <Settings />
            </RequireAdmin>
          </RequireAuth>
        } />
        
      </Routes>
    </HashRouter>
  );
};

export default App;
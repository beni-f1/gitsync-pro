import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  GitGraph, 
  Settings, 
  Users, 
  Key, 
  LogOut, 
  Menu, 
  X, 
  Activity, 
  Layers,
  GitBranch
} from 'lucide-react';
import { User, UserRole } from '../types';
import { mockStore } from '../services/mockStore';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
}

const NavItem = ({ to, icon: Icon, label, exact = false }: { to: string, icon: any, label: string, exact?: boolean }) => {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
          isActive 
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children, user }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    mockStore.logout();
    navigate('/');
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Dashboard';
      case '/jobs': return 'Sync Jobs';
      case '/credentials': return 'Credentials';
      case '/users': return 'User Management';
      case '/settings': return 'Settings';
      default: return 'GitSync Pro';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 p-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xl">
          <GitGraph />
          <span>GitSync Pro</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-300">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-screen flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 flex items-center space-x-3 text-indigo-400 font-bold text-2xl border-b border-slate-800/50">
          <GitGraph className="w-8 h-8" />
          <span>GitSync</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-2">Overview</div>
          <NavItem to="/dashboard" icon={Activity} label="Dashboard" />
          <NavItem to="/jobs" icon={Layers} label="Sync Jobs" />
          
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-6">Config</div>
          <NavItem to="/credentials" icon={Key} label="Credentials" />
          
          {user.role === UserRole.ADMIN && (
             <>
               <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-6">Admin</div>
               <NavItem to="/users" icon={Users} label="Users" />
               <NavItem to="/settings" icon={Settings} label="Settings" />
             </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {user.username.substring(0,2).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">{user.username}</span>
                <span className="text-xs text-slate-400 capitalize">{user.role.toLowerCase()}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 p-2 rounded-md text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
            <span className="text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen bg-slate-950">
        <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-100">{getPageTitle()}</h1>
            <div className="flex items-center space-x-4">
               {/* Optional Header Actions */}
               <div className="hidden md:flex items-center px-3 py-1 bg-slate-900 rounded-full border border-slate-800 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                  System Operational
               </div>
            </div>
        </header>
        <div className="p-6 pb-20 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

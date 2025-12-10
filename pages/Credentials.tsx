import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Select } from '../components/ui';
import { apiService, mapCredentialFromApi } from '../services/api';
import { Credential, CredentialType, UserRole, User } from '../types';
import { Plus, Trash2, Key, Lock, Shield, Pencil } from 'lucide-react';

export const Credentials = () => {
  const userStr = sessionStorage.getItem('gs_current_user');
  const user: User | null = userStr ? JSON.parse(userStr) : null;
  const [creds, setCreds] = useState<Credential[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Credential & { secret: string; password?: string; ssh_key?: string; token?: string }>>({});

  const canEdit = user?.role !== UserRole.VIEWER;

  const fetchData = async () => {
    try {
      const data = await apiService.getCredentials();
      setCreds(data.map(mapCredentialFromApi));
    } catch (err) {
      console.error('Failed to fetch credentials:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    
    try {
      const credData = {
        name: formData.name!,
        type: formData.type!,
        username: formData.username,
        password: formData.type === CredentialType.USERNAME_PASSWORD ? formData.secret : undefined,
        ssh_key: formData.type === CredentialType.SSH_KEY ? formData.secret : undefined,
        token: formData.type === CredentialType.PERSONAL_ACCESS_TOKEN ? formData.secret : undefined,
      };
      
      if (editingId) {
        await apiService.updateCredential(editingId, credData);
      } else {
        await apiService.createCredential(credData);
      }
      
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({});
      fetchData();
    } catch (err) {
      console.error('Failed to save credential:', err);
    }
  };

  const handleEdit = (cred: Credential) => {
    setEditingId(cred.id);
    setFormData({
      name: cred.name,
      type: cred.type,
      username: cred.username
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!canEdit || !window.confirm('Delete this credential? Jobs using it will fail.')) return;
    try {
      await apiService.deleteCredential(id);
      fetchData();
    } catch (err) {
      console.error('Failed to delete credential:', err);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ type: CredentialType.USERNAME_PASSWORD });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({});
  };

  const getIcon = (type: CredentialType) => {
    switch(type) {
        case CredentialType.SSH_KEY: return <Key className="text-amber-400" size={20} />;
        case CredentialType.PERSONAL_ACCESS_TOKEN: return <Shield className="text-emerald-400" size={20} />;
        default: return <Lock className="text-blue-400" size={20} />;
    }
  };

  if (!user) return null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-xl font-bold text-white">Credentials Store</h2>
            <p className="text-sm text-slate-400 mt-1">Manage access tokens and SSH keys for your repositories.</p>
        </div>
        {canEdit && (
            <Button onClick={openAddModal}>
            <Plus size={18} className="mr-2" /> Add Credential
            </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {creds.map(c => (
          <Card key={c.id} className="p-6 relative group overflow-hidden">
             <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-slate-800 rounded-lg">
                        {getIcon(c.type)}
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">{c.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{c.type.replace(/_/g, ' ')}</p>
                    </div>
                </div>
                {canEdit && (
                    <div className="flex items-center space-x-1">
                        <button 
                            onClick={() => handleEdit(c)}
                            className="text-slate-600 hover:text-indigo-400 transition-colors p-2"
                            title="Edit credential"
                        >
                            <Pencil size={16} />
                        </button>
                        <button 
                            onClick={() => handleDelete(c.id)}
                            className="text-slate-600 hover:text-red-400 transition-colors p-2"
                            title="Delete credential"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}
             </div>
             <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500 font-mono flex justify-between">
                <span>ID: {c.id}</span>
                <span>{c.username ? `User: ${c.username}` : 'No username'}</span>
             </div>
          </Card>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-xl font-bold text-white">{editingId ? 'Edit Credential' : 'Add Credential'}</h3>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <Input 
                label="Friendly Name" 
                value={formData.name || ''} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                required 
              />
              
              <Select 
                label="Credential Type"
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as CredentialType})}
                options={[
                    { value: CredentialType.USERNAME_PASSWORD, label: 'Username & Password' },
                    { value: CredentialType.PERSONAL_ACCESS_TOKEN, label: 'Personal Access Token' },
                    { value: CredentialType.SSH_KEY, label: 'SSH Private Key' }
                ]}
              />

              {formData.type !== CredentialType.PERSONAL_ACCESS_TOKEN && (
                   <Input 
                    label="Username / SSH User" 
                    value={formData.username || ''} 
                    onChange={e => setFormData({...formData, username: e.target.value})}
                  />
              )}

              <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    {formData.type === CredentialType.SSH_KEY ? 'Private Key' : 'Password / Token'}
                  </label>
                  <textarea 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                    placeholder={editingId ? "Leave empty to keep existing secret..." : "Enter secret value..."}
                    onChange={e => setFormData({...formData, secret: e.target.value})}
                    required={!editingId}
                  ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="ghost" onClick={closeModal}>Cancel</Button>
                <Button type="submit">{editingId ? 'Update' : 'Save'} Credential</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
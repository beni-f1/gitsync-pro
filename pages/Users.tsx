import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Select } from '../components/ui';
import { apiService, mapUserFromApi } from '../services/api';
import { User, UserRole } from '../types';
import { Trash2, UserPlus, ShieldAlert, Edit2 } from 'lucide-react';

export const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User> & { password?: string }>({});

  const fetchData = async () => {
    try {
      const data = await apiService.getUsers();
      setUsers(data.map(mapUserFromApi));
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = (user?: User) => {
    if (user) {
        setEditingUser(user);
        setFormData({ ...user, password: '' });
    } else {
        setEditingUser(null);
        setFormData({ role: UserRole.VIEWER, username: '', email: '', password: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const { password, ...userFields } = formData;

    try {
      if (editingUser) {
        const updateData: any = {
          email: userFields.email,
          role: userFields.role
        };
        if (password) {
          updateData.password = password;
        }
        await apiService.updateUser(editingUser.id, updateData);
      } else {
        await apiService.createUser({
          username: userFields.username!,
          email: userFields.email!,
          role: userFields.role!,
          password: password!
        });
      }
      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({});
      fetchData();
    } catch (err) {
      console.error('Failed to save user:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this user access?')) return;
    try {
      await apiService.deleteUser(id);
      fetchData();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-xl font-bold text-white">User Management</h2>
           <p className="text-sm text-slate-400">Control who can access the dashboard and manage sync jobs.</p>
        </div>
        <Button onClick={() => openModal()}>
          <UserPlus size={18} className="mr-2" /> Add User
        </Button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-950 text-slate-200 font-medium">
                <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-xs">
                                    {u.username.substring(0,2).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-slate-200 font-medium">{u.username}</p>
                                    <p className="text-xs text-slate-500">{u.email}</p>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium 
                                ${u.role === UserRole.ADMIN ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 
                                  u.role === UserRole.EDITOR ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                                  'bg-slate-700 text-slate-300'}`}>
                                {u.role === UserRole.ADMIN && <ShieldAlert size={10} className="mr-1"/>}
                                {u.role}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono">
                            {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end space-x-2">
                                <button onClick={() => openModal(u)} className="text-slate-500 hover:text-indigo-400 transition-colors">
                                    <Edit2 size={16} />
                                </button>
                                {u.username !== 'admin' && (
                                    <button onClick={() => handleDelete(u.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                           </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <UserPlus className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <Input 
                label="Username" 
                value={formData.username || ''} 
                onChange={e => setFormData({...formData, username: e.target.value})}
                required 
              />
              <Input 
                label="Email" 
                type="email"
                value={formData.email || ''} 
                onChange={e => setFormData({...formData, email: e.target.value})}
                required 
              />

              <Input 
                label="Password" 
                type="password"
                value={formData.password || ''} 
                onChange={e => setFormData({...formData, password: e.target.value})}
                placeholder={editingUser ? "Leave blank to keep unchanged" : "Set initial password"}
                required={!editingUser}
              />
              
              <Select 
                label="Role"
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                options={[
                    { value: UserRole.VIEWER, label: 'Viewer (Read Only)' },
                    { value: UserRole.EDITOR, label: 'Editor (Manage Jobs)' },
                    { value: UserRole.ADMIN, label: 'Admin (Full Access)' }
                ]}
              />

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800 mt-4">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit">{editingUser ? 'Update User' : 'Create User'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
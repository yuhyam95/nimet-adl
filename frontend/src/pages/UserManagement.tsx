import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Users, UserPlus, Trash2, Shield, User, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import styles from './UserManagement.module.css';

const UserManagement = () => {
    const [isCreating, setIsCreating] = React.useState(false);
    const [formData, setFormData] = React.useState({
        username: '',
        name: '',
        role: 'Data Viewer',
        password: ''
    });
    const [saving, setSaving] = React.useState(false);

    const { data: users = [], isLoading, isError, refetch } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const res = await axios.get('/api/users');
            return res.data.success ? res.data.data : [];
        }
    });

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await axios.post('/api/users', formData);
            if (res.data.success) {
                alert('User created successfully!');
                setIsCreating(false);
                setFormData({ username: '', name: '', role: 'Data Viewer', password: '' });
                refetch();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to create user');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async (userId: number, username: string) => {
        if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;

        try {
            const res = await axios.delete(`/api/users/${userId}`);
            if (res.data.success) {
                alert('User deleted successfully');
                refetch();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to delete user');
        }
    };

    const handleRoleUpdate = async (userId: number, newRole: string) => {
        try {
            const res = await axios.patch(`/api/users/${userId}/role`, { role: newRole });
            if (res.data.success) {
                refetch();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to update role');
        }
    };

    if (isLoading) return <div className={styles.loading}>Loading user data...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <Users className={styles.icon} size={32} />
                    <div>
                        <h1>User Management</h1>
                        <p>Manage system access and roles</p>
                    </div>
                </div>
                <button onClick={() => setIsCreating(true)} className={styles.createBtn}>
                    <UserPlus size={18} />
                    New User
                </button>
            </div>

            {isCreating && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h2>Create New User</h2>
                            <button onClick={() => setIsCreating(false)} className={styles.closeBtn}>&times;</button>
                        </div>
                        <form onSubmit={handleCreateUser} className={styles.form}>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>Username</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={formData.username}
                                        onChange={e => setFormData({...formData, username: e.target.value})}
                                        placeholder="e.g. jdoe"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Full Name</label>
                                    <input 
                                        type="text" 
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        placeholder="e.g. John Doe"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Role</label>
                                    <select 
                                        value={formData.role}
                                        onChange={e => setFormData({...formData, role: e.target.value})}
                                    >
                                        <option value="Admin">Admin</option>
                                        <option value="Data Manager">Data Manager</option>
                                        <option value="Data Viewer">Data Viewer</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={formData.password}
                                        onChange={e => setFormData({...formData, password: e.target.value})}
                                        placeholder="Enter secure password"
                                    />
                                </div>
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setIsCreating(false)} className={styles.cancelBtn}>Cancel</button>
                                <button type="submit" disabled={saving} className={styles.saveBtn}>
                                    {saving ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className={styles.userList}>
                <div className={styles.tableHeader}>
                    <div className={styles.col}>User</div>
                    <div className={styles.col}>Role</div>
                    <div className={styles.col}>Joined</div>
                    <div className={styles.col}>Actions</div>
                </div>
                {users.map((u: any) => (
                    <div key={u.id} className={styles.userRow}>
                        <div className={styles.col}>
                            <div className={styles.userInfo}>
                                <div className={styles.avatar}>
                                    {(u.name || u.username)[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className={styles.userName}>{u.name || 'Anonymous User'}</div>
                                    <div className={styles.userMeta}>@{u.username}</div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.col}>
                            <select 
                                className={`${styles.roleSelect} ${styles['role' + u.role.replace(' ', '')]}`}
                                value={u.role}
                                onChange={(e) => handleRoleUpdate(u.id, e.target.value)}
                            >
                                <option value="Admin">Admin</option>
                                <option value="Data Manager">Data Manager</option>
                                <option value="Data Viewer">Data Viewer</option>
                            </select>
                        </div>
                        <div className={styles.col}>
                            <div className={styles.dateInfo}>
                                <Clock size={14} />
                                {new Date(u.created_at).toLocaleDateString()}
                            </div>
                        </div>
                        <div className={styles.col}>
                            <button 
                                onClick={() => handleDeleteUser(u.id, u.username)} 
                                className={styles.deleteBtn}
                                title="Delete user"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default UserManagement;

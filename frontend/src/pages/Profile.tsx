import React from 'react';
import axios from 'axios';
import { User, Shield, Key, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './Profile.module.css';

const Profile = () => {
    const { user } = useAuth();
    const [passwordData, setPasswordData] = React.useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState<{type: 'success' | 'error', text: string} | null>(null);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        setSaving(true);
        try {
            const res = await axios.post('/api/auth/change-password', {
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            if (res.data.success) {
                setMessage({ type: 'success', text: 'Password changed successfully!' });
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to change password' });
        } finally {
            setSaving(false);
        }
    };

    if (!user) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <User className={styles.icon} size={32} />
                    <div>
                        <h1>User Profile</h1>
                        <p>Manage your account settings and security</p>
                    </div>
                </div>
            </div>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3>Account Information</h3>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.profileHeader}>
                            <div className={styles.avatarLarge}>
                                {(user.name || user.username)[0].toUpperCase()}
                            </div>
                            <div>
                                <h2 className={styles.fullName}>{user.name || 'Anonymous User'}</h2>
                                <div className={styles.username}>@{user.username}</div>
                            </div>
                        </div>

                        <div className={styles.infoList}>
                            <div className={styles.infoItem}>
                                <div className={styles.infoLabel}>Role</div>
                                <div className={styles.infoValue}>
                                    <span className={`${styles.roleBadge} ${styles['role' + user.role.replace(' ', '')]}`}>
                                        <Shield size={14} />
                                        {user.role}
                                    </span>
                                </div>
                            </div>
                            <div className={styles.infoItem}>
                                <div className={styles.infoLabel}>Account ID</div>
                                <div className={styles.infoValue}>#{user.id}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3>Security</h3>
                    </div>
                    <div className={styles.cardBody}>
                        <form onSubmit={handleChangePassword}>
                            <div className={styles.formSection}>
                                <div className={styles.sectionTitle}>
                                    <Key size={18} />
                                    Change Password
                                </div>
                                
                                <div className={styles.formGroup}>
                                    <label>Current Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={passwordData.currentPassword}
                                        onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>New Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={passwordData.newPassword}
                                        onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Confirm New Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={passwordData.confirmPassword}
                                        onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                    />
                                </div>

                                {message && (
                                    <div className={`${styles.alert} ${message.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
                                        {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                        {message.text}
                                    </div>
                                )}

                                <button type="submit" disabled={saving} className={styles.saveBtn}>
                                    <Save size={18} />
                                    {saving ? 'Updating...' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;

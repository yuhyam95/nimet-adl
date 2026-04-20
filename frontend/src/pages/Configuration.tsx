import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Settings, Server, Database, Shield, CheckCircle, AlertCircle, RefreshCw, Edit2, Save, X } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import MappingManager from '../components/MappingManager';
import styles from './Configuration.module.css';

interface ProviderConfig {
    name: string;
    baseUrl: string;
    email?: string;
    apiKey?: string;
    isActive: boolean;
}

const Configuration = () => {
    const [editing, setEditing] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState<any>({});
    const [systemData, setSystemData] = React.useState<any>({});
    const [saving, setSaving] = React.useState(false);
    const [syncDates, setSyncDates] = React.useState<any>({});
    const [syncing, setSyncing] = React.useState<string | null>(null);

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['config'],
        queryFn: async () => {
            const res = await axios.get('/api/config');
            if (res.data.success) {
                setSystemData({ exportPath: res.data.data.exportPath });
                return res.data.data;
            }
            return null;
        }
    });

    const providers = data?.providers || [];

    if (isError) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1>Configuration Error</h1>
                </div>
                <div className={styles.card} style={{ padding: '40px', textAlign: 'center' }}>
                    <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
                    <h3>Failed to load configuration</h3>
                    <p style={{ color: '#6b7280' }}>{(error as Error)?.message || 'There was an error connecting to the backend API.'}</p>
                    <button onClick={() => refetch()} className={styles.refreshBtn} style={{ margin: '24px auto 0' }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const handleEdit = (provider: any) => {
        setEditing(provider.name);
        const currentUsername = provider.username || provider.apiKey || '';
        setFormData({
            baseUrl: provider.baseUrl,
            email: provider.email || '',
            apiKey: currentUsername.includes('**') ? '' : currentUsername,
            password: '',
            apiSecret: ''
        });
    };

    const handleSave = async (providerName: string) => {
        setSaving(true);
        try {
            const res = await axios.post('/api/config', {
                provider: providerName,
                credentials: formData
            });
            if (res.data.success) {
                alert('Configuration updated successfully!');
                setEditing(null);
                refetch();
            }
        } catch (error) {
            console.error('Failed to save config:', error);
            alert('Failed to save configuration.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSystem = async () => {
        setSaving(true);
        try {
            const res = await axios.post('/api/config', {
                system: systemData
            });
            if (res.data.success) {
                alert('System settings updated successfully!');
                setEditing(null);
                refetch();
            }
        } catch (error) {
            console.error('Failed to save system settings:', error);
            alert('Failed to save system settings.');
        } finally {
            setSaving(false);
        }
    };

    const handleManualSync = async (providerName: string) => {
        const dates = syncDates[providerName];
        const startDate = dates?.start;
        const endDate = dates?.end;

        if (!startDate || !endDate) {
            alert('Please select both start and end dates.');
            return;
        }

        setSyncing(providerName);
        try {
            const res = await axios.post('/api/sync/provider', {
                provider: providerName,
                startDate,
                endDate
            });
            if (res.data.success) {
                alert(res.data.message);
            }
        } catch (error) {
            console.error('Manual sync failed:', error);
            alert('Failed to start manual synchronization.');
        } finally {
            setSyncing(null);
        }
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <Skeleton width={300} height={40} />
                </div>
                <div className={styles.grid}>
                    {[...Array(2)].map((_, i) => (
                        <div key={i} className={styles.card} style={{ height: 300, padding: 24 }}>
                            <Skeleton width="100%" height={100} />
                            <Skeleton width="80%" height={24} style={{ marginTop: 24 }} />
                            <Skeleton width="60%" height={24} style={{ marginTop: 12 }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <Settings className={styles.icon} size={32} />
                    <div>
                        <h1>Application Configuration</h1>
                        <p>Manage data providers and system settings</p>
                    </div>
                </div>
                <button onClick={() => refetch()} className={styles.refreshBtn}>
                    <RefreshCw size={18} />
                    Refresh
                </button>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Server size={20} />
                    <h2>Data Providers</h2>
                </div>
                
                {providers.length === 0 ? (
                    <div className={styles.card} style={{ padding: '40px', textAlign: 'center' }}>
                        <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
                        <h3>No Providers Found</h3>
                        <p style={{ color: '#6b7280' }}>The system could not retrieve the list of data providers. Please check if the backend server is running correctly.</p>
                        <button onClick={() => refetch()} className={styles.refreshBtn} style={{ margin: '24px auto 0' }}>
                            Try Again
                        </button>
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {providers.map((provider: any) => (
                            <div key={provider.name} className={`${styles.card} ${provider.isActive ? styles.active : styles.inactive}`}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.providerLogo}>
                                        <Database size={24} />
                                        <h3>{provider.name}</h3>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <div className={`${styles.statusBadge} ${provider.isActive ? styles.statusActive : styles.statusInactive}`}>
                                            {provider.isActive ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                            {provider.isActive ? 'Connected' : 'Not Configured'}
                                        </div>
                                        {editing !== provider.name && (
                                            <button onClick={() => handleEdit(provider)} className={styles.editBtn}>
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                <div className={styles.cardBody}>
                                    {editing === provider.name ? (
                                        <div className={styles.editForm}>
                                            <div className={styles.formGroup}>
                                                <label>Base URL</label>
                                                <input 
                                                    type="text" 
                                                    value={formData.baseUrl} 
                                                    onChange={e => setFormData({...formData, baseUrl: e.target.value})}
                                                />
                                            </div>
                                            {provider.name === 'CLIMDES' ? (
                                                <>
                                                    <div className={styles.formGroup}>
                                                        <label>Account Email</label>
                                                        <input 
                                                            type="email" 
                                                            value={formData.email} 
                                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>Password</label>
                                                        <input 
                                                            type="password" 
                                                            placeholder="Enter new password"
                                                            value={formData.password} 
                                                            onChange={e => setFormData({...formData, password: e.target.value})}
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className={styles.formGroup}>
                                                        <label>Username</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Enter TAHMO Username"
                                                            value={formData.apiKey} 
                                                            onChange={e => setFormData({...formData, apiKey: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>Password</label>
                                                        <input 
                                                            type="password" 
                                                            placeholder="Enter TAHMO Password"
                                                            value={formData.apiSecret} 
                                                            onChange={e => setFormData({...formData, apiSecret: e.target.value})}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            <div className={styles.formActions}>
                                                <button onClick={() => setEditing(null)} className={styles.cancelBtn}>
                                                    <X size={14} /> Cancel
                                                </button>
                                                <button onClick={() => handleSave(provider.name)} disabled={saving} className={styles.saveBtn}>
                                                    <Save size={14} /> {saving ? 'Saving...' : 'Save Settings'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={styles.infoRow}>
                                                <span className={styles.label}>Base URL</span>
                                                <span className={styles.value}>{provider.baseUrl || 'None'}</span>
                                            </div>
                                            <div className={styles.infoRow}>
                                                <span className={styles.label}>{provider.name === 'TAHMO' ? 'Username' : 'Account'}</span>
                                                <span className={styles.value}>{provider.email || provider.username || provider.apiKey}</span>
                                            </div>
                                        </>
                                    )}

                                    {provider.isActive && (
                                        <div className={styles.syncBox}>
                                            <h4>Manual Data Sync</h4>
                                            <div className={styles.syncDates}>
                                                <div className={styles.syncDateGroup}>
                                                    <label>From</label>
                                                    <input 
                                                        type="date" 
                                                        onChange={(e) => setSyncDates({
                                                            ...syncDates, 
                                                            [provider.name]: { ...syncDates[provider.name], start: e.target.value } 
                                                        })}
                                                    />
                                                </div>
                                                <div className={styles.syncDateGroup}>
                                                    <label>To</label>
                                                    <input 
                                                        type="date"
                                                        onChange={(e) => setSyncDates({
                                                            ...syncDates, 
                                                            [provider.name]: { ...syncDates[provider.name], end: e.target.value } 
                                                        })}
                                                    />
                                                </div>
                                            </div>
                                            <button 
                                                className={styles.syncBtn}
                                                onClick={() => handleManualSync(provider.name)}
                                                disabled={syncing === provider.name}
                                            >
                                                {syncing === provider.name ? <RefreshCw size={14} className={styles.spinning} /> : <RefreshCw size={14} />}
                                                {syncing === provider.name ? 'Syncing...' : 'Start Manual Sync'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className={styles.cardFooter}>
                                    <p className={styles.helperText}>
                                        {provider.isActive 
                                            ? `Currently syncing data from ${provider.name} API.` 
                                            : `Configuration missing for ${provider.name}. Update details to enable.`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Database size={20} />
                    <h2>Variable Mappings</h2>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                    Configure how external provider keys map to your internal database fields.
                </p>
                <MappingManager />
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Settings size={20} />
                    <h2>System Settings</h2>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.providerLogo}>
                            <Database size={24} />
                            <h3>Export Configuration</h3>
                        </div>
                        {editing !== 'system' && (
                            <button onClick={() => setEditing('system')} className={styles.editBtn}>
                                <Edit2 size={14} />
                            </button>
                        )}
                    </div>
                    <div className={styles.cardBody}>
                        {editing === 'system' ? (
                            <div className={styles.editForm}>
                                <div className={styles.formGroup}>
                                    <label>CSV Export Directory Path</label>
                                    <input 
                                        type="text" 
                                        placeholder="/absolute/path/to/exports"
                                        value={systemData.exportPath} 
                                        onChange={e => setSystemData({...systemData, exportPath: e.target.value})}
                                    />
                                    <p className={styles.helperText} style={{ marginTop: '8px' }}>
                                        Absolute path where CSV files will be dumped periodically. 
                                        If left empty, a default 'exports' folder in the project root will be used.
                                    </p>
                                </div>
                                <div className={styles.formActions}>
                                    <button onClick={() => setEditing(null)} className={styles.cancelBtn}>
                                        <X size={14} /> Cancel
                                    </button>
                                    <button onClick={handleSaveSystem} disabled={saving} className={styles.saveBtn}>
                                        <Save size={14} /> {saving ? 'Saving...' : 'Save Settings'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Export Directory</span>
                                <span className={styles.value}>{data?.exportPath || 'Default (project root/exports)'}</span>
                            </div>
                        )}
                    </div>
                    <div className={styles.cardFooter}>
                        <p className={styles.helperText}>
                            CSV files for all stations are automatically generated and updated every 15 minutes.
                        </p>
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Shield size={20} />
                    <h2>System Security</h2>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardBody}>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Database Connection</span>
                            <span className={styles.value} style={{ color: '#059669', fontWeight: 600 }}>Healthy</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>API Authentication</span>
                            <span className={styles.value}>JWT (Bearer Tokens)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Configuration;

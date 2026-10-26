import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Settings, Server, Database, Shield, CheckCircle, AlertCircle, RefreshCw, Edit2, Save, X } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import MappingManager from '../components/MappingManager';
import PulsoWebMetadataExplorer from '../components/PulsoWebMetadataExplorer';
import styles from './Configuration.module.css';



const Configuration = () => {
    const [editing, setEditing] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState<any>({});
    const [saving, setSaving] = React.useState(false);
    const [syncDates, setSyncDates] = React.useState<any>({});
    const [syncing, setSyncing] = React.useState<string | null>(null);
    const [testingProvider, setTestingProvider] = React.useState<string | null>(null);
    const [importingStations, setImportingStations] = React.useState<string | null>(null);

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['config'],
        queryFn: async () => {
            const res = await axios.get('/api/config');
            if (res.data.success) {
                return res.data.data;
            }
            return null;
        }
    });

    const providers = data?.providers || [];

    const { data: networkStations = [] } = useQuery({
        queryKey: ['stations', 'configuration-readiness'],
        queryFn: async () => {
            const response = await axios.get('/api/dataloggers');
            return response.data.success ? response.data.data : [];
        }
    });

    const networkReadiness = React.useMemo(() => {
        const total = networkStations.length;
        const withCoordinates = networkStations.filter((station: any) =>
            station.latitude != null && station.longitude != null &&
            Number.isFinite(Number(station.latitude)) && Number.isFinite(Number(station.longitude))
        ).length;
        const withWigos = networkStations.filter((station: any) => Boolean(station.wigos_id)).length;
        const sharingToWis2box = networkStations.filter((station: any) => station.share_to_wis2box).length;
        const transmitting = networkStations.filter((station: any) => {
            if (!station.last_reading_at) return false;
            return Date.now() - new Date(station.last_reading_at).getTime() <= 24 * 60 * 60 * 1000;
        }).length;

        return { total, withCoordinates, withWigos, sharingToWis2box, transmitting };
    }, [networkStations]);

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
        if (provider.name === 'WAGTECH') {
            setFormData({
                ftpHost: provider.ftpHost || '',
                ftpPort: provider.ftpPort || '21',
                ftpUser: provider.ftpUser || '',
                ftpPassword: ''
            });
        } else if (provider.name === 'PULSOWEB') {
            setFormData({
                baseUrl: provider.baseUrl || 'https://app.pulsonic.com/rest',
                apiToken: '',
                defaultTimezone: provider.defaultTimezone || 'Africa/Lagos'
            });
        } else {
            const currentUsername = provider.username || provider.apiKey || '';
            setFormData({
                baseUrl: provider.baseUrl || '',
                email: provider.email || '',
                apiKey: currentUsername.includes('**') ? '' : currentUsername,
                password: '',
                apiSecret: ''
            });
        }
    };

    const handleTestProvider = async (providerName: string) => {
        setTestingProvider(providerName);
        try {
            const res = await axios.post(`/api/providers/${providerName.toLowerCase()}/test`);
            alert(res.data.message || `${providerName} connection succeeded.`);
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
            alert(message || `${providerName} connection failed.`);
        } finally {
            setTestingProvider(null);
        }
    };

    const handleImportProviderStations = async (providerName: string) => {
        setImportingStations(providerName);
        try {
            const response = await axios.post(`/api/providers/${providerName.toLowerCase()}/import-stations`);
            alert(response.data.message || `${providerName} stations imported successfully.`);
        } catch (error: unknown) {
            const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
            alert(message || `Failed to import ${providerName} stations.`);
        } finally {
            setImportingStations(null);
        }
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
                                            {provider.name !== 'WAGTECH' && (
                                                <div className={styles.formGroup}>
                                                    <label>Base URL</label>
                                                    <input 
                                                        type="text" 
                                                        value={formData.baseUrl || ''} 
                                                        onChange={e => setFormData({...formData, baseUrl: e.target.value})}
                                                    />
                                                </div>
                                            )}
                                            {provider.name === 'CLIMDES' ? (
                                                <>
                                                    <div className={styles.formGroup}>
                                                        <label>Account Email</label>
                                                        <input 
                                                            type="email" 
                                                            value={formData.email || ''} 
                                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>Password</label>
                                                        <input 
                                                            type="password" 
                                                            placeholder="Enter new password"
                                                            value={formData.password || ''} 
                                                            onChange={e => setFormData({...formData, password: e.target.value})}
                                                        />
                                                    </div>
                                                </>
                                            ) : provider.name === 'WAGTECH' ? (
                                                <>
                                                    <div className={styles.formGroup}>
                                                        <label>FTP Host</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="e.g. ftp.example.com"
                                                            value={formData.ftpHost || ''} 
                                                            onChange={e => setFormData({...formData, ftpHost: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>FTP Port</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="21"
                                                            value={formData.ftpPort || ''} 
                                                            onChange={e => setFormData({...formData, ftpPort: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>FTP Username</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Enter Username"
                                                            value={formData.ftpUser || ''} 
                                                            onChange={e => setFormData({...formData, ftpUser: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>FTP Password</label>
                                                        <input 
                                                            type="password" 
                                                            placeholder="Enter new FTP password"
                                                            value={formData.ftpPassword || ''} 
                                                            onChange={e => setFormData({...formData, ftpPassword: e.target.value})}
                                                        />
                                                    </div>
                                                </>
                                            ) : provider.name === 'PULSOWEB' ? (
                                                <>
                                                    <div className={styles.formGroup}>
                                                        <label>API Token</label>
                                                        <input
                                                            type="password"
                                                            placeholder="Enter new PulsoWeb API token"
                                                            value={formData.apiToken || ''}
                                                            onChange={e => setFormData({...formData, apiToken: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>Default Station Timezone</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Africa/Lagos"
                                                            value={formData.defaultTimezone || ''}
                                                            onChange={e => setFormData({...formData, defaultTimezone: e.target.value})}
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
                                                            value={formData.apiKey || ''} 
                                                            onChange={e => setFormData({...formData, apiKey: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className={styles.formGroup}>
                                                        <label>Password</label>
                                                        <input 
                                                            type="password" 
                                                            placeholder="Enter TAHMO Password"
                                                            value={formData.apiSecret || ''} 
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
                                            {provider.name === 'WAGTECH' ? (
                                                <>
                                                    <div className={styles.infoRow}>
                                                        <span className={styles.label}>FTP Host</span>
                                                        <span className={styles.value}>
                                                            {provider.ftpHost ? `${provider.ftpHost}:${provider.ftpPort || '21'}` : 'None'}
                                                        </span>
                                                    </div>
                                                    <div className={styles.infoRow}>
                                                        <span className={styles.label}>FTP Username</span>
                                                        <span className={styles.value}>{provider.ftpUser || 'None'}</span>
                                                    </div>
                                                </>
                                            ) : provider.name === 'PULSOWEB' ? (
                                                <>
                                                    <div className={styles.infoRow}>
                                                        <span className={styles.label}>Base URL</span>
                                                        <span className={styles.value}>{provider.baseUrl || 'None'}</span>
                                                    </div>
                                                    <div className={styles.infoRow}>
                                                        <span className={styles.label}>API Token</span>
                                                        <span className={styles.value}>{provider.apiToken || 'None'}</span>
                                                    </div>
                                                    <div className={styles.infoRow}>
                                                        <span className={styles.label}>Default Timezone</span>
                                                        <span className={styles.value}>{provider.defaultTimezone || 'Africa/Lagos'}</span>
                                                    </div>
                                                </>
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
                                        </>
                                    )}

                                    {provider.isActive && (
                                        <div className={styles.syncBox}>
                                            {provider.name !== 'WAGTECH' && (
                                                <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
                                                    {provider.name === 'PULSOWEB' && (
                                                        <button
                                                            className={styles.syncBtn}
                                                            onClick={() => handleTestProvider(provider.name)}
                                                            disabled={testingProvider === provider.name}
                                                        >
                                                            {testingProvider === provider.name ? 'Testing PulsoWeb...' : 'Test PulsoWeb Connection'}
                                                        </button>
                                                    )}
                                                    <button
                                                        className={styles.syncBtn}
                                                        onClick={() => handleImportProviderStations(provider.name)}
                                                        disabled={importingStations !== null}
                                                    >
                                                        {importingStations === provider.name ? 'Importing & Detecting Locations...' : 'Import Stations & Detect Locations'}
                                                    </button>
                                                    <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: 0 }}>
                                                        Missing State/LGA values are detected from coordinates through OpenStreetMap Nominatim and cached locally.
                                                    </p>
                                                </div>
                                            )}
                                            {provider.name === 'WAGTECH' && (
                                                <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0 0 16px' }}>
                                                    WAGTECH stations are discovered from FTP files. State/LGA is detected automatically after real coordinates are saved on the station page.
                                                </p>
                                            )}
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
                    <Database size={20} />
                    <h2>PulsoWeb Metadata Explorer</h2>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                    Browse live granularities, observation codes, units, and the stations reporting each observation.
                </p>
                <PulsoWebMetadataExplorer enabled={Boolean(providers.find((provider: { name: string; isActive: boolean }) => provider.name === 'PULSOWEB')?.isActive)} />
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Settings size={20} />
                    <h2>Network Readiness</h2>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.providerLogo}>
                            <Database size={24} />
                            <h3>Station Metadata & Delivery</h3>
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Coordinates configured</span>
                            <span className={styles.value}>{networkReadiness.withCoordinates} / {networkReadiness.total}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Transmitting in the last 24 hours</span>
                            <span className={styles.value}>{networkReadiness.transmitting} / {networkReadiness.total}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>WIGOS identifiers assigned</span>
                            <span className={styles.value}>{networkReadiness.withWigos} / {networkReadiness.total}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Sharing to WIS2BOX</span>
                            <span className={styles.value}>{networkReadiness.sharingToWis2box} / {networkReadiness.total}</span>
                        </div>
                    </div>
                    <div className={styles.cardFooter}>
                        <p className={styles.helperText}>
                            Complete missing station metadata from the Stations page before enabling WIS2BOX delivery.
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

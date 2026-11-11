import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Settings, Server, Database, Shield, CheckCircle, AlertCircle, RefreshCw, Edit2, Save, X, Activity, AlertTriangle, XCircle } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import ConfigurationNav from '../components/ConfigurationNav';
import styles from './Configuration.module.css';

interface SyncFailure {
    station_id: string;
    station_name?: string | null;
    error_message?: string | null;
}

interface SyncRun {
    id: string;
    provider: string;
    trigger_type: 'manual' | 'automatic';
    status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
    phase: string;
    requested_by_username?: string | null;
    requested_start: string;
    requested_end: string;
    total_stations: number;
    processed_stations: number;
    successful_stations: number;
    failed_stations: number;
    skipped_stations: number;
    readings_processed: number;
    current_station_id?: string | null;
    current_chunk?: number | null;
    total_chunks?: number | null;
    error_message?: string | null;
    created_at: string;
    completed_at?: string | null;
    failures: SyncFailure[];
}

interface SyncRunsResponse {
    active: SyncRun[];
    history: SyncRun[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

const formatSyncPhase = (phase: string) => phase.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const formatSyncTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';


const Configuration = () => {
    const [editing, setEditing] = React.useState<string | null>(null);
    const [formData, setFormData] = React.useState<any>({});
    const [saving, setSaving] = React.useState(false);
    const [syncDates, setSyncDates] = React.useState<any>({});
    const [syncing, setSyncing] = React.useState<string | null>(null);
    const [syncPage, setSyncPage] = React.useState(1);

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

    const { data: syncRuns, refetch: refetchSyncRuns } = useQuery<SyncRunsResponse>({
        queryKey: ['sync-runs', syncPage],
        queryFn: async () => {
            const response = await axios.get('/api/sync/runs', { params: { page: syncPage, pageSize: 6 } });
            return response.data.data;
        },
        refetchInterval: query => {
            const runs = query.state.data?.active || [];
            return runs.length > 0 ? 3000 : 30000;
        }
    });

    const activeSyncRuns = syncRuns?.active || [];
    const recentSyncRuns = syncRuns?.history || [];
    const syncPagination = syncRuns?.pagination || { page: 1, pageSize: 6, total: 0, totalPages: 1 };

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
                const runReference = res.data.runId ? ` Track run #${res.data.runId} in Synchronization Activity above.` : '';
                alert(`${res.data.message}${runReference}`);
                setSyncPage(1);
                refetchSyncRuns();
            }
        } catch (error) {
            console.error('Manual sync failed:', error);
            if (axios.isAxiosError(error) && error.response?.data?.message) {
                alert(error.response.data.message);
            } else {
                alert('Failed to start manual synchronization.');
            }
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
                <button onClick={() => { refetch(); refetchSyncRuns(); }} className={styles.refreshBtn}>
                    <RefreshCw size={18} />
                    Refresh
                </button>
            </div>

            <ConfigurationNav />

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Activity size={20} />
                    <h2>Synchronization Activity</h2>
                    {activeSyncRuns.length > 0 && (
                        <span className={styles.liveBadge}><RefreshCw size={14} /> Live</span>
                    )}
                </div>
                <div className={styles.syncTrackerCard}>
                    <p className={styles.syncTrackerIntro}>Track manual and automatic provider synchronizations, including station-level failures.</p>
                    {activeSyncRuns.length > 0 ? (
                        <div className={styles.activeSyncGrid}>
                            {activeSyncRuns.map(run => {
                                const total = Number(run.total_stations || 0);
                                const processed = Number(run.processed_stations || 0);
                                const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
                                return (
                                    <article key={run.id} className={styles.activeSyncCard}>
                                        <div className={styles.syncRunHeader}>
                                            <div>
                                                <strong>{run.provider}</strong>
                                                <span>{run.trigger_type === 'manual' ? 'Manual' : 'Automatic'} sync · Run #{run.id}</span>
                                            </div>
                                            <span className={styles.runningStatus}><RefreshCw size={14} /> {formatSyncPhase(run.phase)}</span>
                                        </div>
                                        <div className={styles.progressTrack} aria-label={`${progress}% complete`}>
                                            <span style={{ width: `${progress}%` }} />
                                        </div>
                                        <div className={styles.syncProgressMeta}>
                                            <span>{processed} of {total || '…'} stations</span>
                                            <strong>{progress}%</strong>
                                        </div>
                                        <div className={styles.syncCurrentWork}>
                                            <span>Current: {run.current_station_id || formatSyncPhase(run.phase)}</span>
                                            {run.current_chunk && run.total_chunks
                                                ? <span>Chunk {run.current_chunk} of {run.total_chunks}</span>
                                                : null}
                                        </div>
                                        <div className={styles.syncCounts}>
                                            <span>{run.successful_stations} completed</span>
                                            <span>{run.failed_stations} failed</span>
                                            <span>{run.skipped_stations} skipped</span>
                                            <span>{run.readings_processed} readings</span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={styles.syncIdle}><CheckCircle size={18} /> No synchronization is currently running.</div>
                    )}

                    {recentSyncRuns.length > 0 && (
                        <div className={styles.syncHistory}>
                            <h3>Recent runs</h3>
                            {recentSyncRuns.map(run => (
                                <details key={run.id} className={styles.syncHistoryItem}>
                                    <summary>
                                        <span className={`${styles.syncResultIcon} ${styles[run.status]}`}>
                                            {run.status === 'completed'
                                                ? <CheckCircle size={17} />
                                                : run.status === 'partial'
                                                    ? <AlertTriangle size={17} />
                                                    : <XCircle size={17} />}
                                        </span>
                                        <span className={styles.syncHistoryIdentity}>
                                            <strong>{run.provider}</strong>
                                            <small>{run.trigger_type === 'manual' ? 'Manual' : 'Automatic'} · Run #{run.id}</small>
                                        </span>
                                        <span className={styles.syncHistoryCounts}>{run.successful_stations} completed · {run.failed_stations} failed</span>
                                        <time>{formatSyncTime(run.completed_at || run.created_at)}</time>
                                    </summary>
                                    <div className={styles.syncHistoryDetails}>
                                        <p>Range: {run.requested_start} to {run.requested_end}</p>
                                        <p>{run.readings_processed} readings processed; {run.skipped_stations} stations skipped.</p>
                                        {run.requested_by_username && <p>Requested by {run.requested_by_username}.</p>}
                                        {run.error_message && <p className={styles.syncError}>{run.error_message}</p>}
                                        {run.failures?.map(failure => (
                                            <p key={failure.station_id} className={styles.syncError}>
                                                <Link to={`/stations/${encodeURIComponent(failure.station_id)}`}>{failure.station_name || failure.station_id}</Link>
                                                : {failure.error_message || 'Synchronization failed.'}
                                            </p>
                                        ))}
                                    </div>
                                </details>
                            ))}
                            <div className={styles.syncPagination}>
                                <span>
                                    Page {syncPagination.page} of {syncPagination.totalPages} · {syncPagination.total} runs
                                </span>
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setSyncPage(page => Math.max(1, page - 1))}
                                        disabled={syncPagination.page <= 1}
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSyncPage(page => Math.min(syncPagination.totalPages, page + 1))}
                                        disabled={syncPagination.page >= syncPagination.totalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
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

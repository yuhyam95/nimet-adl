import { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import styles from './Wis2box.module.css';

interface Station {
    station_id: string;
    station_name: string;
    organization?: string;
    last_reading_at: string;
    is_active: boolean;
    provider: string;
    last_wis2box_dispatch_at?: string;
    last_wis2box_dispatch_status?: string;
    last_wis2box_dispatch_error?: string;
}

const Wis2box = () => {
    const { token } = useAuth();
    const [uploadingStationId, setUploadingStationId] = useState<string | null>(null);

    const { data: stations = [], isLoading, isError, error, refetch } = useQuery({
        queryKey: ['stations'],
        queryFn: async () => {
            const res = await axios.get('/api/dataloggers', {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.success ? res.data.data : [];
        },
    });

    const handleUpload = async (stationId: string) => {
        try {
            setUploadingStationId(stationId);
            const res = await axios.post('/api/export/wis2box', { stationId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.data.success) {
                alert(`Success: ${res.data.message}`);
            } else {
                alert(`Error: ${res.data.message}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.response?.data?.message || err.message}`);
        } finally {
            setUploadingStationId(null);
        }
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2>Wis2box Management</h2>
                </div>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Station Name</th>
                                <th>Provider</th>
                                <th>Organization</th>
                                <th>Latest Reading</th>
                                <th>Sync Time</th>
                                <th>Sync Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...Array(5)].map((_, i) => (
                                <tr key={i}>
                                    <td><Skeleton width={150} height={20} /></td>
                                    <td><Skeleton width={80} height={20} /></td>
                                    <td><Skeleton width={100} height={20} /></td>
                                    <td><Skeleton width={140} height={20} /></td>
                                    <td><Skeleton width={140} height={20} /></td>
                                    <td><Skeleton width={80} height={24} style={{ borderRadius: 99 }} /></td>
                                    <td><Skeleton width={80} height={32} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className={styles.container} style={{ justifyContent: 'center', alignItems: 'center', height: '50vh', textAlign: 'center' }}>
                <div style={{ color: '#ef4444', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Error Loading Stations</h3>
                    <p>{(error as Error)?.message || 'Failed to fetch station data.'}</p>
                </div>
                <button
                    onClick={() => refetch()}
                    className={styles.uploadBtn}
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h2>Wis2box Management</h2>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Manually trigger data uploads to your global wis2box instance.
                    </span>
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Station Name</th>
                            <th>Provider</th>
                            <th>Organization</th>
                            <th>Latest Reading</th>
                            <th>Sync Time</th>
                            <th>Sync Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stations.map((station: Station) => {
                            const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;

                            const isUploading = uploadingStationId === station.station_id;

                            return (
                                <tr key={station.station_id}>
                                    <td style={{ fontWeight: '500' }}>
                                        {station.station_name}
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            {station.provider}
                                        </span>
                                    </td>
                                    <td>{station.organization || '-'}</td>
                                    <td className={styles.lastUpdate}>
                                        {lastUpdate ? lastUpdate.toLocaleString() : 'Never'}
                                    </td>
                                    <td>
                                        {station.last_wis2box_dispatch_at ? new Date(station.last_wis2box_dispatch_at).toLocaleString() : '-'}
                                    </td>
                                    <td>
                                        {station.last_wis2box_dispatch_status ? (
                                            <span
                                                className={styles.status}
                                                style={{
                                                    backgroundColor: station.last_wis2box_dispatch_status === 'Success' ? '#d1fae5' : '#fee2e2',
                                                    color: station.last_wis2box_dispatch_status === 'Success' ? '#065f46' : '#991b1b',
                                                    cursor: station.last_wis2box_dispatch_error ? 'help' : 'default'
                                                }}
                                                title={station.last_wis2box_dispatch_error || ''}
                                            >
                                                {station.last_wis2box_dispatch_status}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No data</span>
                                        )}
                                    </td>
                                    <td>
                                        <button 
                                            className={styles.uploadBtn}
                                            onClick={() => handleUpload(station.station_id)}
                                            disabled={isUploading}
                                        >
                                            {isUploading ? 'Uploading...' : 'Upload'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {stations.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    No stations found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Wis2box;

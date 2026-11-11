import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Database, RefreshCw } from 'lucide-react';
import ConfigurationNav from '../components/ConfigurationNav';
import PulsoWebMetadataExplorer from '../components/PulsoWebMetadataExplorer';
import { Skeleton } from '../components/ui/Skeleton';
import styles from './Configuration.module.css';

const ConfigurationMetadata = () => {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['config'],
        queryFn: async () => {
            const response = await axios.get('/api/config');
            return response.data.success ? response.data.data : null;
        }
    });

    const enabled = Boolean(data?.providers?.find(
        (provider: { name: string; isActive: boolean }) => provider.name === 'PULSOWEB'
    )?.isActive);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <Database className={styles.icon} size={32} />
                    <div>
                        <h1>PulsoWeb Metadata</h1>
                        <p>Browse granularities, observations, units, and reporting stations</p>
                    </div>
                </div>
                <button type="button" onClick={() => refetch()} className={styles.refreshBtn}>
                    <RefreshCw size={18} /> Refresh
                </button>
            </div>
            <ConfigurationNav />
            <div className={styles.section}>
                <div className={styles.card}>
                    <div className={styles.cardBody}>
                        {isLoading
                            ? <Skeleton width="100%" height={220} />
                            : <PulsoWebMetadataExplorer enabled={enabled} />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationMetadata;

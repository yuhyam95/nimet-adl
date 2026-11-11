import { ListTree } from 'lucide-react';
import ConfigurationNav from '../components/ConfigurationNav';
import MappingManager from '../components/MappingManager';
import styles from './Configuration.module.css';

const ConfigurationMappings = () => (
    <div className={styles.container}>
        <div className={styles.header}>
            <div className={styles.titleSection}>
                <ListTree className={styles.icon} size={32} />
                <div>
                    <h1>Variable Mappings</h1>
                    <p>Map provider observation keys to internal weather fields</p>
                </div>
            </div>
        </div>
        <ConfigurationNav />
        <div className={styles.section}>
            <MappingManager />
        </div>
    </div>
);

export default ConfigurationMappings;

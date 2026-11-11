import { Database, ListTree, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import styles from './ConfigurationNav.module.css';

const ConfigurationNav = () => (
    <nav className={styles.nav} aria-label="Configuration sections">
        <NavLink
            end
            to="/configuration"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
            <Settings size={17} /> Overview
        </NavLink>
        <NavLink
            to="/configuration/mappings"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
            <ListTree size={17} /> Variable Mappings
        </NavLink>
        <NavLink
            to="/configuration/pulsoweb-metadata"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
            <Database size={17} /> PulsoWeb Metadata
        </NavLink>
    </nav>
);

export default ConfigurationNav;

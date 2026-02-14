import {
    ChevronRight,
    LayoutDashboard,
    LogOut,
    MapPin,
    CloudRain
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

export const Sidebar = () => {

    // Simplified menu for Weather Dashboard
    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/' },
        { icon: <MapPin size={20} />, label: 'Stations', path: '/stations' },
        { icon: <CloudRain size={20} />, label: 'Weather Data', path: '/weather' },
    ];

    const handleLogout = () => {
        // Implement logout logic here later
        console.log("Logout clicked");
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.header}>
                {/* Placeholder logo or text */}
                <h2 className={styles.title}>NiMet ADL</h2>
            </div>

            <nav className={styles.nav}>
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }: { isActive: boolean }) =>
                            `${styles.navItem} ${isActive ? styles.active : ''}`
                        }
                    >
                        <span className={styles.icon}>{item.icon}</span>
                        <span className={styles.label}>{item.label}</span>
                        <ChevronRight className={styles.arrow} size={16} />
                    </NavLink>
                ))}
            </nav>

            <div className={styles.footer}>
                <button className={styles.logoutBtn} onClick={handleLogout}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};



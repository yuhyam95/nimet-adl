import {
    ChevronRight,
    LayoutDashboard,
    LogOut,
    MapPin,
    Settings,
    Users,
    User,
    Radio,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

export const Sidebar = () => {

    const isAdmin = true; // TODO: Replace with actual auth logic

    // Simplified menu for Weather Dashboard
    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/' },
        { icon: <MapPin size={20} />, label: 'Stations', path: '/stations' },
        { icon: <Radio size={20} />, label: 'Dispatch Channels', path: '/dispatch' },
        { icon: <Settings size={20} />, label: 'Configuration', path: '/configuration' },
        ...(isAdmin ? [{ icon: <Users size={20} />, label: 'User Management', path: '/users' }] : []),
        { icon: <User size={20} />, label: 'Profile', path: '/profile' },
        // { icon: <CloudRain size={20} />, label: 'Weather Data', path: '/weather' },
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



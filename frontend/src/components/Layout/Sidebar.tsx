import {
    ChevronRight,
    LayoutDashboard,
    LogOut,
    MapPin,
    Settings,
    Users,
    User,
    Radio,
    X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Sidebar.module.css';

interface SidebarProps {
    isOpen: boolean;
    onNavigate: () => void;
}

export const Sidebar = ({ isOpen, onNavigate }: SidebarProps) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const isAdmin = user?.role === 'Admin';
    const canManageData = user?.role === 'Admin' || user?.role === 'Data Manager';

    // Simplified menu for Weather Dashboard
    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/' },
        { icon: <MapPin size={20} />, label: 'Stations', path: '/stations' },
        ...(canManageData ? [
            { icon: <Radio size={20} />, label: 'Wis2box', path: '/wis2box' },
            { icon: <Settings size={20} />, label: 'Configuration', path: '/configuration' }
        ] : []),
        ...(isAdmin ? [{ icon: <Users size={20} />, label: 'User Management', path: '/users' }] : []),
        { icon: <User size={20} />, label: 'Profile', path: '/profile' },
    ];

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`} aria-label="Primary navigation">
            <div className={styles.header}>
                <h2 className={styles.title}>NiMet ADL</h2>
                <button type="button" className={styles.closeButton} onClick={onNavigate} aria-label="Close navigation">
                    <X size={22} />
                </button>
            </div>

            <nav className={styles.nav}>
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onNavigate}
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



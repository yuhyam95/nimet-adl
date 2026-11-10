import { useAuth } from '../../context/AuthContext';
import { Menu } from 'lucide-react';
import styles from './Header.module.css';

interface HeaderProps {
    onMenuClick: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
    const { user } = useAuth();
    
    return (
        <header className={styles.header}>
            <div className={styles.headingGroup}>
                <button type="button" className={styles.menuButton} onClick={onMenuClick} aria-label="Open navigation">
                    <Menu size={22} />
                </button>
                <h1 className={styles.title}>NiMet ADL</h1>
            </div>
            <div className={styles.userProfile}>
                <div className={styles.userInfo}>
                    <p className={styles.userName}>{user?.name || user?.username}</p>
                    <p className={styles.userRole}>{user?.role}</p>
                </div>
                <div className={styles.avatar}>
                    {(user?.name || user?.username || 'U')[0].toUpperCase()}
                </div>
            </div>
        </header>
    );
};

export default Header;

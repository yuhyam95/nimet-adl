import { useAuth } from '../../context/AuthContext';
import styles from './Header.module.css';

const Header = () => {
    const { user } = useAuth();
    
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>Dashboard</h1>
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

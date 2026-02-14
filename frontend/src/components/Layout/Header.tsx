import styles from './Header.module.css';

const Header = () => {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>Weather Dashboard</h1>
        </header>
    );
};

export default Header;

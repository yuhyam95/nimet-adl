import React from 'react';
import Header from './Header';
import styles from './MainLayout.module.css';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
    children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    return (
        <div className={styles.container}>
            <Sidebar />
            <div className={styles.mainContent}>
                <Header />
                <main className={styles.content}>
                    <div className={styles.internalWrapper}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default MainLayout;

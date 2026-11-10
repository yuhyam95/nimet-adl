import React, { useState } from 'react';
import Header from './Header';
import styles from './MainLayout.module.css';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
    children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const [isNavigationOpen, setIsNavigationOpen] = useState(false);

    return (
        <div className={styles.container}>
            <Sidebar isOpen={isNavigationOpen} onNavigate={() => setIsNavigationOpen(false)} />
            {isNavigationOpen && (
                <button
                    type="button"
                    className={styles.navigationBackdrop}
                    aria-label="Close navigation"
                    onClick={() => setIsNavigationOpen(false)}
                />
            )}
            <div className={styles.mainContent}>
                <Header onMenuClick={() => setIsNavigationOpen(true)} />
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

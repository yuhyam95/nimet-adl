import React from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, User, Lock, AlertCircle } from 'lucide-react';
import styles from './Login.module.css';

const Login = () => {
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post('/api/auth/login', { username, password });
            if (response.data.success) {
                login(response.data.token, response.data.user);
                navigate('/');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to login. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.loginCard}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <LogIn size={32} />
                    </div>
                    <h1>NiMet ADL</h1>
                    <p>Automated Data Loader System</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && (
                        <div className={styles.errorAlert}>
                            <AlertCircle size={20} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label htmlFor="username">Username</label>
                        <div className={styles.inputWrapper}>
                            <User size={18} />
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter your username"
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="password">Password</label>
                        <div className={styles.inputWrapper}>
                            <Lock size={18} />
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className={styles.loginBtn} disabled={loading}>
                        {loading ? 'Logging in...' : 'Sign In'}
                    </button>
                </form>

                <div className={styles.footer}>
                    <p>&copy; 2026 Nigerian Meteorological Agency</p>
                </div>
            </div>
        </div>
    );
};

export default Login;

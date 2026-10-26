import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';

interface User {
    id: number;
    username: string;
    name: string;
    role: 'Admin' | 'Data Manager' | 'Data Viewer';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const clearSession = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
        queryClient.clear();
    }, [queryClient]);

    useEffect(() => {
        let active = true;
        const responseInterceptor = axios.interceptors.response.use(
            response => response,
            error => {
                const requestUrl = String(error.config?.url || '');
                if (error.response?.status === 401 && !requestUrl.endsWith('/api/auth/login')) {
                    clearSession();
                }
                return Promise.reject(error);
            }
        );

        const restoreSession = async () => {
            const storedToken = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (!storedToken || !storedUser) {
                if (active) setIsLoading(false);
                return;
            }

            try {
                const cachedUser = JSON.parse(storedUser) as User;
                axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
                const response = await axios.get('/api/auth/me');
                const validatedUser = { ...cachedUser, ...response.data.user } as User;

                if (active) {
                    setToken(storedToken);
                    setUser(validatedUser);
                    localStorage.setItem('user', JSON.stringify(validatedUser));
                }
            } catch {
                clearSession();
            } finally {
                if (active) setIsLoading(false);
            }
        };

        restoreSession();

        return () => {
            active = false;
            axios.interceptors.response.eject(responseInterceptor);
        };
    }, [clearSession]);

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    };

    const logout = clearSession;

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

// This hook intentionally shares the provider's module so every caller uses the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

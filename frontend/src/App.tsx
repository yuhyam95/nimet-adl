import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Stations from './pages/Stations';
import StationDetails from './pages/StationDetails';
import Configuration from './pages/Configuration';
import Login from './pages/Login';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <MainLayout><Dashboard /></MainLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/stations" element={
              <ProtectedRoute>
                <MainLayout><Stations /></MainLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/stations/:id" element={
              <ProtectedRoute>
                <MainLayout><StationDetails /></MainLayout>
              </ProtectedRoute>
            } />

            <Route path="/configuration" element={
              <ProtectedRoute allowedRoles={['Admin', 'Data Manager']}>
                <MainLayout><Configuration /></MainLayout>
              </ProtectedRoute>
            } />

            <Route path="/profile" element={
              <ProtectedRoute>
                <MainLayout><div>Profile Component coming soon...</div></MainLayout>
              </ProtectedRoute>
            } />

            <Route path="/users" element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <MainLayout><div>User Management coming soon...</div></MainLayout>
              </ProtectedRoute>
            } />

            <Route path="/weather" element={
              <ProtectedRoute>
                <MainLayout><div>Weather Data Table coming soon...</div></MainLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

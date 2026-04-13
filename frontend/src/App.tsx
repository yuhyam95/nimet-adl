import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Stations from './pages/Stations';
import StationDetails from './pages/StationDetails';
import Configuration from './pages/Configuration';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Optional: prevent refetch on window focus
      retry: 1, // Optional: reduce retries on failure
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stations" element={<Stations />} />
            <Route path="/stations/:id" element={<StationDetails />} />
            <Route path="/dispatch" element={<div>Dispatch Channels</div>} />
            <Route path="/configuration" element={<Configuration />} />
            <Route path="/users" element={<div>User Management</div>} />
            <Route path="/profile" element={<div>Profile</div>} />
            <Route path="/weather" element={<div>Weather Data Table coming soon...</div>} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

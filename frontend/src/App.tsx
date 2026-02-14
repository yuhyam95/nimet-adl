import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Stations from './pages/Stations';
import StationDetails from './pages/StationDetails';
import './styles/global.css';

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stations" element={<Stations />} />
          <Route path="/stations/:id" element={<StationDetails />} />
          <Route path="/weather" element={<div>Weather Data Table coming soon...</div>} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;

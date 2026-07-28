import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/Login';
import DashboardPage from '@/pages/Dashboard';
import ParkingListPage from '@/pages/parking/ParkingList';
import SpaceListPage from '@/pages/parking/SpaceList';
import VehicleRecordList from '@/pages/Vehicle';
import BillingRuleList from '@/pages/Billing';
import BillList from '@/pages/Billing/BillList';
import RealtimeStats from '@/pages/Stats';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // 监听 401 软跳转事件
  React.useEffect(() => {
    const handleLogout = () => {
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/parkings" element={<ParkingListPage />} />
        <Route path="/parkings/:id" element={<ParkingListPage />} />
        <Route path="/parking-spaces" element={<SpaceListPage />} />
        <Route path="/vehicle-records" element={<VehicleRecordList />} />
        <Route path="/billing-rules" element={<BillingRuleList />} />
        <Route path="/bills" element={<BillList />} />
        <Route
          path="/stats/realtime"
          element={
            <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
              <RealtimeStats />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return <AppContent />;
};

export default App;

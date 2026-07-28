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
import ErrorBoundary from '@/components/layout/ErrorBoundary';
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
        <Route
          path="/parkings"
          element={
            <ProtectedRoute allowedRoles={['superadmin', 'admin', 'operator']}>
              <ParkingListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parkings/:id"
          element={
            <ProtectedRoute allowedRoles={['superadmin', 'admin', 'operator']}>
              <ParkingListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parking-spaces"
          element={
            <ProtectedRoute allowedRoles={['superadmin', 'admin', 'operator']}>
              <SpaceListPage />
            </ProtectedRoute>
          }
        />
        <Route path="/vehicle-records" element={<VehicleRecordList />} />
        <Route
          path="/billing-rules"
          element={
            <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
              <BillingRuleList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bills"
          element={
            <ProtectedRoute allowedRoles={['superadmin', 'admin', 'cashier']}>
              <BillList />
            </ProtectedRoute>
          }
        />
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
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;

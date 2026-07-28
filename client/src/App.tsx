import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/Login';
import DashboardPage from '@/pages/Dashboard';
import ParkingListPage from '@/pages/parking/ParkingList';
import SpaceListPage from '@/pages/parking/SpaceList';
import VehicleRecordList from '@/pages/Vehicle';
import BillingRuleList from '@/pages/Billing';
import BillList from '@/pages/Billing/BillList';
import RealtimeStats from '@/pages/Stats';

const App: React.FC = () => {
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
        <Route path="/stats/realtime" element={<RealtimeStats />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;

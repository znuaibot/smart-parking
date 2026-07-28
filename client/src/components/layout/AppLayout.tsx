import React, { useState } from 'react';
import { Layout } from 'antd';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '@/hooks/useAuth';

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f7f6f3' }}>
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        trigger={null}
        style={{
          background: '#ffffff',
          borderRight: '1px solid #e8e6e2',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <Sidebar collapsed={collapsed} />
      </Layout.Sider>
      <Layout style={{ background: '#f7f6f3' }}>
        <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <Layout.Content
          style={{
            padding: 24,
            minHeight: 'calc(100vh - 64px)',
            maxWidth: 1440,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

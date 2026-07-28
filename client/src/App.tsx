// 主应用组件 - 路由入口
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Content style={{ padding: 24 }}>
          <Routes>
            {/* 路由占位 - 开发时由各模块开发者补充 */}
            <Route path="/" element={<div>首页 - 待实现</div>} />
            <Route path="/login" element={<div>登录页 - 待实现</div>} />
            <Route path="/parkings" element={<div>停车场管理 - 待实现</div>} />
            <Route path="/parking-spaces" element={<div>车位管理 - 待实现</div>} />
            <Route path="/vehicle-records" element={<div>进出记录 - 待实现</div>} />
            <Route path="/bills" element={<div>账单管理 - 待实现</div>} />
            <Route path="/stats" element={<div>统计报表 - 待实现</div>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;

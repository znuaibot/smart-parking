import React from 'react';
import { Menu } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DashboardOutlined,
  CarOutlined,
  LoginOutlined,
  MoneyCollectOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

type MenuItem = Required<MenuProps>['items'][number];

const menuItems: MenuItem[] = [
  {
    key: '/',
    label: '首页',
    icon: <DashboardOutlined />,
  },
  {
    key: 'parking',
    label: '停车场管理',
    icon: <CarOutlined />,
    children: [
      { key: '/parkings', label: '停车场列表' },
      { key: '/parking-spaces', label: '车位管理' },
    ],
  },
  {
    key: 'vehicle',
    label: '进出管理',
    icon: <LoginOutlined />,
    children: [{ key: '/vehicle-records', label: '进出记录' }],
  },
  {
    key: 'billing',
    label: '计费管理',
    icon: <MoneyCollectOutlined />,
    children: [
      { key: '/billing-rules', label: '计费规则' },
      { key: '/bills', label: '账单列表' },
    ],
  },
  {
    key: 'stats',
    label: '统计报表',
    icon: <BarChartOutlined />,
    children: [{ key: '/stats/realtime', label: '实时统计' }],
  },
];

interface SidebarProps {
  collapsed: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedKey = location.pathname;

  const openKeys = React.useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/parkings') || path.startsWith('/parking-spaces')) return ['parking'];
    if (path.startsWith('/vehicle')) return ['vehicle'];
    if (path.startsWith('/billing') || path.startsWith('/bills')) return ['billing'];
    if (path.startsWith('/stats')) return ['stats'];
    return [];
  }, [location.pathname]);

  return (
    <div
      style={{
        height: '100%',
        borderRight: '1px solid #e8e6e2',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #e8e6e2',
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: collapsed ? 18 : 16,
            fontWeight: 600,
            color: '#9a6b4a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? '🅿' : '🅿 车位管家'}
        </span>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        defaultOpenKeys={openKeys}
        style={{
          borderRight: 0,
          background: 'transparent',
          marginTop: 8,
          flex: 1,
        }}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </div>
  );
};

export default Sidebar;

import React from 'react';
import { Avatar, Dropdown, Button, Breadcrumb, Space, Typography } from 'antd';
import { LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

const pathNameMap: Record<string, string> = {
  '/': '首页',
  '/parkings': '停车场列表',
  '/parking-spaces': '车位管理',
  '/vehicle-records': '进出记录',
  '/billing-rules': '计费规则',
  '/bills': '账单列表',
  '/stats/realtime': '实时统计',
};

const Header: React.FC<HeaderProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const breadcrumbItems = React.useMemo(() => {
    const pathSnippets = location.pathname.split('/').filter(i => i);
    const items = [{ title: <Link to="/">首页</Link> }];
    let url = '';
    pathSnippets.forEach((snippet) => {
      url += `/${snippet}`;
      const title = pathNameMap[url] || snippet;
      items.push({ title: <Link to={url}>{title}</Link> });
    });
    return items;
  }, [location.pathname]);

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout();
        window.location.href = '/login';
      },
    },
  ];

  return (
    <div
      style={{
        height: 64,
        padding: '0 24px',
        background: '#ffffff',
        borderBottom: '1px solid #e8e6e2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Space size={16}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          style={{ fontSize: 16 }}
        />
        <Breadcrumb items={breadcrumbItems} />
      </Space>

      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Space style={{ cursor: 'pointer' }}>
          <Avatar
            size={32}
            icon={<UserOutlined />}
            style={{ background: '#9a6b4a' }}
          />
          <Typography.Text style={{ color: '#2c2a26' }}>
            {user?.username || '管理员'}
          </Typography.Text>
        </Space>
      </Dropdown>
    </div>
  );
};

export default Header;

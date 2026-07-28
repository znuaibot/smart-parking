import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Checkbox, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { useAuth } from '@/hooks/useAuth';
import type { LoginRequest } from '@/types';

const { Title, Paragraph, Text } = Typography;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (values: LoginRequest & { remember?: boolean }) => {
    setLoading(true);
    try {
      const res = await authApi.login({
        username: values.username,
        password: values.password,
      });
      const { accessToken, refreshToken, user } = res.data;
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user, accessToken);
      message.success('登录成功');
      navigate('/');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      const msg = axiosError.response?.data?.message || '用户名或密码错误';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f7f6f3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card
        bordered={false}
        style={{
          width: 360,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(12px)',
          transition:
            'opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
          borderRadius: 14,
          boxShadow:
            '0 4px 16px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.1)',
        }}
        styles={{
          body: { padding: '40px 32px' },
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🅿</div>
          <Title level={3} style={{ margin: 0, marginBottom: 4, color: '#1a1917' }}>
            车位管家
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 13, margin: 0 }}>
            优雅地管理车位
          </Paragraph>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              size="large"
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 24 }}>
            <Checkbox>
              <Text type="secondary">记住登录状态</Text>
            </Checkbox>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              block
              size="large"
              loading={loading}
              htmlType="submit"
            >
              {loading ? '正在进入…' : '进入工作台'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;

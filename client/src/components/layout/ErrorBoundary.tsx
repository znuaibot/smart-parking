import React from 'react';
import { Result, Button, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Application Error:', error, errorInfo);
    // 此处可接入错误上报服务（如 Sentry）
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f7f6f3',
            padding: 24,
          }}
        >
          <Result
            status="error"
            title="页面发生错误"
            subTitle="抱歉，应用遇到了意外问题。请刷新重试。"
            extra={
              <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReload}>
                重新加载
              </Button>
            }
          >
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div style={{ maxWidth: 500, margin: '16px auto', textAlign: 'left' }}>
                <Paragraph>
                  <Text strong>错误详情：</Text>
                </Paragraph>
                <pre
                  style={{
                    background: '#f5f4f2',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    overflow: 'auto',
                  }}
                >
                  {this.state.error.message}
                </pre>
              </div>
            )}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

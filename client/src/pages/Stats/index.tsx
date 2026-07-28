import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const RealtimeStats: React.FC = () => {
  return (
    <Card bordered={false}>
      <Title level={4} style={{ margin: 0 }}>实时统计</Title>
      <p style={{ marginTop: 16, color: '#6b6860' }}>此页面正在开发中，后端接口对接完成后将展示实时统计数据。</p>
    </Card>
  );
};

export default RealtimeStats;

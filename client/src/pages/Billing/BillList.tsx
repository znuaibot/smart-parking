import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const BillList: React.FC = () => (
  <Card bordered={false}>
    <Title level={4}>账单列表</Title>
    <p>此页面正在开发中，后端接口对接完成后将展示账单列表。</p>
  </Card>
);

export default BillList;

import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const BillingRuleList: React.FC = () => (
  <Card bordered={false}>
    <Title level={4}>计费规则</Title>
    <p>此页面正在开发中，后端接口对接完成后将展示计费规则管理。</p>
  </Card>
);

export default BillingRuleList;

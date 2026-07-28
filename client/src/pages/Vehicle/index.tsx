import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const VehicleRecordList: React.FC = () => (
  <Card bordered={false}>
    <Title level={4}>进出记录</Title>
    <p>此页面正在开发中，后端接口对接完成后将展示车辆进出记录列表。</p>
  </Card>
);

export default VehicleRecordList;

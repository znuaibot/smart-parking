import React from 'react';
import { Card, Typography, Progress, Row, Col, Space, Statistic } from 'antd';

const { Text } = Typography;

interface AvailabilityCardProps {
  total: number;
  available: number;
  occupied: number;
  reserved?: number;
  occupancyRate?: number;
  loading?: boolean;
}

const AvailabilityCard: React.FC<AvailabilityCardProps> = ({
  total,
  available,
  occupied,
  reserved = 0,
  occupancyRate = 0,
  loading = false,
}) => {
  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const displayRate = occupancyRate ? Math.round(occupancyRate * 100) : rate;

  // Determine color based on occupancy rate
  const getRateColor = (r: number) => {
    if (r >= 90) return '#b8524a';
    if (r >= 70) return '#c49a5a';
    return '#4a8564';
  };

  return (
    <Card loading={loading} bordered={false} styles={{ body: { padding: 24 } }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.03em' }}>
            余位概况
          </Text>
        </div>

        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Statistic
              title="总车位"
              value={total}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#2c2a26' }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="空闲"
              value={available}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#4a8564' }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="已占用"
              value={occupied}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#9a6b4a' }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="预约"
              value={reserved}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#c49a5a' }}
            />
          </Col>
        </Row>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: '#6b6860' }}>占用率</Text>
            <Text
              strong
              style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: getRateColor(displayRate) }}
            >
              {displayRate}%
            </Text>
          </div>
          <Progress
            percent={displayRate}
            showInfo={false}
            strokeColor={getRateColor(displayRate)}
            trailColor="#efedea"
            size="small"
          />
        </div>
      </Space>
    </Card>
  );
};

export default AvailabilityCard;

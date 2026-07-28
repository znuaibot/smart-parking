import React, { useState } from 'react';
import { Card, Row, Col, Typography, Progress, message, Statistic, Space, Alert } from 'antd';
import { CarOutlined, TeamOutlined, DollarOutlined, RiseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import ReactECharts from 'echarts-for-react';
import AvailabilityCard from '@/components/stats/AvailabilityCard';
import { parkingApi } from '@/api/parking';
import { statsApi } from '@/api/stats';
import { useAuth } from '@/hooks/useAuth';
import type { Parking, RealtimeStats } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [lastUpdated, setLastUpdated] = useState(dayjs());
  const [statsError, setStatsError] = useState<string | null>(null);

  // 使用 React Query 管理停车场列表数据（带缓存 + 自动轮询）
  const {
    data: parkings = [],
    isLoading: loading,
  } = useQuery<Parking[]>(
    'parkings-list',
    async () => {
      const res = await parkingApi.getList({ page: 1, pageSize: 100 });
      return res.data.list;
    },
    {
      refetchInterval: 30000,              // 30s 自动轮询
      refetchIntervalInBackground: false,  // Tab 不可见时暂停
      onSuccess: () => setLastUpdated(dayjs()),
      onError: (err: unknown) => {
        const axiosError = err as { response?: { data?: { message?: string } } };
        const msg = axiosError.response?.data?.message || '获取停车场数据失败';
        message.error(msg);
      },
    }
  );

  // 获取第一个停车场的实时统计（安全校验：从已授权的列表中选取）
  const firstParkingId = parkings.length > 0 ? parkings[0].id : '';

  const { data: stats, refetch: refetchStats } = useQuery<RealtimeStats | null>(
    ['realtime-stats', firstParkingId],
    async () => {
      if (!firstParkingId) return null;
      const res = await statsApi.getRealtime(firstParkingId);
      return res.data;
    },
    {
      enabled: !!firstParkingId,
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
      onError: (err: unknown) => {
        const axiosError = err as { response?: { data?: { message?: string } } };
        const msg = axiosError.response?.data?.message || '获取实时统计数据失败';
        setStatsError(msg);
      },
      onSuccess: () => setStatsError(null),
    }
  );

  // Compute aggregate data
  const totalSpaces = parkings.reduce((sum, p) => sum + p.totalSpaces, 0);
  const totalAvailable = parkings.reduce((sum, p) => sum + p.availableSpaces, 0);
  const totalOccupied = totalSpaces - totalAvailable;

  // ECharts option for zone distribution
  const zoneChartOption = stats?.zoneStats
    ? {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          data: stats.zoneStats.map(z => `${z.zone}区`),
          axisLabel: { color: '#6b6860' },
          axisLine: { lineStyle: { color: '#e8e6e2' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#6b6860' },
          axisLine: { lineStyle: { color: '#e8e6e2' } },
          splitLine: { lineStyle: { color: '#efedea' } },
        },
        series: [
          {
            name: '空闲',
            type: 'bar',
            stack: 'total',
            data: stats.zoneStats.map(z => z.available),
            itemStyle: { color: '#4a8564' },
          },
          {
            name: '占用',
            type: 'bar',
            stack: 'total',
            data: stats.zoneStats.map(z => z.total - z.available),
            itemStyle: { color: '#9a6b4a' },
          },
        ],
      }
    : {};

  const handleRetryStats = () => {
    refetchStats();
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        欢迎回来，{user?.username || '管理员'}
      </Title>

      {/* KPI Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="总车位"
              value={totalSpaces}
              prefix={<CarOutlined style={{ color: '#9a6b4a' }} />}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#2c2a26' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="当前在场"
              value={totalOccupied}
              prefix={<TeamOutlined style={{ color: '#4a6fa5' }} />}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#4a6fa5' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="今日入库"
              value={stats?.todayEntry ?? '-'}
              prefix={<RiseOutlined style={{ color: '#4a8564' }} />}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#4a8564' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="今日营收"
              value={stats?.todayRevenue ?? '-'}
              prefix={<DollarOutlined style={{ color: '#c49a5a' }} />}
              precision={2}
              valueStyle={{ fontFamily: "'IBM Plex Mono', monospace", color: '#c49a5a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Stats Error Alert */}
      {statsError && (
        <Alert
          type="warning"
          showIcon
          message="统计数据加载失败"
          description={statsError}
          action={
            <ReloadOutlined
              onClick={handleRetryStats}
              style={{ cursor: 'pointer', color: '#9a6b4a' }}
            />
          }
          closable
          onClose={() => setStatsError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Availability + Chart */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={8}>
          <AvailabilityCard
            total={totalSpaces}
            available={totalAvailable}
            occupied={totalOccupied}
            reserved={0}
            occupancyRate={stats?.occupancyRate}
            loading={loading}
          />
        </Col>
        <Col xs={24} lg={16}>
          <Card title="各区域余位分布" bordered={false} loading={loading}>
            {stats?.zoneStats && stats.zoneStats.length > 0 ? (
              <ReactECharts option={zoneChartOption} style={{ height: 240 }} />
            ) : (
              <div
                style={{
                  height: 240,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9d9a92',
                }}
              >
                暂无区域数据，请先绑定停车场
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Parking List */}
      <Card
        title="各停车场余位"
        bordered={false}
        loading={loading}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            最后更新: {lastUpdated.format('HH:mm:ss')}
          </Text>
        }
      >
        {parkings.length > 0 ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {parkings.map(p => {
              const rate = p.totalSpaces > 0
                ? Math.round(((p.totalSpaces - p.availableSpaces) / p.totalSpaces) * 100)
                : 0;
              return (
                <div key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13 }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9d9a92' }}>
                      {p.availableSpaces} 空闲
                    </Text>
                  </div>
                  <Progress
                    percent={rate}
                    showInfo={false}
                    strokeColor={rate >= 90 ? '#b8524a' : rate >= 70 ? '#c49a5a' : '#4a8564'}
                    trailColor="#efedea"
                    size="small"
                  />
                </div>
              );
            })}
          </Space>
        ) : (
          <div style={{ textAlign: 'center', color: '#9d9a92', padding: '40px 0' }}>
            暂无停车场数据，请先创建停车场
          </div>
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;

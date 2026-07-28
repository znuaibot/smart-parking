import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Select,
  Input,
  Space,
  Typography,
  Tag,
  Segmented,
  Table,
  Button,
  message,
} from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import { parkingApi } from '@/api/parking';
import { spaceApi } from '@/api/space';
import type { ParkingSpace, SpaceStatus } from '@/types';
import SpaceGrid from '@/components/parking/SpaceGrid';

const { Title, Text } = Typography;

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'available', label: '空闲' },
  { value: 'occupied', label: '占用' },
  { value: 'reserved', label: '预约' },
  { value: 'disabled', label: '不可用' },
];

const zoneOptions = [
  { value: '', label: '全部区域' },
  { value: 'A', label: 'A区' },
  { value: 'B', label: 'B区' },
  { value: 'C', label: 'C区' },
  { value: 'D', label: 'D区' },
];

const SpaceListPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const parkingId = searchParams.get('parkingId') || '';

  const [loading, setLoading] = useState(false);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState({ total: 0, available: 0, occupied: 0, reserved: 0, disabled: 0 });
  const [parkingName, setParkingName] = useState('');

  const fetchSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (zoneFilter) params.zone = zoneFilter;
      if (statusFilter) params.status = statusFilter;

      let data: ParkingSpace[];
      if (parkingId) {
        const res = await parkingApi.getSpaces(parkingId, params);
        data = res.data.list;
        // Try to get parking info from first item
        setParkingName(parkingId ? `停车场 #${parkingId.slice(0, 8)}` : '');
      } else {
        const res = await spaceApi.getList(params);
        data = res.data.list;
      }

      setSpaces(data);

      // Compute stats
      setStats({
        total: data.length,
        available: data.filter(s => s.status === 'available').length,
        occupied: data.filter(s => s.status === 'occupied').length,
        reserved: data.filter(s => s.status === 'reserved').length,
        disabled: data.filter(s => s.status === 'disabled').length,
      });
    } catch {
      message.error('获取车位列表失败');
    } finally {
      setLoading(false);
    }
  }, [parkingId, zoneFilter, statusFilter]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const handleSpaceUpdate = (id: string, status: string) => {
    setSpaces(prev =>
      prev.map(s => (s.id === id ? { ...s, status: status as SpaceStatus } : s))
    );
    // Update stats
    setStats(prev => {
      const space = spaces.find(s => s.id === id);
      if (!space) return prev;
      const oldStatus = space.status;
      const newStats = { ...prev };
      if (oldStatus === 'available') newStats.available--;
      if (oldStatus === 'occupied') newStats.occupied--;
      if (oldStatus === 'reserved') newStats.reserved--;
      if (oldStatus === 'disabled') newStats.disabled--;
      if (status === 'available') newStats.available++;
      if (status === 'occupied') newStats.occupied++;
      if (status === 'reserved') newStats.reserved++;
      if (status === 'disabled') newStats.disabled++;
      return newStats;
    });
  };

  const columns: ColumnsType<ParkingSpace> = [
    {
      title: '编号',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{code}</span>
      ),
    },
    {
      title: '区域',
      dataIndex: 'zone',
      key: 'zone',
    },
    {
      title: '楼层',
      dataIndex: 'floor',
      key: 'floor',
      render: (floor: number) => `${floor}F`,
    },
    {
      title: '类型',
      dataIndex: 'spaceType',
      key: 'spaceType',
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          normal: '标准',
          vip: 'VIP',
          disabled: '无障碍',
          charging: '充电桩',
        };
        return <Tag>{typeMap[type] || type}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: SpaceStatus) => {
        const colorMap: Record<SpaceStatus, string> = {
          available: 'success',
          occupied: 'error',
          reserved: 'warning',
          disabled: 'default',
        };
        const labelMap: Record<SpaceStatus, string> = {
          available: '空闲',
          occupied: '占用',
          reserved: '预约',
          disabled: '不可用',
        };
        return <Tag color={colorMap[status]}>{labelMap[status]}</Tag>;
      },
    },
    {
      title: '当前车牌',
      dataIndex: 'currentPlate',
      key: 'currentPlate',
      render: (plate?: string) =>
        plate ? (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{plate}</span>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ];

  const legendItems = [
    { label: '空闲', color: '#4a8564' },
    { label: '占用', color: '#9a6b4a' },
    { label: '预约', color: '#c49a5a' },
    { label: '不可用', color: '#c4c1b9' },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          车位管理
          {parkingName && (
            <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>
              ({parkingName})
            </Text>
          )}
        </Title>
        <Segmented
          value={view}
          onChange={val => setView(val as 'grid' | 'list')}
          options={[
            { value: 'grid', icon: <AppstoreOutlined />, label: '网格' },
            { value: 'list', icon: <UnorderedListOutlined />, label: '列表' },
          ]}
        />
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          { label: '总车位', value: stats.total, color: '#2c2a26' },
          { label: '已占用', value: stats.occupied, color: '#9a6b4a' },
          { label: '空闲', value: stats.available, color: '#4a8564' },
          { label: '预约中', value: stats.reserved, color: '#c49a5a' },
          { label: '不可用', value: stats.disabled, color: '#c4c1b9' },
        ].map(({ label, value, color }) => (
          <Card key={label} bordered={false} size="small" styles={{ body: { padding: '16px' } }}>
            <div style={{ fontSize: 11, color: '#9d9a92', fontWeight: 500, letterSpacing: '0.02em' }}>
              {label}
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 22,
                fontWeight: 600,
                color,
                marginTop: 4,
              }}
            >
              {value}
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card bordered={false} size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={zoneFilter}
            onChange={val => setZoneFilter(val)}
            options={zoneOptions}
            style={{ width: 140 }}
          />
          <Select
            value={statusFilter}
            onChange={val => setStatusFilter(val)}
            options={statusOptions}
            style={{ width: 140 }}
          />
        </Space>
      </Card>

      {/* Legend */}
      <Space size={16} style={{ marginBottom: 16 }}>
        {legendItems.map(({ label, color }) => (
          <Space key={label} size={6}>
            <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
            <Text style={{ fontSize: 12, color: '#6b6860' }}>{label}</Text>
          </Space>
        ))}
      </Space>

      {/* Content */}
      <Card bordered={false} loading={loading}>
        {view === 'grid' ? (
          <SpaceGrid spaces={spaces} onSpaceUpdate={handleSpaceUpdate} />
        ) : (
          <Table<ParkingSpace>
            rowKey="id"
            columns={columns}
            dataSource={spaces}
            pagination={{
              pageSize: 20,
              showTotal: (t) => `共 ${t} 条`,
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default SpaceListPage;

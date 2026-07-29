import React, { useState, useMemo } from 'react';
import {
  Card,
  Select,
  Space,
  Typography,
  Tag,
  Segmented,
  Table,
  message,
} from 'antd';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
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
  const queryClient = useQueryClient();

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Space list query
  const queryKey = useMemo(
    () => ['spaces', parkingId, zoneFilter, statusFilter],
    [parkingId, zoneFilter, statusFilter]
  );

  const { data, isLoading: loading } = useQuery(
    queryKey,
    async () => {
      const params: Record<string, string> = {};
      if (zoneFilter) params.zone = zoneFilter;
      if (statusFilter) params.status = statusFilter;

      if (parkingId) {
        const res = await parkingApi.getSpaces(parkingId, params);
        return res.data.list;
      } else {
        const res = await spaceApi.getList(params);
        return res.data.list;
      }
    },
    {
      keepPreviousData: true,
      select: (list: ParkingSpace[]) => list,
      onError: () => message.error('获取车位列表失败'),
    }
  );

  // 使用 useMemo 稳定 spaces 引用，避免每次渲染产生新数组导致下游 useMemo 失效
  const spaces = useMemo(() => data ?? [], [data]);

  // Stats computation (derived from query data)
  const stats = useMemo(() => ({
    total: spaces.length,
    available: spaces.filter(s => s.status === 'available').length,
    occupied: spaces.filter(s => s.status === 'occupied').length,
    reserved: spaces.filter(s => s.status === 'reserved').length,
    disabled: spaces.filter(s => s.status === 'disabled').length,
  }), [spaces]);

  // Status update mutation - 使用 useMutation + invalidateQueries 替代手动状态更新
  const updateStatusMutation = useMutation(
    async ({ id, status }: { id: string; status: SpaceStatus }) => {
      await spaceApi.updateStatus(id, status);
    },
    {
      onSuccess: () => {
        message.success('状态已更新');
        // 拉取最新准确数据
        queryClient.invalidateQueries('spaces');
      },
      onError: () => {
        message.error('更新失败');
        // 确保前端与后端一致
        queryClient.invalidateQueries('spaces');
      },
    }
  );

  const handleSpaceUpdate = (id: string, status: string) => {
    updateStatusMutation.mutate({ id, status: status as SpaceStatus });
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
          {parkingId && (
            <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>
              (ID: {parkingId.slice(0, 8)}...)
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
      <Card bordered={false} loading={loading || updateStatusMutation.isLoading}>
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

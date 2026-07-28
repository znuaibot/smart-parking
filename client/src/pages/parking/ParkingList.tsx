import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Modal,
  Popconfirm,
  Progress,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { parkingApi } from '@/api/parking';
import type { Parking, ParkingStatus } from '@/types';
import ParkingForm from './ParkingForm';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const { Title } = Typography;

const statusTagMap: Record<ParkingStatus, { color: string; label: string }> = {
  active: { color: 'success', label: '运营中' },
  inactive: { color: 'default', label: '停用' },
  suspended: { color: 'warning', label: '暂停' },
};

const ALL_PAGE_SIZE = 1000; // 用于统计的全量数据请求

const ParkingListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingParking, setEditingParking] = useState<Parking | null>(null);

  const debouncedKeyword = useDebouncedValue(keyword, 300);

  // 全量数据查询 —— 用于统计
  const { data: allData } = useQuery(
    ['parkings-all', debouncedKeyword],
    async () => {
      const res = await parkingApi.getList({ page: 1, pageSize: ALL_PAGE_SIZE, keyword: debouncedKeyword || undefined });
      return res.data.list;
    },
    {
      keepPreviousData: true,
    }
  );

  // 分页数据查询 —— 用于表格展示
  const { data: pageData, isLoading: loading } = useQuery(
    ['parkings-page', page, pageSize, debouncedKeyword],
    async () => {
      const res = await parkingApi.getList({ page, pageSize, keyword: debouncedKeyword || undefined });
      return res.data;
    },
    {
      keepPreviousData: true,
      onError: () => message.error('获取停车场列表失败'),
    }
  );

  const list = pageData?.list ?? [];
  const total = pageData?.total ?? 0;

  // 统计数据来自全量数据（确保全局准确）
  const stats = useMemo(() => {
    const allParkings = allData ?? [];
    const totalSpaces = allParkings.reduce((sum, p) => sum + p.totalSpaces, 0);
    const availableSpaces = allParkings.reduce((sum, p) => sum + p.availableSpaces, 0);
    const occupiedSpaces = totalSpaces - availableSpaces;
    const rate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;
    return { totalSpaces, occupiedSpaces, availableSpaces, rate };
  }, [allData]);

  const handleDelete = async (id: string) => {
    try {
      await parkingApi.delete(id);
      message.success('删除成功');
      queryClient.invalidateQueries('parkings-all');
      queryClient.invalidateQueries('parkings-page');
    } catch {
      message.error('删除失败');
    }
  };

  const handleFormSuccess = () => {
    setModalVisible(false);
    setEditingParking(null);
    queryClient.invalidateQueries('parkings-all');
    queryClient.invalidateQueries('parkings-page');
  };

  const handleEdit = (parking: Parking) => {
    setEditingParking(parking);
    setModalVisible(true);
  };

  const handleCreate = () => {
    setEditingParking(null);
    setModalVisible(true);
  };

  const columns: ColumnsType<Parking> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 500 }}
          onClick={() => navigate(`/parkings/${record.id}`)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '编码',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
          {code}
        </span>
      ),
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      ellipsis: true,
    },
    {
      title: '总车位',
      dataIndex: 'totalSpaces',
      key: 'totalSpaces',
      align: 'right',
      render: (val: number) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{val}</span>
      ),
    },
    {
      title: '余位',
      dataIndex: 'availableSpaces',
      key: 'availableSpaces',
      align: 'right',
      render: (val: number) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#4a8564', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    {
      title: '占用率',
      key: 'occupancyRate',
      width: 140,
      render: (_, record) => {
        const r = record.totalSpaces > 0
          ? Math.round(((record.totalSpaces - record.availableSpaces) / record.totalSpaces) * 100)
          : 0;
        return (
          <Progress
            percent={r}
            size="small"
            format={() => `${r}%`}
            strokeColor={{ from: '#9a6b4a', to: '#c49a5a' }}
            trailColor="#efedea"
          />
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: ParkingStatus) => (
        <Tag color={statusTagMap[status].color}>{statusTagMap[status].label}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<CarOutlined />}
            onClick={() => navigate(`/parking-spaces?parkingId=${record.id}`)}
          >
            查看车位
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该停车场吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          停车场
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建
        </Button>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: '总车位', value: stats.totalSpaces, color: '#2c2a26' },
          { label: '已占用', value: stats.occupiedSpaces, color: '#9a6b4a' },
          { label: '空闲', value: stats.availableSpaces, color: '#4a8564' },
          { label: '总使用率', value: `${stats.rate}%`, color: '#b8524a' },
        ].map(({ label, value, color }) => (
          <Card key={label} bordered={false} size="small" styles={{ body: { padding: '16px 20px' } }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#9d9a92', letterSpacing: '0.02em' }}>
              {label}
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 24,
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

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索停车场名称或编码"
          allowClear
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onSearch={setKeyword}
          style={{ maxWidth: 400 }}
        />
      </div>

      {/* Table */}
      <Card bordered={false}>
        <Table<Parking>
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingParking ? '编辑停车场' : '新建停车场'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingParking(null);
        }}
        footer={null}
        destroyOnClose
      >
        <ParkingForm
          initialValues={editingParking}
          onSuccess={handleFormSuccess}
          onCancel={() => setModalVisible(false)}
        />
      </Modal>
    </div>
  );
};

export default ParkingListPage;

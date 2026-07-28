import React, { useState } from 'react';
import { Popover, Select, Descriptions, Divider, Alert, Typography, Space } from 'antd';
import type { ParkingSpace } from '@/types';
import { spaceApi } from '@/api/space';
import { message } from 'antd';

const { Text } = Typography;

interface StatusConfig {
  color: string;
  bg: string;
  border: string;
  label: string;
}

const statusConfig: Record<string, StatusConfig> = {
  available: { color: '#4a8564', bg: '#edf7f2', border: '2px solid #4a8564', label: '空闲' },
  occupied: { color: '#9a6b4a', bg: '#f9f3ed', border: '2px solid #d4b896', label: '占用' },
  reserved: { color: '#c49a5a', bg: '#fdf6ec', border: '2px solid #c49a5a', label: '预约' },
  disabled: { color: '#c4c1b9', bg: '#f5f4f2', border: '2px solid #d9d6d0', label: '不可用' },
};

const typeLabel: Record<string, string> = {
  normal: '标准',
  vip: 'VIP',
  disabled: '无障碍',
  charging: '充电桩',
};

interface SpaceItemProps {
  space: ParkingSpace;
  onStatusChange: (id: string, status: string) => void;
}

const SpaceItem: React.FC<SpaceItemProps> = ({ space, onStatusChange }) => {
  const config = statusConfig[space.status] || statusConfig.disabled;
  const [hovered, setHovered] = useState(false);

  const handleStatusChange = async (status: string) => {
    try {
      await spaceApi.updateStatus(space.id, status as ParkingSpace['status']);
      message.success('状态已更新');
      onStatusChange(space.id, status);
    } catch {
      message.error('更新失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // 触发 Popover 打开
      (e.currentTarget as HTMLElement).click();
    }
  };

  const popoverContent = (
    <div style={{ minWidth: 220 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 600 }}>
            {space.code}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            类型: {typeLabel[space.spaceType] || space.spaceType}
          </Text>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <Descriptions column={1} size="small" labelStyle={{ fontSize: 12 }}>
          <Descriptions.Item label="状态">{config.label}</Descriptions.Item>
          <Descriptions.Item label="楼层">{space.floor}F</Descriptions.Item>
          <Descriptions.Item label="区域">{space.zone || '-'}</Descriptions.Item>
        </Descriptions>

        {space.currentPlate && (
          <Alert
            type="info"
            showIcon
            message={`当前车辆: ${space.currentPlate}`}
            style={{ fontSize: 12, padding: '4px 8px' }}
          />
        )}

        <Select
          style={{ width: '100%' }}
          size="small"
          placeholder="修改状态"
          options={[
            { value: 'available', label: '设为空闲' },
            { value: 'occupied', label: '设为占用' },
            { value: 'reserved', label: '设为预约' },
            { value: 'disabled', label: '设为不可用' },
          ]}
          onChange={handleStatusChange}
        />
      </Space>
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="click" placement="top">
      <div
        role="button"
        tabIndex={0}
        aria-label={`车位 ${space.code}，状态: ${config.label}`}
        aria-pressed={false}
        style={{
          aspectRatio: '3/2',
          borderRadius: 8,
          border: config.border,
          background: config.bg,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          position: 'relative',
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          zIndex: hovered ? 2 : 1,
          boxShadow: hovered ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
          outline: 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: '#6b6860',
            lineHeight: 1.2,
          }}
        >
          {space.code}
        </div>
        {space.status === 'occupied' && space.currentPlate && (
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              fontWeight: 500,
              color: config.color,
              marginTop: 2,
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {space.currentPlate}
          </div>
        )}
        {space.status === 'available' && (
          <div style={{ fontSize: 16, color: config.color, opacity: 0.5, lineHeight: 1 }}>
            +
          </div>
        )}
        {space.spaceType === 'vip' && (
          <div style={{ position: 'absolute', top: 3, right: 3, fontSize: 10 }}>⭐</div>
        )}
        {space.spaceType === 'charging' && (
          <div style={{ position: 'absolute', top: 3, right: 3, fontSize: 10 }}>⚡</div>
        )}
      </div>
    </Popover>
  );
};

interface SpaceGridProps {
  spaces: ParkingSpace[];
  onSpaceUpdate: (id: string, status: string) => void;
}

const SpaceGrid: React.FC<SpaceGridProps> = ({ spaces, onSpaceUpdate }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: 10,
      }}
    >
      {spaces.map(space => (
        <SpaceItem
          key={space.id}
          space={space}
          onStatusChange={onSpaceUpdate}
        />
      ))}
    </div>
  );
};

export default SpaceGrid;

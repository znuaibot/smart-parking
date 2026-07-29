import React from 'react';
import { Form, Input, Button, Space, Select, message, InputNumber } from 'antd';
import { parkingApi } from '@/api/parking';
import type { Parking, ParkingCreateInput, ParkingStatus } from '@/types';

interface ParkingFormProps {
  initialValues?: Parking | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const statusOptions = [
  { value: 'active', label: '运营中' },
  { value: 'inactive', label: '停用' },
  { value: 'suspended', label: '暂停' },
];

const ParkingForm: React.FC<ParkingFormProps> = ({ initialValues, onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (values: ParkingCreateInput & { status?: ParkingStatus }) => {
    setLoading(true);
    try {
      if (initialValues) {
        await parkingApi.update(initialValues.id, values);
        message.success('更新成功');
      } else {
        await parkingApi.create(values);
        message.success('创建成功');
      }
      onSuccess();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      const msg = axiosError.response?.data?.message || '操作失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={
        initialValues
          ? {
              name: initialValues.name,
              code: initialValues.code,
              address: initialValues.address,
              contactPhone: initialValues.contactPhone,
              totalSpaces: initialValues.totalSpaces,
              status: initialValues.status,
            }
          : {}
      }
      onFinish={handleSubmit}
    >
      <Form.Item
        label="停车场名称"
        name="name"
        rules={[{ required: true, message: '请输入停车场名称' }]}
      >
        <Input placeholder="停车场名称" />
      </Form.Item>

      <Form.Item
        label="编码"
        name="code"
        rules={[{ required: true, message: '请输入编码' }]}
      >
        <Input placeholder="唯一编码" />
      </Form.Item>

      <Form.Item label="地址" name="address">
        <Input placeholder="详细地址" />
      </Form.Item>

      <Form.Item label="联系电话" name="contactPhone">
        <Input placeholder="联系电话" />
      </Form.Item>

      {!initialValues && (
        <Form.Item label="预设车位数" name="totalSpaces" initialValue={0}>
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
      )}

      {initialValues && (
        <Form.Item label="状态" name="status">
          <Select options={statusOptions} placeholder="选择状态" />
        </Form.Item>
      )}

      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" loading={loading} htmlType="submit">
            确认
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default ParkingForm;

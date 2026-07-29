// 停车场模块 - 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { parkingController } from './parking.controller.js';
import { parkingService } from './parking.service.js';
import { NotFoundError, ConflictError } from '../../shared/types/errors.js';

// Mock parkingService
vi.mock('./parking.service.js', () => ({
  parkingService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// 辅助函数：创建 Mock Express 对象
function createMockResponse() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('ParkingController', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = createMockResponse();
    next = createMockNext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('应该返回分页列表', async () => {
      const mockResult = {
        data: [{ id: '1', name: '测试停车场' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      vi.mocked(parkingService.list).mockResolvedValue(mockResult);

      const req = {
        query: { page: '1', pageSize: '20' },
      } as unknown as Request;

      await parkingController.list(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        code: 'SUCCESS',
        message: '查询成功',
        data: mockResult,
      });
    });

    it('应该传递搜索关键字', async () => {
      vi.mocked(parkingService.list).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const req = {
        query: { keyword: '测试', status: 'active' },
      } as unknown as Request;

      await parkingController.list(req, res, next);

      expect(parkingService.list).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: '测试', status: 'active' }),
      );
    });
  });

  describe('getById', () => {
    it('应该返回停车场详情', async () => {
      const mockParking = { id: '1', name: '测试停车场' };
      vi.mocked(parkingService.getById).mockResolvedValue(mockParking as any);

      const req = { params: { id: '1' } } as unknown as Request;

      await parkingController.getById(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        code: 'SUCCESS',
        message: '查询成功',
        data: mockParking,
      });
    });

    it('不存在时应该调用 next(error)', async () => {
      const error = new NotFoundError('停车场', '999');
      vi.mocked(parkingService.getById).mockRejectedValue(error);

      const req = { params: { id: '999' } } as unknown as Request;

      await parkingController.getById(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('create', () => {
    it('应该创建成功并返回 201', async () => {
      const mockParking = { id: '1', name: '新停车场' };
      vi.mocked(parkingService.create).mockResolvedValue(mockParking as any);

      const req = {
        body: {
          name: '新停车场',
          code: 'PARK-001',
          address: '测试地址',
          totalSpaces: 100,
        },
      } as unknown as Request;

      await parkingController.create(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        code: 'SUCCESS',
        message: '创建成功',
        data: mockParking,
      });
    });

    it('参数无效时应该调用 next(error)', async () => {
      const req = {
        body: { name: '', code: '!' }, // 无效参数：name 为空，code 格式不符
      } as unknown as Request;

      await parkingController.create(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      // ZodError 具有 issues 数组
      expect(error.issues || error.statusCode || error.code).toBeDefined();
    });
  });

  describe('update', () => {
    it('应该更新成功', async () => {
      const mockParking = { id: '1', name: '更新后的名称' };
      vi.mocked(parkingService.update).mockResolvedValue(mockParking as any);

      const req = {
        params: { id: '1' },
        body: { name: '更新后的名称' },
      } as unknown as Request;

      await parkingController.update(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        code: 'SUCCESS',
        message: '更新成功',
        data: mockParking,
      });
    });
  });

  describe('delete', () => {
    it('应该软删除成功', async () => {
      vi.mocked(parkingService.delete).mockResolvedValue(undefined);

      const req = { params: { id: '1' } } as unknown as Request;

      await parkingController.delete(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        code: 'SUCCESS',
        message: '删除成功',
      });
    });

    it('删除不存在的停车场应该调用 next(error)', async () => {
      const error = new NotFoundError('停车场', '999');
      vi.mocked(parkingService.delete).mockRejectedValue(error);

      const req = { params: { id: '999' } } as unknown as Request;

      await parkingController.delete(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});

describe('ParkingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create 应该检查编码唯一性', async () => {
    // 这里可以测试 service 层的校验逻辑
    // 实际项目中需要 mock repository
  });
});

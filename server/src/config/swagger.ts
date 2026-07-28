// Swagger/OpenAPI 配置
// 提供 API 文档和交互式调试界面

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: '智能停车场管理系统 API',
    description: `
## 概述
停车场管理系统后端 API，提供停车场管理、车位管理、车辆进出记录、计费、统计等功能。

## 认证方式
使用 Bearer Token 认证，在请求头中携带：
\`Authorization: Bearer <access_token>\`

## 角色权限
- **superadmin**: 超级管理员，可管理所有停车场
- **admin**: 停车场管理员，可管理所属停车场
- **operator**: 操作员，可执行日常操作
- **cashier**: 收银员，可处理账单
    `,
    version: '1.0.0',
    contact: {
      name: 'Smart Parking Team',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API 基础路径',
    },
  ],
  tags: [
    { name: '认证', description: '登录、登出、刷新 Token' },
    { name: '停车场', description: '停车场 CRUD 操作' },
    { name: '车位', description: '车位管理、批量创建、状态更新' },
    { name: '车辆进出', description: '车辆入场、出场记录' },
    { name: '计费', description: '计费规则配置' },
    { name: '账单', description: '停车账单管理' },
    { name: '统计', description: '实时余位、日报周报' },
  ],
  paths: {
    // ==================== 认证 ====================
    '/auth/login': {
      post: {
        tags: ['认证'],
        summary: '用户登录',
        description: '使用用户名和密码登录，获取访问令牌',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', format: 'password', example: 'admin123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '登录成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'SUCCESS' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string', description: '访问令牌' },
                        refreshToken: { type: 'string', description: '刷新令牌' },
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            username: { type: 'string' },
                            role: { type: 'string', enum: ['superadmin', 'admin', 'operator', 'cashier'] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: '用户名或密码错误' },
          '429': { description: '请求过于频繁' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['认证'],
        summary: '用户登出',
        description: '注销当前用户，将 Token 加入黑名单',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: '登出成功' },
          '401': { description: '未认证或 Token 无效' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['认证'],
        summary: '刷新访问令牌',
        description: '使用 refreshToken 换取新的 accessToken 和 refreshToken',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '刷新成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { description: 'Refresh Token 无效或已过期' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['认证'],
        summary: '获取当前用户信息',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '当前用户信息',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    username: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                    parkingId: { type: 'string', format: 'uuid', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ==================== 停车场 ====================
    '/parkings': {
      get: {
        tags: ['停车场'],
        summary: '停车场列表',
        description: '获取停车场列表（非管理员只能查看自己所属停车场）',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '搜索关键词（名称/编码）' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'suspended'] } },
        ],
        responses: {
          '200': {
            description: '查询成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    list: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Parking' },
                    },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['停车场'],
        summary: '创建停车场',
        description: '创建新的停车场（需要 admin 或 superadmin 权限）',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'code'],
                properties: {
                  name: { type: 'string', example: '中央商务区停车场' },
                  code: { type: 'string', example: 'CBD-001' },
                  address: { type: 'string' },
                  contactPhone: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '创建成功' },
          '400': { description: '参数校验失败（如编码重复）' },
          '403': { description: '权限不足' },
        },
      },
    },
    '/parkings/{id}': {
      get: {
        tags: ['停车场'],
        summary: '停车场详情',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: '查询成功' },
          '404': { description: '停车场不存在' },
        },
      },
      put: {
        tags: ['停车场'],
        summary: '更新停车场',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  address: { type: 'string' },
                  contactPhone: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '更新成功' },
        },
      },
      delete: {
        tags: ['停车场'],
        summary: '删除停车场（软删除）',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: '删除成功' },
        },
      },
    },

    // ==================== 车位 ====================
    '/parkings/{id}/spaces/batch': {
      post: {
        tags: ['车位'],
        summary: '批量创建车位',
        description: '为指定停车场批量生成车位',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['zone', 'count'],
                properties: {
                  zone: { type: 'string', example: 'A', description: '区域代码' },
                  floor: { type: 'integer', default: 1, description: '楼层' },
                  startNumber: { type: 'integer', default: 1, description: '起始编号' },
                  count: { type: 'integer', maximum: 1000, description: '创建数量' },
                  spaceType: { type: 'string', enum: ['normal', 'vip', 'disabled', 'charging'], default: 'normal' },
                  prefix: { type: 'string', description: '车位编码前缀' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '创建成功' },
        },
      },
    },
    '/parking-spaces': {
      get: {
        tags: ['车位'],
        summary: '车位列表',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'parkingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'zone', in: 'query', schema: { type: 'string' } },
          { name: 'floor', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'occupied', 'reserved', 'disabled'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          '200': { description: '查询成功' },
        },
      },
    },

    // ==================== 车辆进出 ====================
    '/vehicle-entry': {
      post: {
        tags: ['车辆进出'],
        summary: '记录车辆入场',
        description: '记录车辆入场信息，支持手动录入和 LPR 自动识别',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['parkingId'],
                properties: {
                  parkingId: { type: 'string', format: 'uuid' },
                  plateNumber: { type: 'string', description: '车牌号（不提供时需传 entryImageUrl）' },
                  vehicleType: { type: 'string', enum: ['small', 'large', 'new_energy', 'unknown'] },
                  entryGateId: { type: 'string', description: '入口闸机 ID' },
                  entryImageUrl: { type: 'string', description: '入场图片 URL（用于 LPR）' },
                  operatorId: { type: 'string', format: 'uuid' },
                  remark: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '入场记录创建成功' },
          '409': { description: '车辆已在场内（重复入场）' },
        },
      },
    },
    '/vehicle-exit': {
      post: {
        tags: ['车辆进出'],
        summary: '记录车辆出场',
        description: '记录车辆出场，自动计算费用并生成账单',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['plateNumber', 'parkingId'],
                properties: {
                  plateNumber: { type: 'string' },
                  parkingId: { type: 'string', format: 'uuid' },
                  exitGateId: { type: 'string' },
                  exitImageUrl: { type: 'string' },
                  operatorId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '出场处理成功' },
          '404': { description: '未找到在场记录' },
        },
      },
    },
    '/vehicle-records': {
      get: {
        tags: ['车辆进出'],
        summary: '进出记录列表',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'parkingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'plateNumber', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['parked', 'exited', 'overstay', 'exception'] } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: '查询成功' },
        },
      },
    },

    // ==================== 计费规则 ====================
    '/billing-rules': {
      get: {
        tags: ['计费'],
        summary: '计费规则列表',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'parkingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
        ],
        responses: {
          '200': { description: '查询成功' },
        },
      },
      post: {
        tags: ['计费'],
        summary: '创建计费规则',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['parkingId', 'subsequentHourRate'],
                properties: {
                  parkingId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  vehicleType: { type: 'string', enum: ['small', 'large', 'new_energy', 'all'], default: 'all' },
                  freeMinutes: { type: 'integer', default: 15 },
                  subsequentHourRate: { type: 'number', description: '每小时费率' },
                  dailyCap: { type: 'number', description: '日封顶金额' },
                  priority: { type: 'integer', default: 0 },
                  effectiveFrom: { type: 'string', format: 'date-time' },
                  effectiveTo: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '创建成功' },
        },
      },
    },

    // ==================== 账单 ====================
    '/bills': {
      get: {
        tags: ['账单'],
        summary: '账单列表',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'parkingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'plateNumber', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'paid', 'refunded', 'waived', 'disputed'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: '查询成功' },
        },
      },
    },

    // ==================== 统计 ====================
    '/stats/realtime': {
      get: {
        tags: ['统计'],
        summary: '实时余位统计',
        description: '获取停车场实时车位余位信息',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'parkingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: '查询成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalSpaces: { type: 'integer' },
                    availableSpaces: { type: 'integer' },
                    occupiedSpaces: { type: 'integer' },
                    occupancyRate: { type: 'number', description: '占用率百分比' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/stats/daily': {
      get: {
        tags: ['统计'],
        summary: '每日统计',
        description: '获取指定日期范围的停车统计',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'parkingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'startDate', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': { description: '查询成功' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Parking: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          code: { type: 'string' },
          address: { type: 'string' },
          contactPhone: { type: 'string' },
          totalSpaces: { type: 'integer' },
          availableSpaces: { type: 'integer' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      VehicleEntryRecord: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          parkingId: { type: 'string', format: 'uuid' },
          plateNumber: { type: 'string' },
          vehicleType: { type: 'string', enum: ['small', 'large', 'new_energy', 'unknown'] },
          entryTime: { type: 'string', format: 'date-time' },
          exitTime: { type: 'string', format: 'date-time', nullable: true },
          entryGateId: { type: 'string' },
          exitGateId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['parked', 'exited', 'overstay', 'exception'] },
          lprConfidence: { type: 'number', nullable: true },
        },
      },
      Bill: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          recordId: { type: 'string', format: 'uuid' },
          parkingId: { type: 'string', format: 'uuid' },
          plateNumber: { type: 'string' },
          durationMinutes: { type: 'integer' },
          amount: { type: 'number' },
          discountAmount: { type: 'number' },
          actualAmount: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'paid', 'refunded', 'waived', 'disputed'] },
          paymentMethod: { type: 'string', enum: ['wechat', 'alipay', 'cash', 'card', 'free', 'month_card'], nullable: true },
          paidAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      BillingRule: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          parkingId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          vehicleType: { type: 'string' },
          freeMinutes: { type: 'integer' },
          subsequentHourRate: { type: 'number' },
          dailyCap: { type: 'number', nullable: true },
          priority: { type: 'integer' },
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      },
      ParkingSpace: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          parkingId: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          zone: { type: 'string' },
          floor: { type: 'integer' },
          spaceType: { type: 'string', enum: ['normal', 'vip', 'disabled', 'charging'] },
          status: { type: 'string', enum: ['available', 'occupied', 'reserved', 'disabled'] },
          currentPlate: { type: 'string', nullable: true },
          currentEntryId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
    },
  },
};

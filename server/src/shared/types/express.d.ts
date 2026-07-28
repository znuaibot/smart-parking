// Express 类型扩展
// 为 Request 注入自定义用户上下文

declare global {
  namespace Express {
    /**
     * 认证用户上下文
     * 由 authenticate 中间件注入到 req.user
     */
    interface User {
      /** 用户 UUID */
      id: string;
      /** 用户角色: superadmin / admin / operator / cashier */
      role: 'superadmin' | 'admin' | 'operator' | 'cashier';
      /** 用户邮箱 */
      email: string;
      /** 用户所属停车场 ID（可选，operator/cashier 通常有） */
      parkingId?: string;
    }

    interface Request {
      /** 请求唯一标识 */
      requestId?: string;
      /** 使用 Bearer Token 的用户 IP */
      ip?: string;
    }
  }
}

export {};

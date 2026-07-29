// 扩展 Express Request 对象，添加 user 属性
// 用于鉴权中间件注入当前用户信息

declare global {
  namespace Express {
    interface User {
      id: string;
      role: 'superadmin' | 'admin' | 'operator' | 'cashier';
      email: string;
      parkingId?: string;
    }

    interface Request {
      user?: User;
      requestId?: string;
    }
  }
}

export {};

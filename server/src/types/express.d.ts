// 扩展 Express Request 对象，添加 user 和 requestId 属性
// 用于鉴权中间件注入当前用户信息

declare namespace Express {
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

export {};

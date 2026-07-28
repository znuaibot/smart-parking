// 统一错误类型定义

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      'NOT_FOUND',
      404,
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  public readonly details: Array<{ field: string; message: string }>;

  constructor(details: Array<{ field: string; message: string }>) {
    super('参数校验失败', 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '未认证或 Token 无效') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '权限不足') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = '请求过于频繁，请稍后重试') {
    super(message, 'TOO_MANY_REQUESTS', 429);
    this.name = 'TooManyRequestsError';
  }
}

export class InternalError extends AppError {
  constructor(message = '服务器内部错误') {
    super(message, 'INTERNAL_ERROR', 500, false);
    this.name = 'InternalError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} 服务暂不可用`, 'SERVICE_UNAVAILABLE', 503);
    this.name = 'ServiceUnavailableError';
  }
}

// ==================== 业务错误补充 ====================

/**
 * Supabase 错误 - 包装 Supabase 返回的错误
 */
export class SupabaseError extends AppError {
  public readonly supabaseCode?: string;
  public readonly supabaseDetails?: string;
  public readonly supabaseHint?: string;

  constructor(message: string, originalError?: {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  }) {
    super(message, 'SUPABASE_ERROR', 500, false);
    this.name = 'SupabaseError';
    this.supabaseCode = originalError?.code;
    this.supabaseDetails = originalError?.details;
    this.supabaseHint = originalError?.hint;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.supabaseDetails,
      hint: this.supabaseHint,
    };
  }
}

/**
 * 车牌识别失败错误
 */
export class LPRFailedError extends AppError {
  public readonly plateNumber?: string;
  public readonly confidence?: number;
  public readonly imageUrl?: string;

  constructor(message: string, options?: {
    plateNumber?: string;
    confidence?: number;
    imageUrl?: string;
  }) {
    super(message, 'LPR_FAILED', 422);
    this.name = 'LPRFailedError';
    this.plateNumber = options?.plateNumber;
    this.confidence = options?.confidence;
    this.imageUrl = options?.imageUrl;
  }
}

/**
 * 支付失败错误
 */
export class PaymentFailedError extends AppError {
  public readonly orderId?: string;
  public readonly amount?: number;
  public readonly paymentMethod?: string;
  public readonly reason?: string;

  constructor(message: string, options?: {
    orderId?: string;
    amount?: number;
    paymentMethod?: string;
    reason?: string;
  }) {
    super(message, 'PAYMENT_FAILED', 402);
    this.name = 'PaymentFailedError';
    this.orderId = options?.orderId;
    this.amount = options?.amount;
    this.paymentMethod = options?.paymentMethod;
    this.reason = options?.reason;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      orderId: this.orderId,
      amount: this.amount,
      paymentMethod: this.paymentMethod,
      reason: this.reason,
    };
  }
}

/**
 * Token 过期错误
 */
export class TokenExpiredError extends AppError {
  constructor(message = '访问令牌已过期') {
    super(message, 'TOKEN_EXPIRED', 401);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Token 刷新失败错误
 */
export class TokenRefreshError extends AppError {
  constructor(message = '无法刷新令牌，请重新登录') {
    super(message, 'TOKEN_REFRESH_FAILED', 401);
    this.name = 'TokenRefreshError';
  }
}

/**
 * 账号已禁用错误
 */
export class AccountDisabledError extends AppError {
  constructor(message = '账号已被禁用，请联系管理员') {
    super(message, 'ACCOUNT_DISABLED', 403);
    this.name = 'AccountDisabledError';
  }
}

/**
 * 密码错误错误
 */
export class InvalidCredentialsError extends AppError {
  constructor(message = '用户名或密码错误') {
    super(message, 'INVALID_CREDENTIALS', 401);
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * 停车场已满错误
 */
export class ParkingFullError extends AppError {
  constructor(parkingId: string, message = '停车场已满，暂无可用车位') {
    super(message, 'PARKING_FULL', 409);
    this.name = 'ParkingFullError';
  }
}

/**
 * 车辆已入场错误
 */
export class VehicleAlreadyParkedError extends AppError {
  constructor(plateNumber: string) {
    super(`车辆 ${plateNumber} 已在停车场内`, 'VEHICLE_ALREADY_PARKED', 409);
    this.name = 'VehicleAlreadyParkedError';
  }
}

/**
 * 车辆未入场错误
 */
export class VehicleNotParkedError extends AppError {
  constructor(plateNumber: string) {
    super(`车辆 ${plateNumber} 未在停车场内`, 'VEHICLE_NOT_PARKED', 404);
    this.name = 'VehicleNotParkedError';
  }
}

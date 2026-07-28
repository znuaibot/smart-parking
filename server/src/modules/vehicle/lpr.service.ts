// 车牌识别服务 (License Plate Recognition)
import axios from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { ServiceUnavailableError } from '../../shared/types/errors.js';

/**
 * LPR 识别结果
 */
export interface LPRResult {
  plateNumber: string;
  confidence: number;
  vehicleType?: 'small' | 'large' | 'new_energy' | 'unknown';
  imageUrl?: string;
}

/**
 * 车牌识别服务
 * 负责调用外部 LPR API 或内置识别逻辑
 */
export class LPRService {
  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiUrl = config.LPR_API_URL;
    this.apiKey = config.LPR_API_KEY;
  }

  /**
   * 识别车牌
   * @param imageUrl 图片 URL 或 base64 数据
   * @returns 识别结果
   */
  async recognize(imageUrl: string): Promise<LPRResult> {
    // 如果没有配置外部 LPR API，使用模拟识别
    if (!this.apiUrl) {
      logger.warn('LPR API not configured, using mock recognition');
      return this.mockRecognize(imageUrl);
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        { image_url: imageUrl },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          timeout: 10000,
        },
      );

      const result = response.data;
      return {
        plateNumber: result.plate_number || result.plateNumber,
        confidence: result.confidence || 0,
        vehicleType: this.mapVehicleType(result.vehicle_type || result.vehicleType),
        imageUrl,
      };
    } catch (error: any) {
      logger.error('LPR API call failed', { error: error.message, imageUrl });
      throw new ServiceUnavailableError('车牌识别服务');
    }
  }

  /**
   * 批量识别
   */
  async recognizeBatch(imageUrls: string[]): Promise<LPRResult[]> {
    const results: LPRResult[] = [];
    for (const url of imageUrls) {
      try {
        const result = await this.recognize(url);
        results.push(result);
      } catch (error) {
        logger.warn('Batch LPR partial failure', { url, error });
      }
    }
    return results;
  }

  /**
   * 外部 API 车型映射
   */
  private mapVehicleType(type: string | undefined): 'small' | 'large' | 'new_energy' | 'unknown' {
    if (!type) return 'unknown';

    switch (type.toLowerCase()) {
      case 'small':
      case '轿车':
      case '面包车':
        return 'small';
      case 'large':
      case '货车':
      case '客车':
        return 'large';
      case 'new_energy':
      case '新能源':
        return 'new_energy';
      default:
        return 'unknown';
    }
  }

  /**
   * 模拟 LPR 识别（测试用）
   * 当没有配置外部 API 时使用
   */
  private mockRecognize(imageUrl: string): Promise<LPRResult> {
    // 模拟异步处理
    return new Promise(resolve => {
      setTimeout(() => {
        // 生成模拟车牌（仅用于开发和测试）
        const prefixes = ['京', '沪', '粤', '苏', '浙'];
        const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const letter = letters[Math.floor(Math.random() * letters.length)];
        const numbers = String(Math.floor(Math.random() * 90000) + 10000);

        resolve({
          plateNumber: `${prefix}${letter}${numbers}`,
          confidence: 0.95,
          vehicleType: 'small',
          imageUrl,
        });
      }, 100);
    });
  }
}

// 单例导出
export const lprService = new LPRService();

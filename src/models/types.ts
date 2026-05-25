export interface Source {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  url: string; // 商品所在URL
  createdAt?: string; // 首次导入时间
  updatedAt?: string; // 最近更新URL记录的时间
  lastCheckedAt?: string; // 最近一次工作流检查时间
  lastError?: string; // 最近一次处理错误信息
  isInvalid?: boolean; // 是否已手动标记为失效URL
  invalidAt?: string; // 手动标记失效的时间
}

export interface Product {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  name: string; // 商品名称
  spec: string; // 商品规格
  url: string; // 商品所在URL
  stock: number; // 商品库存
  price: number; // 商品价格
  updatedAt?: string; // 最近一次更新商品信息的时间
}

export type ProductAlertHitType = 'missing' | 'price_increase' | 'low_stock';

export interface ProductAlert {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  url: string; // 商品所在URL
  name: string; // 商品名称
  spec: string; // 商品规格
  hitTypes: ProductAlertHitType[]; // 本次命中的异常类型
  previousPrice?: number; // 数据库中原价格
  currentPrice?: number; // 本次获取到的新价格
  previousStock?: number; // 数据库中原库存
  currentStock?: number; // 本次获取到的新库存
  stockThreshold: number; // 低库存阈值
  checkedAt: string; // 本次工作流检查时间
}

export interface AppSettings {
  id: 'global'; // 全局设置记录固定主键
  monitorHourlyRate: number; // 每小时监控请求数
  stockAlertThreshold: number; // 库存预警阈值
  updatedAt: string; // 最近一次设置更新时间
}

export interface WorkflowSummary {
  totalUrls: number;
  succeededUrls: number;
  failedUrls: number;
  skippedInvalidUrls: number;
  updatedProducts: number;
  zeroedProducts: number;
  alertRecordsCreated: number;
  errors: Array<{
    url: string;
    message: string;
  }>;
}

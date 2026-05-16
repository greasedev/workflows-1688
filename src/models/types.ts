export interface Source {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  url: string; // 商品所在URL
  createdAt?: string; // 首次导入时间
  updatedAt?: string; // 最近更新URL记录的时间
  lastCheckedAt?: string; // 最近一次工作流检查时间
  lastError?: string; // 最近一次处理错误信息
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

export interface WorkflowSummary {
  totalUrls: number;
  succeededUrls: number;
  failedUrls: number;
  updatedProducts: number;
  zeroedProducts: number;
  errors: Array<{
    url: string;
    message: string;
  }>;
}

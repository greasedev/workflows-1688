export interface Source {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  url: string; // 商品所在URL
}

export interface Product {
  id?: number; // 数据库自增主键（可选，仅在数据库记录中存在）
  name: string; // 商品名称
  url: string; // 商品所在URL
  stock: number; // 商品库存
  price: number; // 商品价格
}
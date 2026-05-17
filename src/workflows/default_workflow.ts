/**
 * ---
 * name: 监控URL
 * description: "批量更新已导入URL中的商品价格和库存"
 *
 * output:
 * - success: bool
 * - message: string
 * - data:
 *   - totalUrls: number
 *   - succeededUrls: number
 *   - failedUrls: number
 *   - skippedInvalidUrls: number
 *   - updatedProducts: number
 *   - zeroedProducts: number
 *   - alertRecordsCreated: number
 *   - errors: array
 * ---
 */

import { Agent, type Dexie, type WorkflowContext, type WorkflowResult } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis, type ExecutionResult } from '../api';
import { DB_TABLES, initDB } from '../libs/db';
import { getAppSettings } from '../libs/settings';
import type { AppSettings, Product, ProductAlert, ProductAlertHitType, Source, WorkflowSummary } from '../models/types';

type RawProduct = Record<string, unknown>;
type WorkflowApis = ReturnType<typeof createWorkflowApis>;
type ProductTable = Dexie.Table<Product, number>;
type ProductAlertTable = Dexie.Table<ProductAlert, number>;
type SourceTable = Dexie.Table<Source, number>;
type SettingsTable = Dexie.Table<AppSettings, string>;
type SourceProcessResult = Pick<
  WorkflowSummary,
  'succeededUrls' | 'failedUrls' | 'updatedProducts' | 'zeroedProducts' | 'alertRecordsCreated' | 'errors'
>;

const ARRAY_KEYS = ['products', 'skus', 'data', 'items', 'list', 'result'];
const NAME_KEYS = ['name', 'title', 'productName', 'skuName', '商品名称', '商品名字', '名称'];
const SPEC_KEYS = ['spec', 'specification', '规格', '商品规格'];
const PRICE_KEYS = ['price', 'salePrice', 'offerPrice', 'amount', '价格', '售价'];
const STOCK_KEYS = ['stock', 'inventory', 'quantity', '库存', '库存数', '数量'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('API extract_data is not valid JSON');
  }
}

function findProductArray(value: unknown): RawProduct[] {
  if (typeof value === 'string') {
    return findProductArray(parseJsonValue(value));
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is RawProduct => item !== null && typeof item === 'object' && !Array.isArray(item));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  for (const key of ARRAY_KEYS) {
    const candidate = record[key];
    const products = findProductArray(candidate);
    if (products.length > 0) {
      return products;
    }
  }

  return [];
}

function readFirstString(record: RawProduct, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function readFirstNumber(record: RawProduct, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const normalized = String(value).replace(/[,，¥￥\s]/g, '').trim();
    const match = normalized.match(/-?\d+(\.\d+)?/);
    if (!match) continue;

    const number = Number(match[0]);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeProducts(rawProducts: RawProduct[], url: string, updatedAt: string): Product[] {
  const productsByKey = new Map<string, Product>();

  for (const rawProduct of rawProducts) {
    const name = readFirstString(rawProduct, NAME_KEYS);
    const spec = readFirstString(rawProduct, SPEC_KEYS) || '-';
    const price = readFirstNumber(rawProduct, PRICE_KEYS);
    const stock = readFirstNumber(rawProduct, STOCK_KEYS);

    if (!name || !spec || price === null || stock === null) {
      continue;
    }

    productsByKey.set(productKey({ name, spec, url }), {
      name,
      spec,
      url,
      price,
      stock,
      updatedAt,
    });
  }

  return Array.from(productsByKey.values());
}

function productKey(product: Pick<Product, 'name' | 'spec' | 'url'>): string {
  return `${product.url}\u0000${product.name}\u0000${product.spec}`;
}

function buildProductMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((product) => [productKey(product), product]));
}

function createProductAlert(
  product: Pick<Product, 'name' | 'spec' | 'url'>,
  hitTypes: ProductAlertHitType[],
  checkedAt: string,
  stockAlertThreshold: number,
  values: Pick<
    ProductAlert,
    'previousPrice' | 'currentPrice' | 'previousStock' | 'currentStock'
  >,
): ProductAlert {
  return {
    url: product.url,
    name: product.name,
    spec: product.spec,
    hitTypes,
    stockThreshold: stockAlertThreshold,
    checkedAt,
    ...values,
  };
}

function buildProductAlerts(
  existingProducts: Product[],
  currentProducts: Product[],
  checkedAt: string,
  stockAlertThreshold: number,
): ProductAlert[] {
  const alerts: ProductAlert[] = [];
  const existingByKey = buildProductMap(existingProducts);
  const currentByKey = buildProductMap(currentProducts);

  for (const currentProduct of currentProducts) {
    const existingProduct = existingByKey.get(productKey(currentProduct));
    const hitTypes: ProductAlertHitType[] = [];

    if (existingProduct && existingProduct.price < currentProduct.price) {
      hitTypes.push('price_increase');
    }
    if (currentProduct.stock < stockAlertThreshold) {
      hitTypes.push('low_stock');
    }
    if (hitTypes.length === 0) {
      continue;
    }

    alerts.push(createProductAlert(currentProduct, hitTypes, checkedAt, stockAlertThreshold, {
      previousPrice: existingProduct?.price,
      currentPrice: currentProduct.price,
      previousStock: existingProduct?.stock,
      currentStock: currentProduct.stock,
    }));
  }

  for (const existingProduct of existingProducts) {
    if (currentByKey.has(productKey(existingProduct)) || existingProduct.stock === 0) {
      continue;
    }

    alerts.push(createProductAlert(existingProduct, ['missing'], checkedAt, stockAlertThreshold, {
      previousPrice: existingProduct.price,
      previousStock: existingProduct.stock,
    }));
  }

  return alerts;
}

function extractProducts(result: ExecutionResult, url: string, updatedAt: string): Product[] {
  if (!result.success) {
    throw new Error(result.error || 'API call failed');
  }

  if (!result.task?.extract_data) {
    throw new Error('API response did not include extract_data');
  }

  const rawProducts = findProductArray(result.task.extract_data);
  if (rawProducts.length === 0) {
    throw new Error('API response did not include a recognizable product array');
  }

  const products = normalizeProducts(rawProducts, url, updatedAt);
  if (products.length === 0) {
    throw new Error('API product array did not include any valid products');
  }

  return products;
}

async function upsertProduct(productTable: Dexie.Table<Product, number>, product: Product) {
  const existing = await productTable
    .where('[name+spec+url]')
    .equals([product.name, product.spec, product.url])
    .first() as Product | undefined;

  await productTable.put({
    ...existing,
    ...product,
  });
}

function emptySourceProcessResult(): SourceProcessResult {
  return {
    succeededUrls: 0,
    failedUrls: 0,
    updatedProducts: 0,
    zeroedProducts: 0,
    alertRecordsCreated: 0,
    errors: [],
  };
}

function chunkSources(sources: Source[], batchSize: number): Source[][] {
  const batches: Source[][] = [];
  for (let index = 0; index < sources.length; index += batchSize) {
    batches.push(sources.slice(index, index + batchSize));
  }
  return batches;
}

function applyProcessResult(summary: WorkflowSummary, result: SourceProcessResult) {
  summary.succeededUrls += result.succeededUrls;
  summary.failedUrls += result.failedUrls;
  summary.updatedProducts += result.updatedProducts;
  summary.zeroedProducts += result.zeroedProducts;
  summary.alertRecordsCreated += result.alertRecordsCreated;
  summary.errors.push(...result.errors);
}

async function processSource(
  source: Source,
  apis: WorkflowApis,
  db: Dexie,
  sourceTable: SourceTable,
  productTable: ProductTable,
  productAlertTable: ProductAlertTable,
  stockAlertThreshold: number,
): Promise<SourceProcessResult> {
  const checkedAt = new Date().toISOString();
  const resultSummary = emptySourceProcessResult();

  try {
    const result = await apis.get_sku_list_from_url(source.url);
    const products = extractProducts(result, source.url, checkedAt);

    const successCounts = await db.transaction('rw', sourceTable, productTable, productAlertTable, async () => {
      const counts = {
        updatedProducts: 0,
        zeroedProducts: 0,
        alertRecordsCreated: 0,
      };
      const existingProducts = await productTable.where('url').equals(source.url).toArray() as Product[];
      const currentProductKeys = new Set(products.map(productKey));
      const alerts = buildProductAlerts(existingProducts, products, checkedAt, stockAlertThreshold);

      if (alerts.length > 0) {
        await productAlertTable.bulkAdd(alerts);
        counts.alertRecordsCreated += alerts.length;
      }

      for (const product of products) {
        await upsertProduct(productTable, product);
        counts.updatedProducts += 1;
      }

      for (const existingProduct of existingProducts) {
        if (currentProductKeys.has(productKey(existingProduct)) || existingProduct.stock === 0) {
          continue;
        }

        if (existingProduct.id === undefined) {
          continue;
        }

        await productTable.update(existingProduct.id, {
          stock: 0,
          updatedAt: checkedAt,
        });
        counts.zeroedProducts += 1;
      }

      if (source.id !== undefined) {
        await sourceTable.update(source.id, {
          lastCheckedAt: checkedAt,
          lastError: undefined,
          updatedAt: checkedAt,
        });
      }

      return counts;
    });

    resultSummary.updatedProducts = successCounts.updatedProducts;
    resultSummary.zeroedProducts = successCounts.zeroedProducts;
    resultSummary.alertRecordsCreated = successCounts.alertRecordsCreated;
    resultSummary.succeededUrls = 1;
  } catch (error) {
    const message = errorMessage(error);
    resultSummary.failedUrls = 1;
    resultSummary.errors.push({ url: source.url, message });

    try {
      if (source.id !== undefined) {
        await sourceTable.update(source.id, {
          lastCheckedAt: checkedAt,
          lastError: message,
          updatedAt: checkedAt,
        });
      }
    } catch (statusError) {
      resultSummary.errors.push({
        url: source.url,
        message: `Failed to record URL error status: ${errorMessage(statusError)}`,
      });
    }
  }

  return resultSummary;
}

// Main workflow entry point
export async function execute(context: WorkflowContext): Promise<WorkflowResult> {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = initDB(agent);
  const sourceTable = db.table<Source, number>(DB_TABLES.source);
  const productTable = db.table<Product, number>(DB_TABLES.product);
  const productAlertTable = db.table<ProductAlert, number>(DB_TABLES.productAlert);
  const settingsTable: SettingsTable = db.table<AppSettings, string>(DB_TABLES.settings);
  const settings = await getAppSettings(settingsTable);
  const allSources = await sourceTable.toArray();
  const sources = allSources.filter((source) => source.isInvalid !== true);
  const summary: WorkflowSummary = {
    totalUrls: sources.length,
    succeededUrls: 0,
    failedUrls: 0,
    skippedInvalidUrls: allSources.length - sources.length,
    updatedProducts: 0,
    zeroedProducts: 0,
    alertRecordsCreated: 0,
    errors: [],
  };

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log('Executing product monitor workflow...');

  const batches = chunkSources(sources, settings.monitorMaxConcurrency);
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map((source) => processSource(
        source,
        apis,
        db,
        sourceTable,
        productTable,
        productAlertTable,
        settings.stockAlertThreshold,
      )),
    );
    for (const batchResult of batchResults) {
      applyProcessResult(summary, batchResult);
    }
  }

  const result: WorkflowResult & { data: WorkflowSummary } = {
    success: summary.failedUrls === 0,
    message: `Workflow completed in ${batches.length} batches of up to ${settings.monitorMaxConcurrency}: ${summary.succeededUrls}/${summary.totalUrls} URLs succeeded, ${summary.skippedInvalidUrls} invalid URLs skipped, ${summary.updatedProducts} products updated, ${summary.zeroedProducts} products marked out of stock, ${summary.alertRecordsCreated} alert records created.`,
    data: summary,
  };

  return result;
}
// @ts-ignore
globalThis.execute = execute;

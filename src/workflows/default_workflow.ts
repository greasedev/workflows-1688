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
 * 
 * Failed URLs are retried once after the first pass completes.
 * 
 * version:
 * - 1
 * 
 * ---
 */

import { Agent, type Dexie, type WorkflowContext, type WorkflowResult } from '@greasedev/workflow-sdk';
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
type ProcessedSourceResult = {
  source: Source;
  result: SourceProcessResult;
};
type NormalizedProducts = {
  products: Product[];
  explicitlyOfflineProductKeys: Set<string>;
};

const ARRAY_KEYS = ['products', 'skus', 'data', 'items', 'list', 'result'];
const NAME_KEYS = ['name', 'title'];
const SPEC_KEYS = ['spec'];
const PRICE_KEYS = ['price'];
const STOCK_KEYS = ['stock', 'stock_num_sum'];
const JINRITEMAI_URL_KEYS = ['url'];
const JINRITEMAI_OFFLINE_KEY = 'live_add_enum';
const JINRITEMAI_DOMAIN = 'jinritemai.com';
const CAPTCHA_REQUIRED_MESSAGE = 'captcha-required';
const ONE_HOUR_MS = 60 * 60 * 1000;
const UNKNOWN_STOCK = -1;

class WorkflowUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowUserError';
  }
}

class CaptchaRequiredError extends WorkflowUserError {
  processResult?: SourceProcessResult;
  processedResults?: ProcessedSourceResult[];

  constructor(message: string) {
    super(message);
    this.name = 'CaptchaRequiredError';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof WorkflowUserError) {
    return error.message;
  }
  if (error instanceof Error) {
    return `商品监控处理失败：${error.message}`;
  }
  return `商品监控处理失败：${String(error)}`;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new WorkflowUserError('商品提取结果不是有效的 JSON。');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeExtractData(value: unknown): unknown {
  return typeof value === 'string' ? parseJsonValue(value) : value;
}

function isCaptchaRequiredExtractData(value: unknown): boolean {
  const extractData = normalizeExtractData(value);
  return Array.isArray(extractData) && extractData[0] === CAPTCHA_REQUIRED_MESSAGE;
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

function isJinritemaiUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === JINRITEMAI_DOMAIN || hostname.endsWith(`.${JINRITEMAI_DOMAIN}`);
  } catch {
    return false;
  }
}

function normalizeUrlForMatch(value: unknown): string | null {
  const url = String(value ?? '').trim();
  if (!url) return null;

  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

function isJinritemaiProductOffline(rawProduct: RawProduct): boolean {
  return String(rawProduct[JINRITEMAI_OFFLINE_KEY] ?? '').includes('下架');
}

function convertJinritemaiPriceToYuan(priceInCents: number): number {
  return Math.round(priceInCents) / 100;
}

function normalizeProducts(rawProducts: RawProduct[], url: string, updatedAt: string): Product[] {
  const productsByKey = new Map<string, Product>();

  for (const rawProduct of rawProducts) {
    const name = readFirstString(rawProduct, NAME_KEYS);
    const spec = readFirstString(rawProduct, SPEC_KEYS) || '-';
    const price = readFirstNumber(rawProduct, PRICE_KEYS);
    const stock = readFirstNumber(rawProduct, STOCK_KEYS) ?? UNKNOWN_STOCK;

    if (!name || !spec || price === null) {
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

function normalizeJinritemaiProducts(
  rawProducts: RawProduct[],
  url: string,
  updatedAt: string,
  existingProducts: Product[],
): NormalizedProducts {
  const existingByKey = buildProductMap(existingProducts);
  const productsByKey = new Map<string, Product>();
  const explicitlyOfflineProductKeys = new Set<string>();

  for (const rawProduct of rawProducts) {
    const name = readFirstString(rawProduct, NAME_KEYS);
    const spec = readFirstString(rawProduct, SPEC_KEYS) || '-';
    const offline = isJinritemaiProductOffline(rawProduct);

    if (!name) {
      continue;
    }

    const key = productKey({ name, spec, url });
    const existingProduct = existingByKey.get(key);
    const parsedPriceInCents = readFirstNumber(rawProduct, PRICE_KEYS);
    const priceInYuan =
      parsedPriceInCents === null ? null : convertJinritemaiPriceToYuan(parsedPriceInCents);
    if (!offline && priceInYuan === null) {
      continue;
    }
    if (!offline && explicitlyOfflineProductKeys.has(key)) {
      continue;
    }

    productsByKey.set(key, {
      name,
      spec,
      url,
      price: priceInYuan ?? existingProduct?.price ?? 0,
      stock: offline ? 0 : readFirstNumber(rawProduct, STOCK_KEYS) ?? UNKNOWN_STOCK,
      updatedAt,
    });

    if (offline) {
      explicitlyOfflineProductKeys.add(key);
    }
  }

  return {
    products: Array.from(productsByKey.values()),
    explicitlyOfflineProductKeys,
  };
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
  enabledAlertTypes: Set<ProductAlertHitType>,
  explicitlyOfflineProductKeys = new Set<string>(),
): ProductAlert[] {
  const alerts: ProductAlert[] = [];
  const existingByKey = buildProductMap(existingProducts);
  const currentByKey = buildProductMap(currentProducts);

  for (const currentProduct of currentProducts) {
    const existingProduct = existingByKey.get(productKey(currentProduct));
    if (explicitlyOfflineProductKeys.has(productKey(currentProduct))) {
      if (
        enabledAlertTypes.has('missing') &&
        (!existingProduct || existingProduct.stock !== 0)
      ) {
        alerts.push(createProductAlert(currentProduct, ['missing'], checkedAt, stockAlertThreshold, {
          previousPrice: existingProduct?.price,
          previousStock: existingProduct?.stock,
        }));
      }
      continue;
    }

    const hitTypes: ProductAlertHitType[] = [];

    if (
      enabledAlertTypes.has('price_increase') &&
      existingProduct &&
      existingProduct.price < currentProduct.price
    ) {
      hitTypes.push('price_increase');
    }
    const isCurrentLowStock =
      currentProduct.stock >= 0 && currentProduct.stock < stockAlertThreshold;
    const wasExistingLowStock = existingProduct
      ? existingProduct.stock >= 0 && existingProduct.stock < stockAlertThreshold
      : false;
    if (enabledAlertTypes.has('low_stock') && isCurrentLowStock && !wasExistingLowStock) {
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
    if (
      !enabledAlertTypes.has('missing') ||
      currentByKey.has(productKey(existingProduct)) ||
      existingProduct.stock === 0
    ) {
      continue;
    }

    alerts.push(createProductAlert(existingProduct, ['missing'], checkedAt, stockAlertThreshold, {
      previousPrice: existingProduct.price,
      previousStock: existingProduct.stock,
    }));
  }

  return alerts;
}

function extractRawProducts(result: ExecutionResult): RawProduct[] {
  if (!result.success) {
    throw new WorkflowUserError(
      result.error ? `商品提取接口调用失败：${result.error}` : '商品提取接口调用失败。',
    );
  }

  if (!result.task?.extract_data) {
    throw new WorkflowUserError('商品提取接口未返回提取结果。');
  }

  const extractData = result.task.extract_data;
  if (isCaptchaRequiredExtractData(extractData)) {
    throw new CaptchaRequiredError('商品提取触发验证码，请人工处理后重试。');
  }

  const rawProducts = findProductArray(extractData);
  if (rawProducts.length === 0) {
    throw new WorkflowUserError('商品提取结果中未找到可识别的商品列表。');
  }

  return rawProducts;
}

function extractProducts(result: ExecutionResult, url: string, updatedAt: string): Product[] {
  const rawProducts = extractRawProducts(result);
  const products = normalizeProducts(rawProducts, url, updatedAt);
  if (products.length === 0) {
    throw new WorkflowUserError('商品列表中没有可写入的有效商品。');
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

function applyProcessResult(summary: WorkflowSummary, result: SourceProcessResult) {
  summary.succeededUrls += result.succeededUrls;
  summary.failedUrls += result.failedUrls;
  summary.updatedProducts += result.updatedProducts;
  summary.zeroedProducts += result.zeroedProducts;
  summary.alertRecordsCreated += result.alertRecordsCreated;
  summary.errors.push(...result.errors);
}

async function recordSourceFailure(
  source: Source,
  sourceTable: SourceTable,
  checkedAt: string,
  error: unknown,
): Promise<SourceProcessResult> {
  const result = emptySourceProcessResult();
  const message = errorMessage(error);
  result.failedUrls = 1;
  result.errors.push({ url: source.url, message });

  try {
    if (source.id !== undefined) {
      await sourceTable.update(source.id, {
        lastCheckedAt: checkedAt,
        lastError: message,
        updatedAt: checkedAt,
      });
    }
  } catch (statusError) {
    result.errors.push({
      url: source.url,
      message: `记录 URL 错误状态失败：${errorMessage(statusError)}`,
    });
  }

  return result;
}

async function persistSourceProducts(
  source: Source,
  normalizedProducts: NormalizedProducts,
  checkedAt: string,
  db: Dexie,
  sourceTable: SourceTable,
  productTable: ProductTable,
  productAlertTable: ProductAlertTable,
  stockAlertThreshold: number,
  enabledAlertTypes: ProductAlertHitType[],
): Promise<SourceProcessResult> {
  const resultSummary = emptySourceProcessResult();
  const { products, explicitlyOfflineProductKeys } = normalizedProducts;

  const successCounts = await db.transaction('rw', sourceTable, productTable, productAlertTable, async () => {
    const counts = {
      updatedProducts: 0,
      zeroedProducts: 0,
      alertRecordsCreated: 0,
    };
    const existingProducts = await productTable.where('url').equals(source.url).toArray() as Product[];
    const existingByKey = buildProductMap(existingProducts);
    const currentProductKeys = new Set(products.map(productKey));
    const alerts = buildProductAlerts(
      existingProducts,
      products,
      checkedAt,
      stockAlertThreshold,
      new Set(enabledAlertTypes),
      explicitlyOfflineProductKeys,
    );

    if (alerts.length > 0) {
      await productAlertTable.bulkAdd(alerts);
      counts.alertRecordsCreated += alerts.length;
    }

    for (const product of products) {
      const existingProduct = existingByKey.get(productKey(product));
      if (
        explicitlyOfflineProductKeys.has(productKey(product)) &&
        existingProduct &&
        existingProduct.stock !== 0
      ) {
        counts.zeroedProducts += 1;
      }
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
  return resultSummary;
}

async function processSource(
  source: Source,
  apis: WorkflowApis,
  db: Dexie,
  sourceTable: SourceTable,
  productTable: ProductTable,
  productAlertTable: ProductAlertTable,
  stockAlertThreshold: number,
  enabledAlertTypes: ProductAlertHitType[],
): Promise<SourceProcessResult> {
  const checkedAt = new Date().toISOString();

  try {
    const result = await apis.www_1688_com_get_sku_list_from_ur_0fuwor(source.url);
    const products = extractProducts(result, source.url, checkedAt);
    return await persistSourceProducts(
      source,
      { products, explicitlyOfflineProductKeys: new Set<string>() },
      checkedAt,
      db,
      sourceTable,
      productTable,
      productAlertTable,
      stockAlertThreshold,
      enabledAlertTypes,
    );
  } catch (error) {
    const resultSummary = await recordSourceFailure(source, sourceTable, checkedAt, error);
    if (error instanceof CaptchaRequiredError) {
      error.processResult = resultSummary;
      throw error;
    }
    return resultSummary;
  }
}

async function processJinritemaiSources(
  sources: Source[],
  apis: WorkflowApis,
  db: Dexie,
  sourceTable: SourceTable,
  productTable: ProductTable,
  productAlertTable: ProductAlertTable,
  stockAlertThreshold: number,
  enabledAlertTypes: ProductAlertHitType[],
): Promise<ProcessedSourceResult[]> {
  if (sources.length === 0) {
    return [];
  }

  const checkedAt = new Date().toISOString();
  let rawProducts: RawProduct[];

  try {
    const result = await apis.buyin_jinritemai_com_get_douyin_product_d_o2bup6(
      JSON.stringify(sources.map((source) => source.url)),
    );
    rawProducts = extractRawProducts(result);
  } catch (error) {
    const processedResults = await Promise.all(
      sources.map(async (source) => ({
        source,
        result: await recordSourceFailure(source, sourceTable, checkedAt, error),
      })),
    );

    if (error instanceof CaptchaRequiredError) {
      error.processedResults = processedResults;
      throw error;
    }
    return processedResults;
  }

  const sourcesByNormalizedUrl = new Map<string, Source>();
  for (const source of sources) {
    const normalizedUrl = normalizeUrlForMatch(source.url);
    if (normalizedUrl) {
      sourcesByNormalizedUrl.set(normalizedUrl, source);
    }
  }

  const rawProductsBySourceUrl = new Map<string, RawProduct[]>();
  for (const rawProduct of rawProducts) {
    const rawProductUrl = normalizeUrlForMatch(readFirstString(rawProduct, JINRITEMAI_URL_KEYS));
    const source = rawProductUrl ? sourcesByNormalizedUrl.get(rawProductUrl) : undefined;
    if (!source) {
      continue;
    }
    const sourceProducts = rawProductsBySourceUrl.get(source.url) ?? [];
    sourceProducts.push(rawProduct);
    rawProductsBySourceUrl.set(source.url, sourceProducts);
  }

  const processedResults: ProcessedSourceResult[] = [];
  for (const source of sources) {
    try {
      const sourceRawProducts = rawProductsBySourceUrl.get(source.url) ?? [];
      const existingProducts = await productTable.where('url').equals(source.url).toArray() as Product[];
      const normalizedProducts = normalizeJinritemaiProducts(
        sourceRawProducts,
        source.url,
        checkedAt,
        existingProducts,
      );
      if (normalizedProducts.products.length === 0) {
        throw new WorkflowUserError('批量商品提取结果中未找到该 URL 的可写入商品。');
      }

      processedResults.push({
        source,
        result: await persistSourceProducts(
          source,
          normalizedProducts,
          checkedAt,
          db,
          sourceTable,
          productTable,
          productAlertTable,
          stockAlertThreshold,
          enabledAlertTypes,
        ),
      });
    } catch (error) {
      processedResults.push({
        source,
        result: await recordSourceFailure(source, sourceTable, checkedAt, error),
      });
    }
  }

  return processedResults;
}

async function processSourcesSequentially(
  sources: Source[],
  apis: WorkflowApis,
  db: Dexie,
  sourceTable: SourceTable,
  productTable: ProductTable,
  productAlertTable: ProductAlertTable,
  stockAlertThreshold: number,
  enabledAlertTypes: ProductAlertHitType[],
  monitorHourlyRate: number,
): Promise<ProcessedSourceResult[]> {
  const processedResults: ProcessedSourceResult[] = [];
  const requestIntervalMs = ONE_HOUR_MS / monitorHourlyRate;

  for (const [index, source] of sources.entries()) {
    const requestStartedAt = Date.now();
    try {
      const processedResult = {
        source,
        result: await processSource(
          source,
          apis,
          db,
          sourceTable,
          productTable,
          productAlertTable,
          stockAlertThreshold,
          enabledAlertTypes,
        ),
      };
      processedResults.push(processedResult);
    } catch (error) {
      if (error instanceof CaptchaRequiredError) {
        processedResults.push({
          source,
          result: error.processResult ?? {
            ...emptySourceProcessResult(),
            failedUrls: 1,
            errors: [{ url: source.url, message: error.message }],
          },
        });
        error.processedResults = processedResults;
      }
      throw error;
    }

    if (index < sources.length - 1) {
      const elapsedMs = Date.now() - requestStartedAt;
      const remainingIntervalMs = Math.max(0, requestIntervalMs - elapsedMs);
      if (remainingIntervalMs > 0) {
        await delay(remainingIntervalMs);
      }
    }
  }

  return processedResults;
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
  const jinritemaiSources = sources.filter((source) => isJinritemaiUrl(source.url));
  const sequentialSources = sources.filter((source) => !isJinritemaiUrl(source.url));
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

  let retriedFailedSourceCount = 0;

  try {
    const firstJinritemaiPassResults = await processJinritemaiSources(
      jinritemaiSources,
      apis,
      db,
      sourceTable,
      productTable,
      productAlertTable,
      settings.stockAlertThreshold,
      settings.enabledAlertTypes,
    );
    const firstSequentialPassResults = await processSourcesSequentially(
      sequentialSources,
      apis,
      db,
      sourceTable,
      productTable,
      productAlertTable,
      settings.stockAlertThreshold,
      settings.enabledAlertTypes,
      settings.monitorHourlyRate,
    );

    const failedJinritemaiSources = firstJinritemaiPassResults
      .filter(({ result }) => result.failedUrls > 0)
      .map(({ source }) => source);
    const failedSequentialSources = firstSequentialPassResults
      .filter(({ result }) => result.failedUrls > 0)
      .map(({ source }) => source);

    for (const { result } of [...firstJinritemaiPassResults, ...firstSequentialPassResults]) {
      if (result.succeededUrls > 0) {
        applyProcessResult(summary, result);
      }
    }

    if (failedJinritemaiSources.length > 0) {
      retriedFailedSourceCount += failedJinritemaiSources.length;
      const retryResults = await processJinritemaiSources(
        failedJinritemaiSources,
        apis,
        db,
        sourceTable,
        productTable,
        productAlertTable,
        settings.stockAlertThreshold,
        settings.enabledAlertTypes,
      );

      for (const { result } of retryResults) {
        applyProcessResult(summary, result);
      }
    }

    if (failedSequentialSources.length > 0) {
      retriedFailedSourceCount += failedSequentialSources.length;
      const retryResults = await processSourcesSequentially(
        failedSequentialSources,
        apis,
        db,
        sourceTable,
        productTable,
        productAlertTable,
        settings.stockAlertThreshold,
        settings.enabledAlertTypes,
        settings.monitorHourlyRate,
      );

      for (const { result } of retryResults) {
        applyProcessResult(summary, result);
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof CaptchaRequiredError ? CAPTCHA_REQUIRED_MESSAGE : "Workflow failed",
      error: error,
    };
  }

  const result: WorkflowResult & { data: WorkflowSummary } = {
    success: summary.failedUrls === 0,
    message: `Workflow completed with domain routing; retried ${retriedFailedSourceCount} failed URLs once after the first pass: ${summary.succeededUrls}/${summary.totalUrls} URLs succeeded, ${summary.failedUrls} URLs failed, ${summary.skippedInvalidUrls} invalid URLs skipped, ${summary.updatedProducts} products updated, ${summary.zeroedProducts} products marked out of stock, ${summary.alertRecordsCreated} alert records created.`,
    data: summary,
  };

  return result;
}
// @ts-ignore
globalThis.execute = execute;

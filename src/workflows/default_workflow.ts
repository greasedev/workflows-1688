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
 *   - errors: array
 * ---
 */

import { Agent, type Dexie, type WorkflowContext, type WorkflowResult } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis, type ExecutionResult } from '../api';
import { DB_TABLES, initDB } from '../libs/db';
import type { Product, Source, WorkflowSummary } from '../models/types';

type RawProduct = Record<string, unknown>;

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

// Main workflow entry point
export async function execute(context: WorkflowContext): Promise<WorkflowResult> {
  const agent = new Agent(context.agentOptions || {});
  const apis = createWorkflowApis(agent);
  const db = initDB(agent);
  const sourceTable = db.table<Source, number>(DB_TABLES.source);
  const productTable = db.table<Product, number>(DB_TABLES.product);
  const allSources = await sourceTable.toArray();
  const sources = allSources.filter((source) => source.isInvalid !== true);
  const summary: WorkflowSummary = {
    totalUrls: sources.length,
    succeededUrls: 0,
    failedUrls: 0,
    skippedInvalidUrls: allSources.length - sources.length,
    updatedProducts: 0,
    zeroedProducts: 0,
    errors: [],
  };

  console.log("Task:", context.task);
  console.log("Params:", context.params);
  console.log('Executing product monitor workflow...');

  for (const source of sources) {
    const checkedAt = new Date().toISOString();

    try {
      const result = await apis.get_sku_list_from_url(source.url);
      const products = extractProducts(result, source.url, checkedAt);
      const currentProductKeys = new Set(products.map(productKey));

      for (const product of products) {
        await upsertProduct(productTable, product);
        summary.updatedProducts += 1;
      }

      const existingProducts = await productTable.where('url').equals(source.url).toArray() as Product[];
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
        summary.zeroedProducts += 1;
      }

      if (source.id !== undefined) {
        await sourceTable.update(source.id, {
          lastCheckedAt: checkedAt,
          lastError: undefined,
          updatedAt: checkedAt,
        });
      }

      summary.succeededUrls += 1;
    } catch (error) {
      const message = errorMessage(error);
      summary.failedUrls += 1;
      summary.errors.push({ url: source.url, message });

      if (source.id !== undefined) {
        await sourceTable.update(source.id, {
          lastCheckedAt: checkedAt,
          lastError: message,
          updatedAt: checkedAt,
        });
      }
    }
  }

  const result: WorkflowResult & { data: WorkflowSummary } = {
    success: summary.failedUrls === 0,
    message: `Workflow completed: ${summary.succeededUrls}/${summary.totalUrls} URLs succeeded, ${summary.skippedInvalidUrls} invalid URLs skipped, ${summary.updatedProducts} products updated, ${summary.zeroedProducts} products marked out of stock.`,
    data: summary,
  };

  return result;
}
// @ts-ignore
globalThis.execute = execute;

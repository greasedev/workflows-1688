import { Agent } from "@greasedev/workflow-sdk";
import type { Product } from "../models/types";
import { compareProductsByRecency, isJinritemaiUrl } from "./product-identity";

export const DB_TABLES = {
  source: "source",
  product: "product",
  productAlert: "product_alert",
  settings: "settings",
} as const;

export function initDB(agent: Agent) {
  const db = agent.getDb();
  db.version(1).stores({
    [DB_TABLES.source]: "++id, &url",
    [DB_TABLES.product]: "++id, &[name+url], name, url, stock",
  });
  db.version(2).stores({
    [DB_TABLES.source]: "++id, &url, updatedAt, lastCheckedAt",
    [DB_TABLES.product]: "++id, &[name+url], name, url, stock, updatedAt",
  });
  db.version(3).stores({
    [DB_TABLES.source]: "++id, &url, updatedAt, lastCheckedAt",
    [DB_TABLES.product]: "++id, &[name+spec+url], name, spec, url, stock, updatedAt",
  });
  db.version(4).stores({
    [DB_TABLES.source]: "++id, &url, isInvalid, updatedAt, lastCheckedAt",
    [DB_TABLES.product]: "++id, &[name+spec+url], name, spec, url, stock, updatedAt",
  });
  db.version(5).stores({
    [DB_TABLES.source]: "++id, &url, isInvalid, updatedAt, lastCheckedAt",
    [DB_TABLES.product]: "++id, &[name+spec+url], name, spec, url, stock, updatedAt",
    [DB_TABLES.productAlert]: "++id, url, name, spec, checkedAt, [name+spec+url]",
  });
  db.version(6).stores({
    [DB_TABLES.source]: "++id, &url, isInvalid, updatedAt, lastCheckedAt",
    [DB_TABLES.product]: "++id, &[name+spec+url], name, spec, url, stock, updatedAt",
    [DB_TABLES.productAlert]: "++id, url, name, spec, checkedAt, [name+spec+url]",
    [DB_TABLES.settings]: "&id, updatedAt",
  });
  db.version(7).stores({
    [DB_TABLES.source]: "++id, &url, isInvalid, updatedAt, lastCheckedAt",
    [DB_TABLES.product]: "++id, &[name+spec+url], name, spec, url, stock, updatedAt",
    [DB_TABLES.productAlert]: "++id, url, name, spec, checkedAt, [name+spec+url]",
    [DB_TABLES.settings]: "&id, updatedAt",
  }).upgrade(async (transaction) => {
    const productTable = transaction.table<Product, number>(DB_TABLES.product);
    const products = await productTable.toArray();
    const productsByJinritemaiUrl = new Map<string, Product[]>();

    for (const product of products) {
      if (!isJinritemaiUrl(product.url)) continue;
      const groupedProducts = productsByJinritemaiUrl.get(product.url) ?? [];
      groupedProducts.push(product);
      productsByJinritemaiUrl.set(product.url, groupedProducts);
    }

    const duplicateIds: number[] = [];
    for (const groupedProducts of productsByJinritemaiUrl.values()) {
      if (groupedProducts.length < 2) continue;
      groupedProducts.sort(compareProductsByRecency);
      for (const duplicate of groupedProducts.slice(1)) {
        if (duplicate.id !== undefined) duplicateIds.push(duplicate.id);
      }
    }

    if (duplicateIds.length > 0) {
      await productTable.bulkDelete(duplicateIds);
    }
  });
  return db;
}

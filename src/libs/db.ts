import { Agent } from "@greaseclaw/workflow-sdk";

export const DB_TABLES = {
  source: "source",
  product: "product",
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
  return db;
}

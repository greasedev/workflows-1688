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
  return db;
}

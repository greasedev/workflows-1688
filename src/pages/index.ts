import { Agent, AgentOptions } from "@greaseclaw/workflow-sdk";
import * as XLSX from "xlsx";
import { DB_TABLES, initDB } from "../libs/db";
import type { Product, Source } from "../models/types";

type ImportStats = {
  added: number;
  duplicate: number;
  invalid: number;
};

type ActivePanel = "source" | "product";

const SOURCE_URL_COLUMN = "上游1";

// 扩展 Window 类型以包含 agentOptions
declare global {
  interface Window {
    agentOptions?: AgentOptions;
  }
}

const agent = new Agent(window.agentOptions || {});
const db = initDB(agent);
const sourceTable = db.table<Source, number>(DB_TABLES.source);
const productTable = db.table<Product, number>(DB_TABLES.product);

const excelInput = getElement<HTMLInputElement>("excelInput");
const importModal = getElement<HTMLDivElement>("importModal");
const importModalTitle = getElement<HTMLDivElement>("importModalTitle");
const importModalBody = getElement<HTMLDivElement>("importModalBody");
const importModalCloseButton = getElement<HTMLButtonElement>(
  "importModalCloseButton",
);
const refreshButton = getElement<HTMLButtonElement>("refreshButton");
const sourceTab = getElement<HTMLButtonElement>("sourceTab");
const productTab = getElement<HTMLButtonElement>("productTab");
const sourcePanel = getElement<HTMLElement>("sourcePanel");
const productPanel = getElement<HTMLElement>("productPanel");
const sourceRows = getElement<HTMLTableSectionElement>("sourceRows");
const sourceEmpty = getElement<HTMLDivElement>("sourceEmpty");
const sourceCount = getElement<HTMLSpanElement>("sourceCount");
const productCount = getElement<HTMLSpanElement>("productCount");
const nameFilter = getElement<HTMLInputElement>("nameFilter");
const urlFilter = getElement<HTMLInputElement>("urlFilter");
const productRows = getElement<HTMLTableSectionElement>("productRows");
const productEmpty = getElement<HTMLDivElement>("productEmpty");
const productSearchPanel = getElement<HTMLElement>("productSearchPanel");

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}

function showImportModal(
  title: string,
  message: string,
  kind: "success" | "error" | "" = "",
) {
  importModalTitle.textContent = title;
  importModalTitle.className = kind ? `modal-title ${kind}` : "modal-title";
  importModalBody.textContent = message;
  importModal.classList.add("active");
}

function closeImportModal() {
  importModal.classList.remove("active");
}

function setActivePanel(panel: ActivePanel) {
  const isSource = panel === "source";
  sourcePanel.hidden = !isSource;
  productPanel.hidden = isSource;
  productSearchPanel.hidden = isSource;

  sourceTab.classList.toggle("active", isSource);
  sourceTab.setAttribute("aria-selected", String(isSource));
  productTab.classList.toggle("active", !isSource);
  productTab.setAttribute("aria-selected", String(!isSource));
}

function normalizeUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function formatDate(value?: string): string {
  if (!value) return "未检查";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(value);
}

function hasSourceUrlHeader(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const header = rows[0] ?? [];
  return header.some((cell) => String(cell).trim() === SOURCE_URL_COLUMN);
}

async function importExcel(file: File): Promise<ImportStats> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel 文件没有工作表。");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!hasSourceUrlHeader(sheet)) {
    throw new Error(`Excel 文件必须包含固定表头 ${SOURCE_URL_COLUMN}。`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    blankrows: false,
  });
  const existingSources = await sourceTable.toArray();
  const existingUrls = new Set(existingSources.map((source) => source.url));
  const seenUrls = new Set<string>();
  const now = new Date().toISOString();
  const newSources: Source[] = [];
  const stats: ImportStats = { added: 0, duplicate: 0, invalid: 0 };

  for (const row of rows) {
    const url = normalizeUrl(row[SOURCE_URL_COLUMN]);
    if (!url) {
      stats.invalid += 1;
      continue;
    }

    if (existingUrls.has(url) || seenUrls.has(url)) {
      stats.duplicate += 1;
      continue;
    }

    seenUrls.add(url);
    stats.added += 1;
    newSources.push({
      url,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (newSources.length > 0) {
    await sourceTable.bulkAdd(newSources);
  }

  return stats;
}

async function loadSourcesAndProducts() {
  const [sources, products] = await Promise.all([
    sourceTable.orderBy("url").toArray(),
    productTable.toArray(),
  ]);

  const countsByUrl = new Map<string, number>();
  for (const product of products) {
    countsByUrl.set(product.url, (countsByUrl.get(product.url) ?? 0) + 1);
  }

  sourceCount.textContent = String(sources.length);
  productCount.textContent = String(products.length);
  renderSources(sources, countsByUrl);
  renderProducts(products);
}

function renderSources(sources: Source[], countsByUrl: Map<string, number>) {
  sourceRows.textContent = "";
  sourceEmpty.classList.toggle("visible", sources.length === 0);

  for (const source of sources) {
    const row = document.createElement("tr");
    const urlCell = document.createElement("td");
    const countCell = document.createElement("td");
    const checkedCell = document.createElement("td");
    const statusCell = document.createElement("td");
    const actionCell = document.createElement("td");
    const urlLink = document.createElement("a");
    const countButton = document.createElement("button");
    const actionButton = document.createElement("button");
    const productTotal = countsByUrl.get(source.url) ?? 0;
    const isInvalid = source.isInvalid === true;

    urlLink.className = "url-link";
    urlLink.href = source.url;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.textContent = source.url;
    urlCell.append(urlLink);

    countButton.className = "count-button";
    countButton.type = "button";
    countButton.textContent = String(productTotal);
    countButton.addEventListener("click", () => {
      urlFilter.value = source.url;
      setActivePanel("product");
      renderProductsFromDb();
      productSearchPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    countCell.append(countButton);

    checkedCell.textContent = formatDate(source.lastCheckedAt);
    statusCell.className = isInvalid
      ? "status-invalid"
      : source.lastError
        ? "status-error"
        : "status-ok";
    statusCell.textContent = isInvalid ? "失效" : source.lastError || "正常";

    actionButton.className = isInvalid
      ? "btn btn-primary source-action-btn"
      : "btn btn-secondary source-action-btn";
    actionButton.type = "button";
    actionButton.textContent = isInvalid ? "恢复有效" : "标记失效";
    actionButton.addEventListener("click", () => {
      toggleSourceInvalid(source, !isInvalid);
    });
    actionCell.append(actionButton);

    row.append(urlCell, countCell, checkedCell, statusCell, actionCell);
    sourceRows.append(row);
  }
}

async function toggleSourceInvalid(source: Source, isInvalid: boolean) {
  if (source.id === undefined) return;

  const now = new Date().toISOString();
  await sourceTable.update(source.id, {
    isInvalid,
    invalidAt: isInvalid ? now : undefined,
    updatedAt: now,
  });
  await loadSourcesAndProducts();
}

async function renderProductsFromDb() {
  const products = await productTable.toArray();
  renderProducts(products);
}

function renderProducts(products: Product[]) {
  const nameQuery = nameFilter.value.trim().toLocaleLowerCase();
  const urlQuery = urlFilter.value.trim().toLocaleLowerCase();

  productRows.textContent = "";
  if (!nameQuery && !urlQuery) {
    productEmpty.classList.add("visible");
    return;
  }

  const filtered = products
    .filter((product) => {
      const matchesName =
        !nameQuery || product.name.toLocaleLowerCase().includes(nameQuery);
      const matchesUrl =
        !urlQuery || product.url.toLocaleLowerCase().includes(urlQuery);
      return matchesName && matchesUrl;
    })
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return bTime - aTime || a.name.localeCompare(b.name, "zh-CN");
    });

  productEmpty.classList.toggle("visible", filtered.length === 0);

  for (const product of filtered) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const productName = document.createElement("div");
    const productSpec = document.createElement("div");
    const priceCell = document.createElement("td");
    const stockCell = document.createElement("td");
    const urlCell = document.createElement("td");
    const updatedCell = document.createElement("td");
    const urlLink = document.createElement("a");

    productName.className = "product-name";
    productName.textContent = product.name;
    productSpec.className = "product-spec";
    productSpec.textContent = `规格：${product.spec}`;
    nameCell.append(productName, productSpec);
    priceCell.className = "price";
    priceCell.textContent = formatNumber(product.price);
    stockCell.className = "stock";
    stockCell.textContent = formatNumber(product.stock);

    urlLink.className = "url-link";
    urlLink.href = product.url;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.textContent = product.url;
    urlCell.append(urlLink);

    updatedCell.textContent = formatDate(product.updatedAt);

    row.append(nameCell, priceCell, stockCell, urlCell, updatedCell);
    productRows.append(row);
  }
}

excelInput.addEventListener("change", async () => {
  const file = excelInput.files?.[0];
  if (!file) return;

  showImportModal("正在导入", "正在导入 Excel...");
  try {
    const stats = await importExcel(file);
    showImportModal(
      "导入完成",
      `新增 URL：${stats.added} 个\n重复 URL：${stats.duplicate} 个\n无效或空值：${stats.invalid} 个`,
      "success",
    );
    await loadSourcesAndProducts();
  } catch (error) {
    showImportModal(
      "导入失败",
      error instanceof Error ? error.message : "导入失败。",
      "error",
    );
  } finally {
    excelInput.value = "";
  }
});

importModalCloseButton.addEventListener("click", () => {
  closeImportModal();
});

importModal.addEventListener("click", (event) => {
  if (event.target === importModal) {
    closeImportModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeImportModal();
  }
});

refreshButton.addEventListener("click", () => {
  loadSourcesAndProducts();
});

sourceTab.addEventListener("click", () => {
  setActivePanel("source");
});

productTab.addEventListener("click", () => {
  setActivePanel("product");
  renderProductsFromDb();
});

nameFilter.addEventListener("input", () => {
  renderProductsFromDb();
});

urlFilter.addEventListener("input", () => {
  renderProductsFromDb();
});

setActivePanel("source");
loadSourcesAndProducts();

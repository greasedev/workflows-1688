import { Agent, AgentOptions } from "@greaseclaw/workflow-sdk";
import * as XLSX from "xlsx";
import { DB_TABLES, initDB } from "../libs/db";
import type { Product, ProductAlert, ProductAlertHitType, Source } from "../models/types";

type ImportStats = {
  added: number;
  duplicate: number;
  invalid: number;
};

type ActivePanel = "alert" | "source" | "product";
type PaginationState = {
  currentPage: number;
};
type PaginationControls = {
  container: HTMLElement;
  info: HTMLElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
};

const SOURCE_URL_COLUMN = "上游1";
const PAGE_SIZE = 20;
const TEST_ALERT_COUNT = 20;
const LOW_STOCK_THRESHOLD = 100;
const alertPaginationState: PaginationState = { currentPage: 1 };
const sourcePaginationState: PaginationState = { currentPage: 1 };
const productPaginationState: PaginationState = { currentPage: 1 };
const ALERT_HIT_TYPE_LABELS: Record<ProductAlertHitType, string> = {
  missing: "商品缺失",
  price_increase: "价格上涨",
  low_stock: "低库存",
};
const TEST_ALERT_PATTERNS: ProductAlertHitType[][] = [
  ["missing"],
  ["price_increase"],
  ["low_stock"],
  ["price_increase", "low_stock"],
];

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
const productAlertTable = db.table<ProductAlert, number>(DB_TABLES.productAlert);

const generateTestAlertsButton = getElement<HTMLButtonElement>(
  "generateTestAlertsButton",
);
const excelInput = getElement<HTMLInputElement>("excelInput");
const importModal = getElement<HTMLDivElement>("importModal");
const importModalTitle = getElement<HTMLDivElement>("importModalTitle");
const importModalBody = getElement<HTMLDivElement>("importModalBody");
const importModalCloseButton = getElement<HTMLButtonElement>(
  "importModalCloseButton",
);
const alertTab = getElement<HTMLButtonElement>("alertTab");
const sourceTab = getElement<HTMLButtonElement>("sourceTab");
const productTab = getElement<HTMLButtonElement>("productTab");
const alertPanel = getElement<HTMLElement>("alertPanel");
const sourcePanel = getElement<HTMLElement>("sourcePanel");
const productPanel = getElement<HTMLElement>("productPanel");
const alertRows = getElement<HTMLTableSectionElement>("alertRows");
const alertEmpty = getElement<HTMLDivElement>("alertEmpty");
const alertPagination = getElement<HTMLDivElement>("alertPagination");
const alertPaginationInfo = getElement<HTMLSpanElement>("alertPaginationInfo");
const alertPrevPageButton = getElement<HTMLButtonElement>(
  "alertPrevPageButton",
);
const alertNextPageButton = getElement<HTMLButtonElement>(
  "alertNextPageButton",
);
const sourceRows = getElement<HTMLTableSectionElement>("sourceRows");
const sourceEmpty = getElement<HTMLDivElement>("sourceEmpty");
const sourcePagination = getElement<HTMLDivElement>("sourcePagination");
const sourcePaginationInfo = getElement<HTMLSpanElement>("sourcePaginationInfo");
const sourcePrevPageButton = getElement<HTMLButtonElement>(
  "sourcePrevPageButton",
);
const sourceNextPageButton = getElement<HTMLButtonElement>(
  "sourceNextPageButton",
);
const alertCount = getElement<HTMLSpanElement>("alertCount");
const sourceCount = getElement<HTMLSpanElement>("sourceCount");
const productCount = getElement<HTMLSpanElement>("productCount");
const nameFilter = getElement<HTMLInputElement>("nameFilter");
const urlFilter = getElement<HTMLInputElement>("urlFilter");
const productRows = getElement<HTMLTableSectionElement>("productRows");
const productEmpty = getElement<HTMLDivElement>("productEmpty");
const productResultSummary = getElement<HTMLDivElement>("productResultSummary");
const productPagination = getElement<HTMLDivElement>("productPagination");
const productPaginationInfo = getElement<HTMLSpanElement>(
  "productPaginationInfo",
);
const productPrevPageButton = getElement<HTMLButtonElement>(
  "productPrevPageButton",
);
const productNextPageButton = getElement<HTMLButtonElement>(
  "productNextPageButton",
);
const productSearchPanel = getElement<HTMLElement>("productSearchPanel");
const alertPaginationControls: PaginationControls = {
  container: alertPagination,
  info: alertPaginationInfo,
  prevButton: alertPrevPageButton,
  nextButton: alertNextPageButton,
};
const sourcePaginationControls: PaginationControls = {
  container: sourcePagination,
  info: sourcePaginationInfo,
  prevButton: sourcePrevPageButton,
  nextButton: sourceNextPageButton,
};
const productPaginationControls: PaginationControls = {
  container: productPagination,
  info: productPaginationInfo,
  prevButton: productPrevPageButton,
  nextButton: productNextPageButton,
};

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
  const isAlert = panel === "alert";
  const isSource = panel === "source";
  const isProduct = panel === "product";
  alertPanel.hidden = !isAlert;
  sourcePanel.hidden = !isSource;
  productPanel.hidden = !isProduct;
  productSearchPanel.hidden = !isProduct;

  alertTab.classList.toggle("active", isAlert);
  alertTab.setAttribute("aria-selected", String(isAlert));
  sourceTab.classList.toggle("active", isSource);
  sourceTab.setAttribute("aria-selected", String(isSource));
  productTab.classList.toggle("active", isProduct);
  productTab.setAttribute("aria-selected", String(isProduct));
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

function formatOptionalNumber(value?: number): string {
  return typeof value === "number" ? formatNumber(value) : "-";
}

function formatValueChange(previousValue?: number, currentValue?: number): string {
  return `${formatOptionalNumber(previousValue)} -> ${formatOptionalNumber(currentValue)}`;
}

function alertHitTypeDetail(alert: ProductAlert, hitType: ProductAlertHitType): string {
  if (hitType === "price_increase") {
    return formatValueChange(alert.previousPrice, alert.currentPrice);
  }
  if (hitType === "low_stock") {
    return formatValueChange(alert.previousStock, alert.currentStock);
  }
  return "";
}

function totalPages(totalItems: number): number {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
}

function normalizePage(state: PaginationState, totalItems: number) {
  const maxPage = totalPages(totalItems);
  state.currentPage = Math.min(Math.max(state.currentPage, 1), maxPage);
}

function pageStartIndex(state: PaginationState): number {
  return (state.currentPage - 1) * PAGE_SIZE;
}

function renderPagination(
  controls: PaginationControls,
  state: PaginationState,
  totalItems: number,
) {
  controls.container.hidden = totalItems === 0;
  if (totalItems === 0) {
    controls.info.textContent = "0-0 / 0";
    controls.prevButton.disabled = true;
    controls.nextButton.disabled = true;
    return;
  }

  const start = pageStartIndex(state) + 1;
  const end = Math.min(state.currentPage * PAGE_SIZE, totalItems);
  controls.info.textContent = `${start}-${end} / ${totalItems}`;
  controls.prevButton.disabled = state.currentPage <= 1;
  controls.nextButton.disabled = state.currentPage >= totalPages(totalItems);
}

function updateProductResultSummary(count: number) {
  productResultSummary.textContent = `已查询到${count}件商品。`;
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

function lowerTestPrice(price: number): number {
  return Number((price - Math.max(1, price * 0.1)).toFixed(2));
}

function lowTestStock(index: number): number {
  return 20 + (index % 70);
}

function buildTestAlert(product: Product, hitTypes: ProductAlertHitType[], index: number): ProductAlert {
  const checkedAt = new Date(Date.now() - index * 60 * 1000).toISOString();
  const alert: ProductAlert = {
    url: product.url,
    name: product.name,
    spec: product.spec,
    hitTypes,
    previousPrice: product.price,
    currentPrice: product.price,
    previousStock: product.stock,
    currentStock: product.stock,
    stockThreshold: LOW_STOCK_THRESHOLD,
    checkedAt,
  };

  if (hitTypes.includes("missing")) {
    alert.currentPrice = undefined;
    alert.currentStock = undefined;
  }

  if (hitTypes.includes("price_increase")) {
    alert.previousPrice = lowerTestPrice(product.price);
    alert.currentPrice = product.price;
  }

  if (hitTypes.includes("low_stock")) {
    alert.previousStock = product.stock;
    alert.currentStock = lowTestStock(index);
  }

  return alert;
}

async function generateTestAlerts() {
  const products = await productTable.toArray();
  if (products.length === 0) {
    showImportModal("无法生成", "暂无商品数据，无法生成测试报警。", "error");
    return;
  }

  const alerts: ProductAlert[] = [];
  for (let index = 0; index < TEST_ALERT_COUNT; index += 1) {
    const product = products[index % products.length];
    const hitTypes = TEST_ALERT_PATTERNS[index % TEST_ALERT_PATTERNS.length];
    alerts.push(buildTestAlert(product, hitTypes, index));
  }

  await productAlertTable.clear();
  await productAlertTable.bulkAdd(alerts);

  alertPaginationState.currentPage = 1;
  setActivePanel("alert");
  await loadDashboardData();
  showImportModal("生成完成", `已生成 ${TEST_ALERT_COUNT} 条测试报警。`, "success");
}

async function loadDashboardData() {
  const [sources, products, alerts] = await Promise.all([
    sourceTable.orderBy("url").toArray(),
    productTable.toArray(),
    productAlertTable.toArray(),
  ]);

  const countsByUrl = new Map<string, number>();
  for (const product of products) {
    countsByUrl.set(product.url, (countsByUrl.get(product.url) ?? 0) + 1);
  }

  alertCount.textContent = String(alerts.length);
  sourceCount.textContent = String(sources.length);
  productCount.textContent = String(products.length);
  renderAlerts(alerts);
  renderSources(sources, countsByUrl);
  renderProducts(products);
}

async function renderAlertsFromDb() {
  const alerts = await productAlertTable.toArray();
  renderAlerts(alerts);
}

function renderAlerts(alerts: ProductAlert[]) {
  alertCount.textContent = String(alerts.length);
  alertRows.textContent = "";
  alertEmpty.classList.toggle("visible", alerts.length === 0);
  normalizePage(alertPaginationState, alerts.length);
  renderPagination(alertPaginationControls, alertPaginationState, alerts.length);

  const sortedAlerts = [...alerts].sort((a, b) => {
    const timeDiff = new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime();
    return timeDiff || (b.id ?? 0) - (a.id ?? 0);
  });
  const startIndex = pageStartIndex(alertPaginationState);
  const pageAlerts = sortedAlerts.slice(startIndex, startIndex + PAGE_SIZE);

  for (const alert of pageAlerts) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const hitTypeCell = document.createElement("td");
    const urlCell = document.createElement("td");
    const checkedCell = document.createElement("td");
    const productName = document.createElement("div");
    const productSpec = document.createElement("div");
    const hitTypeList = document.createElement("div");
    const urlLink = document.createElement("a");

    productName.className = "product-name";
    productName.textContent = alert.name;
    productSpec.className = "product-spec";
    productSpec.textContent = `规格：${alert.spec}`;
    nameCell.append(productName, productSpec);

    hitTypeList.className = "alert-hit-list";
    for (const hitType of alert.hitTypes) {
      const hitTypeRow = document.createElement("div");
      const hitTypeTag = document.createElement("span");
      const hitTypeDetail = document.createElement("span");
      const detailText = alertHitTypeDetail(alert, hitType);

      hitTypeRow.className = "alert-hit-row";
      hitTypeTag.className = "alert-hit-tag";
      hitTypeTag.textContent = ALERT_HIT_TYPE_LABELS[hitType] ?? hitType;
      hitTypeRow.append(hitTypeTag);

      if (detailText) {
        hitTypeDetail.className = "alert-hit-detail";
        hitTypeDetail.textContent = detailText;
        hitTypeRow.append(hitTypeDetail);
      }

      hitTypeList.append(hitTypeRow);
    }
    hitTypeCell.append(hitTypeList);

    urlLink.className = "url-link";
    urlLink.href = alert.url;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.textContent = alert.url;
    urlCell.append(urlLink);

    checkedCell.textContent = formatDate(alert.checkedAt);

    row.append(nameCell, hitTypeCell, urlCell, checkedCell);
    alertRows.append(row);
  }
}

function renderSources(sources: Source[], countsByUrl: Map<string, number>) {
  sourceRows.textContent = "";
  sourceEmpty.classList.toggle("visible", sources.length === 0);
  normalizePage(sourcePaginationState, sources.length);
  renderPagination(sourcePaginationControls, sourcePaginationState, sources.length);

  const startIndex = pageStartIndex(sourcePaginationState);
  const pageSources = sources.slice(startIndex, startIndex + PAGE_SIZE);

  for (const source of pageSources) {
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
      productPaginationState.currentPage = 1;
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
  await loadDashboardData();
}

async function renderProductsFromDb() {
  const products = await productTable.toArray();
  renderProducts(products);
}

function renderProducts(products: Product[]) {
  productCount.textContent = String(products.length);
  const nameQuery = nameFilter.value.trim().toLocaleLowerCase();
  const urlQuery = urlFilter.value.trim().toLocaleLowerCase();

  productRows.textContent = "";
  if (!nameQuery && !urlQuery) {
    updateProductResultSummary(0);
    productEmpty.classList.add("visible");
    renderPagination(productPaginationControls, productPaginationState, 0);
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

  updateProductResultSummary(filtered.length);
  productEmpty.classList.toggle("visible", filtered.length === 0);
  normalizePage(productPaginationState, filtered.length);
  renderPagination(productPaginationControls, productPaginationState, filtered.length);

  const startIndex = pageStartIndex(productPaginationState);
  const pageProducts = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  for (const product of pageProducts) {
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
    await loadDashboardData();
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

generateTestAlertsButton.addEventListener("click", async () => {
  generateTestAlertsButton.disabled = true;
  try {
    await generateTestAlerts();
  } catch (error) {
    showImportModal(
      "生成失败",
      error instanceof Error ? error.message : "生成测试报警失败。",
      "error",
    );
  } finally {
    generateTestAlertsButton.disabled = false;
  }
});

alertTab.addEventListener("click", () => {
  setActivePanel("alert");
  renderAlertsFromDb();
});

alertPrevPageButton.addEventListener("click", () => {
  if (alertPaginationState.currentPage <= 1) return;
  alertPaginationState.currentPage -= 1;
  renderAlertsFromDb();
});

alertNextPageButton.addEventListener("click", () => {
  alertPaginationState.currentPage += 1;
  renderAlertsFromDb();
});

sourceTab.addEventListener("click", () => {
  setActivePanel("source");
});

sourcePrevPageButton.addEventListener("click", () => {
  if (sourcePaginationState.currentPage <= 1) return;
  sourcePaginationState.currentPage -= 1;
  loadDashboardData();
});

sourceNextPageButton.addEventListener("click", () => {
  sourcePaginationState.currentPage += 1;
  loadDashboardData();
});

productPrevPageButton.addEventListener("click", () => {
  if (productPaginationState.currentPage <= 1) return;
  productPaginationState.currentPage -= 1;
  renderProductsFromDb();
});

productNextPageButton.addEventListener("click", () => {
  productPaginationState.currentPage += 1;
  renderProductsFromDb();
});

productTab.addEventListener("click", () => {
  setActivePanel("product");
  renderProductsFromDb();
});

nameFilter.addEventListener("input", () => {
  productPaginationState.currentPage = 1;
  renderProductsFromDb();
});

urlFilter.addEventListener("input", () => {
  productPaginationState.currentPage = 1;
  renderProductsFromDb();
});

setActivePanel("alert");
loadDashboardData();

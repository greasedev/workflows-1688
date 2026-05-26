import { Agent, AgentOptions } from "@greaseclaw/workflow-sdk";
import * as XLSX from "xlsx";
import { DB_TABLES, initDB } from "../libs/db";
import {
  getAppSettings,
  saveAppSettings,
  SETTINGS_LIMITS,
} from "../libs/settings";
import type { AppSettings, Product, ProductAlert, ProductAlertHitType, Source } from "../models/types";

type ImportStats = {
  added: number;
  duplicate: number;
  invalid: number;
  non1688: number;
};

type ActivePanel = "alert" | "source" | "product";
type SourceStatusFilter = "all" | "normal" | "invalid" | "error";
type AlertHitTypeFilter = "all" | ProductAlertHitType;
type PaginationState = {
  currentPage: number;
};
type PaginationControls = {
  container: HTMLElement;
  info: HTMLElement;
  jumpInput: HTMLInputElement;
  jumpButton: HTMLButtonElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
};
type PageState = {
  activePanel: ActivePanel;
  alertPage: number;
  sourcePage: number;
  productPage: number;
  alertHitType: AlertHitTypeFilter;
  sourceStatus: SourceStatusFilter;
  productName: string;
  productUrl: string;
};

const SOURCE_URL_COLUMN = "上游1";
const PAGE_STATE_STORAGE_KEY = "product-monitor-page-state";
const PAGE_SIZE = 20;
const ACTIVE_PANEL_VALUES: ActivePanel[] = ["alert", "source", "product"];
const SOURCE_STATUS_FILTER_VALUES: SourceStatusFilter[] = [
  "all",
  "normal",
  "invalid",
  "error",
];
const ALERT_HIT_TYPE_FILTER_VALUES: AlertHitTypeFilter[] = [
  "all",
  "missing",
  "price_increase",
  "low_stock",
];
const alertPaginationState: PaginationState = { currentPage: 1 };
const sourcePaginationState: PaginationState = { currentPage: 1 };
const productPaginationState: PaginationState = { currentPage: 1 };
let activePanel: ActivePanel = "alert";
let alertHitTypeFilterValue: AlertHitTypeFilter = "all";
let sourceStatusFilterValue: SourceStatusFilter = "all";
const ALERT_HIT_TYPE_LABELS: Record<ProductAlertHitType, string> = {
  missing: "商品缺失",
  price_increase: "价格上涨",
  low_stock: "低库存",
};

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
const settingsTable = db.table<AppSettings, string>(DB_TABLES.settings);

const userManualButton = getElement<HTMLButtonElement>("userManualButton");
const userManualModal = getElement<HTMLDivElement>("userManualModal");
const userManualCloseButton = getElement<HTMLButtonElement>(
  "userManualCloseButton",
);
const excelInput = getElement<HTMLInputElement>("excelInput");
const settingsButton = getElement<HTMLButtonElement>("settingsButton");
const importModal = getElement<HTMLDivElement>("importModal");
const importModalTitle = getElement<HTMLDivElement>("importModalTitle");
const importModalBody = getElement<HTMLDivElement>("importModalBody");
const importModalCloseButton = getElement<HTMLButtonElement>(
  "importModalCloseButton",
);
const settingsModal = getElement<HTMLDivElement>("settingsModal");
const settingsForm = getElement<HTMLFormElement>("settingsForm");
const settingsCancelButton = getElement<HTMLButtonElement>(
  "settingsCancelButton",
);
const monitorHourlyRateInput = getElement<HTMLInputElement>(
  "monitorHourlyRateInput",
);
const stockAlertThresholdInput = getElement<HTMLInputElement>(
  "stockAlertThresholdInput",
);
const settingsError = getElement<HTMLDivElement>("settingsError");
const alertTab = getElement<HTMLButtonElement>("alertTab");
const sourceTab = getElement<HTMLButtonElement>("sourceTab");
const productTab = getElement<HTMLButtonElement>("productTab");
const alertPanel = getElement<HTMLElement>("alertPanel");
const sourcePanel = getElement<HTMLElement>("sourcePanel");
const productPanel = getElement<HTMLElement>("productPanel");
const alertRows = getElement<HTMLTableSectionElement>("alertRows");
const alertEmpty = getElement<HTMLDivElement>("alertEmpty");
const alertHitTypeFilter = getElement<HTMLSelectElement>("alertHitTypeFilter");
const alertPagination = getElement<HTMLDivElement>("alertPagination");
const alertPaginationInfo = getElement<HTMLSpanElement>("alertPaginationInfo");
const alertPageJumpInput = getElement<HTMLInputElement>("alertPageJumpInput");
const alertPageJumpButton = getElement<HTMLButtonElement>("alertPageJumpButton");
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
const sourceStatusFilter = getElement<HTMLSelectElement>("sourceStatusFilter");
const sourcePageJumpInput = getElement<HTMLInputElement>("sourcePageJumpInput");
const sourcePageJumpButton = getElement<HTMLButtonElement>(
  "sourcePageJumpButton",
);
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
const productPageJumpInput = getElement<HTMLInputElement>("productPageJumpInput");
const productPageJumpButton = getElement<HTMLButtonElement>(
  "productPageJumpButton",
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
  jumpInput: alertPageJumpInput,
  jumpButton: alertPageJumpButton,
  prevButton: alertPrevPageButton,
  nextButton: alertNextPageButton,
};
const sourcePaginationControls: PaginationControls = {
  container: sourcePagination,
  info: sourcePaginationInfo,
  jumpInput: sourcePageJumpInput,
  jumpButton: sourcePageJumpButton,
  prevButton: sourcePrevPageButton,
  nextButton: sourceNextPageButton,
};
const productPaginationControls: PaginationControls = {
  container: productPagination,
  info: productPaginationInfo,
  jumpInput: productPageJumpInput,
  jumpButton: productPageJumpButton,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isActivePanel(value: unknown): value is ActivePanel {
  return ACTIVE_PANEL_VALUES.includes(value as ActivePanel);
}

function isSourceStatusFilter(value: unknown): value is SourceStatusFilter {
  return SOURCE_STATUS_FILTER_VALUES.includes(value as SourceStatusFilter);
}

function isAlertHitTypeFilter(value: unknown): value is AlertHitTypeFilter {
  return ALERT_HIT_TYPE_FILTER_VALUES.includes(value as AlertHitTypeFilter);
}

function parseSavedPage(value: unknown): number {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function defaultPageState(): PageState {
  return {
    activePanel: "alert",
    alertPage: 1,
    sourcePage: 1,
    productPage: 1,
    alertHitType: "all",
    sourceStatus: "all",
    productName: "",
    productUrl: "",
  };
}

function readPageState(): PageState {
  const defaults = defaultPageState();
  try {
    const rawState = window.localStorage.getItem(PAGE_STATE_STORAGE_KEY);
    if (!rawState) return defaults;

    const parsedState: unknown = JSON.parse(rawState);
    if (!isRecord(parsedState)) return defaults;

    return {
      activePanel: isActivePanel(parsedState.activePanel)
        ? parsedState.activePanel
        : defaults.activePanel,
      alertPage: parseSavedPage(parsedState.alertPage),
      sourcePage: parseSavedPage(parsedState.sourcePage),
      productPage: parseSavedPage(parsedState.productPage),
      alertHitType: isAlertHitTypeFilter(parsedState.alertHitType)
        ? parsedState.alertHitType
        : defaults.alertHitType,
      sourceStatus: isSourceStatusFilter(parsedState.sourceStatus)
        ? parsedState.sourceStatus
        : defaults.sourceStatus,
      productName:
        typeof parsedState.productName === "string" ? parsedState.productName : "",
      productUrl:
        typeof parsedState.productUrl === "string" ? parsedState.productUrl : "",
    };
  } catch {
    return defaults;
  }
}

function savePageState() {
  const state: PageState = {
    activePanel,
    alertPage: alertPaginationState.currentPage,
    sourcePage: sourcePaginationState.currentPage,
    productPage: productPaginationState.currentPage,
    alertHitType: alertHitTypeFilterValue,
    sourceStatus: sourceStatusFilterValue,
    productName: nameFilter.value,
    productUrl: urlFilter.value,
  };

  try {
    window.localStorage.setItem(PAGE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures so private browsing or blocked storage does not break the page.
  }
}

function restorePageState(): ActivePanel {
  const state = readPageState();
  activePanel = state.activePanel;
  alertPaginationState.currentPage = state.alertPage;
  sourcePaginationState.currentPage = state.sourcePage;
  productPaginationState.currentPage = state.productPage;
  alertHitTypeFilterValue = state.alertHitType;
  alertHitTypeFilter.value = alertHitTypeFilterValue;
  sourceStatusFilterValue = state.sourceStatus;
  sourceStatusFilter.value = sourceStatusFilterValue;
  nameFilter.value = state.productName;
  urlFilter.value = state.productUrl;
  return state.activePanel;
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

async function openSettingsModal() {
  const settings = await getAppSettings(settingsTable);
  monitorHourlyRateInput.value = String(settings.monitorHourlyRate);
  stockAlertThresholdInput.value = String(settings.stockAlertThreshold);
  settingsError.hidden = true;
  settingsError.textContent = "";
  settingsModal.classList.add("active");
}

function closeSettingsModal() {
  settingsModal.classList.remove("active");
}

function openUserManualModal() {
  userManualModal.classList.add("active");
}

function closeUserManualModal() {
  userManualModal.classList.remove("active");
}

function showSettingsError(message: string) {
  settingsError.textContent = message;
  settingsError.hidden = false;
}

function setActivePanel(panel: ActivePanel, persist = true) {
  activePanel = panel;
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

  if (persist) {
    savePageState();
  }
}

function parseIntegerInput(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isInteger(value)) {
    throw new Error(`${label}必须是整数。`);
  }
  return value;
}

function parseSettingsForm(): Pick<AppSettings, "monitorHourlyRate" | "stockAlertThreshold"> {
  const monitorHourlyRate = parseIntegerInput(
    monitorHourlyRateInput,
    "每小时监控速率",
  );
  const stockAlertThreshold = parseIntegerInput(
    stockAlertThresholdInput,
    "库存预警值",
  );

  if (
    monitorHourlyRate < SETTINGS_LIMITS.monitorHourlyRate.min ||
    monitorHourlyRate > SETTINGS_LIMITS.monitorHourlyRate.max
  ) {
    throw new Error(
      `每小时监控速率必须在 ${SETTINGS_LIMITS.monitorHourlyRate.min}-${SETTINGS_LIMITS.monitorHourlyRate.max} 之间。`,
    );
  }

  if (stockAlertThreshold < SETTINGS_LIMITS.stockAlertThreshold.min) {
    throw new Error(
      `库存预警值必须大于等于 ${SETTINGS_LIMITS.stockAlertThreshold.min}。`,
    );
  }

  return {
    monitorHourlyRate,
    stockAlertThreshold,
  };
}

function is1688Hostname(hostname: string): boolean {
  return hostname === "1688.com" || hostname.endsWith(".1688.com");
}

function normalizeImportUrl(value: unknown): { url: string | null; isValidUrl: boolean } {
  const url = String(value ?? "").trim();
  if (!url) return { url: null, isValidUrl: false };

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { url: null, isValidUrl: false };
    }
    if (!is1688Hostname(parsed.hostname.toLowerCase())) {
      return { url: null, isValidUrl: true };
    }
    return { url: parsed.href, isValidUrl: true };
  } catch {
    return { url: null, isValidUrl: false };
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

function formatProductStock(value: number): string {
  return value === 0 ? "库存不足" : formatNumber(value);
}

function formatPrice(value?: number): string {
  return typeof value === "number" ? `¥${formatNumber(value)}` : "-";
}

function formatValueChange(previousValue?: number, currentValue?: number): string {
  return `${formatOptionalNumber(previousValue)} -> ${formatOptionalNumber(currentValue)}`;
}

function formatPriceChange(previousValue?: number, currentValue?: number): string {
  return `${formatPrice(previousValue)} -> ${formatPrice(currentValue)}`;
}

function alertHitTypeDetail(alert: ProductAlert, hitType: ProductAlertHitType): string {
  if (hitType === "price_increase") {
    return formatPriceChange(alert.previousPrice, alert.currentPrice);
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

function createNoCell(rowNumber: number): HTMLTableCellElement {
  const noCell = document.createElement("td");
  noCell.className = "row-no";
  noCell.textContent = String(rowNumber);
  return noCell;
}

function renderPagination(
  controls: PaginationControls,
  state: PaginationState,
  totalItems: number,
) {
  controls.container.hidden = totalItems === 0;
  if (totalItems === 0) {
    controls.info.textContent = "第 0 / 0 页";
    controls.jumpInput.value = "";
    controls.jumpInput.disabled = true;
    controls.jumpButton.disabled = true;
    controls.prevButton.disabled = true;
    controls.nextButton.disabled = true;
    savePageState();
    return;
  }

  const pageCount = totalPages(totalItems);
  controls.info.textContent = `第 ${state.currentPage} / ${pageCount} 页`;
  controls.jumpInput.value = String(state.currentPage);
  controls.jumpInput.max = String(pageCount);
  controls.jumpInput.disabled = false;
  controls.jumpButton.disabled = false;
  controls.prevButton.disabled = state.currentPage <= 1;
  controls.nextButton.disabled = state.currentPage >= pageCount;
  savePageState();
}

function jumpToPage(
  controls: PaginationControls,
  state: PaginationState,
  refresh: () => void,
) {
  const requestedPage = Number.parseInt(controls.jumpInput.value, 10);
  if (!Number.isFinite(requestedPage)) {
    controls.jumpInput.value = String(state.currentPage);
    return;
  }

  const maxPage = Number.parseInt(controls.jumpInput.max, 10);
  const normalizedMaxPage = Number.isFinite(maxPage) && maxPage > 0 ? maxPage : 1;
  state.currentPage = Math.min(Math.max(requestedPage, 1), normalizedMaxPage);
  savePageState();
  refresh();
}

function bindPageJump(
  controls: PaginationControls,
  state: PaginationState,
  refresh: () => void,
) {
  controls.jumpButton.addEventListener("click", () => {
    jumpToPage(controls, state, refresh);
  });

  controls.jumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jumpToPage(controls, state, refresh);
    }
  });
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
  const stats: ImportStats = { added: 0, duplicate: 0, invalid: 0, non1688: 0 };

  for (const row of rows) {
    const { url, isValidUrl } = normalizeImportUrl(row[SOURCE_URL_COLUMN]);
    if (!url) {
      if (isValidUrl) {
        stats.non1688 += 1;
      } else {
        stats.invalid += 1;
      }
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

  const sortedAlerts = [...alerts].sort((a, b) => {
    const timeDiff = new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime();
    return timeDiff || (b.id ?? 0) - (a.id ?? 0);
  });
  const hitTypeFilter = alertHitTypeFilterValue;
  const filteredAlerts =
    hitTypeFilter === "all"
      ? sortedAlerts
      : sortedAlerts.filter((alert) => alert.hitTypes.includes(hitTypeFilter));

  alertEmpty.textContent =
    alerts.length === 0 ? "暂无监控报警。" : "当前命中类型筛选下暂无监控报警。";
  alertEmpty.classList.toggle("visible", filteredAlerts.length === 0);
  normalizePage(alertPaginationState, filteredAlerts.length);
  renderPagination(alertPaginationControls, alertPaginationState, filteredAlerts.length);

  const startIndex = pageStartIndex(alertPaginationState);
  const pageAlerts = filteredAlerts.slice(startIndex, startIndex + PAGE_SIZE);

  for (const [index, alert] of pageAlerts.entries()) {
    const row = document.createElement("tr");
    const noCell = createNoCell(startIndex + index + 1);
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

    row.append(noCell, nameCell, hitTypeCell, urlCell, checkedCell);
    alertRows.append(row);
  }
}

function sourceStatus(source: Source): Exclude<SourceStatusFilter, "all"> {
  if (source.isInvalid === true) return "invalid";
  if (source.lastError) return "error";
  return "normal";
}

function filterSourcesByStatus(sources: Source[]): Source[] {
  if (sourceStatusFilterValue === "all") return sources;
  return sources.filter((source) => sourceStatus(source) === sourceStatusFilterValue);
}

function sourceCheckedTime(source: Source): number {
  if (!source.lastCheckedAt) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(source.lastCheckedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sortSourcesByLastChecked(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => {
    const timeDiff = sourceCheckedTime(b) - sourceCheckedTime(a);
    return timeDiff || (b.id ?? 0) - (a.id ?? 0);
  });
}

function renderSources(sources: Source[], countsByUrl: Map<string, number>) {
  const sortedSources = sortSourcesByLastChecked(sources);
  const filteredSources = filterSourcesByStatus(sortedSources);

  sourceRows.textContent = "";
  sourceEmpty.textContent =
    sources.length === 0
      ? "暂无监控 URL，请先导入 Excel。"
      : "当前状态筛选下暂无监控 URL。";
  sourceEmpty.classList.toggle("visible", filteredSources.length === 0);
  normalizePage(sourcePaginationState, filteredSources.length);
  renderPagination(
    sourcePaginationControls,
    sourcePaginationState,
    filteredSources.length,
  );

  const startIndex = pageStartIndex(sourcePaginationState);
  const pageSources = filteredSources.slice(startIndex, startIndex + PAGE_SIZE);

  for (const [index, source] of pageSources.entries()) {
    const row = document.createElement("tr");
    const noCell = createNoCell(startIndex + index + 1);
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

    row.append(noCell, urlCell, countCell, checkedCell, statusCell, actionCell);
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
  productEmpty.textContent = products.length === 0 ? "暂无商品数据。" : "没有匹配商品。";
  productEmpty.classList.toggle("visible", filtered.length === 0);
  normalizePage(productPaginationState, filtered.length);
  renderPagination(productPaginationControls, productPaginationState, filtered.length);

  const startIndex = pageStartIndex(productPaginationState);
  const pageProducts = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  for (const [index, product] of pageProducts.entries()) {
    const row = document.createElement("tr");
    const noCell = createNoCell(startIndex + index + 1);
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
    priceCell.textContent = formatPrice(product.price);
    stockCell.className = "stock";
    stockCell.textContent = formatProductStock(product.stock);

    urlLink.className = "url-link";
    urlLink.href = product.url;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.textContent = product.url;
    urlCell.append(urlLink);

    updatedCell.textContent = formatDate(product.updatedAt);

    row.append(noCell, nameCell, priceCell, stockCell, urlCell, updatedCell);
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
      `新增 URL：${stats.added} 个\n重复 URL：${stats.duplicate} 个\n无效或空值：${stats.invalid} 个\n非1688 URL：${stats.non1688} 个`,
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

userManualButton.addEventListener("click", () => {
  openUserManualModal();
});

userManualCloseButton.addEventListener("click", () => {
  closeUserManualModal();
});

userManualModal.addEventListener("click", (event) => {
  if (event.target === userManualModal) {
    closeUserManualModal();
  }
});

settingsButton.addEventListener("click", async () => {
  settingsButton.disabled = true;
  try {
    await openSettingsModal();
  } catch (error) {
    showImportModal(
      "设置加载失败",
      error instanceof Error ? error.message : "设置加载失败。",
      "error",
    );
  } finally {
    settingsButton.disabled = false;
  }
});

settingsCancelButton.addEventListener("click", () => {
  closeSettingsModal();
});

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) {
    closeSettingsModal();
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    settingsError.hidden = true;
    settingsError.textContent = "";
    const settings = parseSettingsForm();
    await saveAppSettings(settingsTable, settings);
    closeSettingsModal();
    showImportModal("设置已保存", "参数设置已保存。", "success");
  } catch (error) {
    showSettingsError(error instanceof Error ? error.message : "保存设置失败。");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeImportModal();
    closeSettingsModal();
    closeUserManualModal();
  }
});

alertTab.addEventListener("click", () => {
  setActivePanel("alert");
  renderAlertsFromDb();
});

alertPrevPageButton.addEventListener("click", () => {
  if (alertPaginationState.currentPage <= 1) return;
  alertPaginationState.currentPage -= 1;
  savePageState();
  renderAlertsFromDb();
});

alertNextPageButton.addEventListener("click", () => {
  alertPaginationState.currentPage += 1;
  savePageState();
  renderAlertsFromDb();
});

bindPageJump(alertPaginationControls, alertPaginationState, renderAlertsFromDb);

alertHitTypeFilter.addEventListener("change", () => {
  alertHitTypeFilterValue = alertHitTypeFilter.value as AlertHitTypeFilter;
  alertPaginationState.currentPage = 1;
  savePageState();
  renderAlertsFromDb();
});

sourceTab.addEventListener("click", () => {
  setActivePanel("source");
});

sourceStatusFilter.addEventListener("change", () => {
  sourceStatusFilterValue = sourceStatusFilter.value as SourceStatusFilter;
  sourcePaginationState.currentPage = 1;
  savePageState();
  loadDashboardData();
});

sourcePrevPageButton.addEventListener("click", () => {
  if (sourcePaginationState.currentPage <= 1) return;
  sourcePaginationState.currentPage -= 1;
  savePageState();
  loadDashboardData();
});

sourceNextPageButton.addEventListener("click", () => {
  sourcePaginationState.currentPage += 1;
  savePageState();
  loadDashboardData();
});

bindPageJump(sourcePaginationControls, sourcePaginationState, loadDashboardData);

productPrevPageButton.addEventListener("click", () => {
  if (productPaginationState.currentPage <= 1) return;
  productPaginationState.currentPage -= 1;
  savePageState();
  renderProductsFromDb();
});

productNextPageButton.addEventListener("click", () => {
  productPaginationState.currentPage += 1;
  savePageState();
  renderProductsFromDb();
});

bindPageJump(productPaginationControls, productPaginationState, renderProductsFromDb);

productTab.addEventListener("click", () => {
  setActivePanel("product");
  renderProductsFromDb();
});

nameFilter.addEventListener("input", () => {
  productPaginationState.currentPage = 1;
  savePageState();
  renderProductsFromDb();
});

urlFilter.addEventListener("input", () => {
  productPaginationState.currentPage = 1;
  savePageState();
  renderProductsFromDb();
});

const restoredPanel = restorePageState();
setActivePanel(restoredPanel, false);
loadDashboardData();

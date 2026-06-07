import type { Dexie } from "@greasedev/workflow-sdk";
import type { AppSettings, ProductAlertHitType } from "../models/types";

export const APP_SETTINGS_ID = "global" as const;
export const ALL_ALERT_TYPES: ProductAlertHitType[] = [
  "missing",
  "price_increase",
  "low_stock",
];
export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: APP_SETTINGS_ID,
  monitorHourlyRate: 180,
  stockAlertThreshold: 100,
  enabledAlertTypes: [...ALL_ALERT_TYPES],
  updatedAt: "",
};

export const SETTINGS_LIMITS = {
  monitorHourlyRate: {
    min: 1,
    max: 360,
  },
  stockAlertThreshold: {
    min: 1,
  },
} as const;

export type AppSettingsTable = Dexie.Table<AppSettings, string>;

function normalizeInteger(value: unknown, fallback: number, min: number, max?: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;

  const integer = Math.trunc(number);
  const lowerBounded = Math.max(integer, min);
  return max === undefined ? lowerBounded : Math.min(lowerBounded, max);
}

function normalizeEnabledAlertTypes(value: unknown): ProductAlertHitType[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_APP_SETTINGS.enabledAlertTypes];
  }

  const normalized = ALL_ALERT_TYPES.filter((alertType) => value.includes(alertType));
  return normalized.length > 0
    ? normalized
    : [...DEFAULT_APP_SETTINGS.enabledAlertTypes];
}

export function normalizeAppSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    id: APP_SETTINGS_ID,
    monitorHourlyRate: normalizeInteger(
      settings?.monitorHourlyRate,
      DEFAULT_APP_SETTINGS.monitorHourlyRate,
      SETTINGS_LIMITS.monitorHourlyRate.min,
      SETTINGS_LIMITS.monitorHourlyRate.max,
    ),
    stockAlertThreshold: normalizeInteger(
      settings?.stockAlertThreshold,
      DEFAULT_APP_SETTINGS.stockAlertThreshold,
      SETTINGS_LIMITS.stockAlertThreshold.min,
    ),
    enabledAlertTypes: normalizeEnabledAlertTypes(settings?.enabledAlertTypes),
    updatedAt: settings?.updatedAt || new Date().toISOString(),
  };
}

export async function getAppSettings(settingsTable: AppSettingsTable): Promise<AppSettings> {
  const storedSettings = await settingsTable.get(APP_SETTINGS_ID);
  if (storedSettings) {
    return normalizeAppSettings(storedSettings);
  }

  const defaultSettings = normalizeAppSettings(DEFAULT_APP_SETTINGS);
  await settingsTable.put(defaultSettings);
  return defaultSettings;
}

export async function saveAppSettings(
  settingsTable: AppSettingsTable,
  settings: Pick<AppSettings, "monitorHourlyRate" | "stockAlertThreshold" | "enabledAlertTypes">,
): Promise<AppSettings> {
  const normalizedSettings = normalizeAppSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  await settingsTable.put(normalizedSettings);
  return normalizedSettings;
}

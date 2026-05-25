import type { Dexie } from "@greaseclaw/workflow-sdk";
import type { AppSettings } from "../models/types";

export const APP_SETTINGS_ID = "global" as const;
export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: APP_SETTINGS_ID,
  monitorHourlyRate: 60,
  stockAlertThreshold: 100,
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
  settings: Pick<AppSettings, "monitorHourlyRate" | "stockAlertThreshold">,
): Promise<AppSettings> {
  const normalizedSettings = normalizeAppSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  await settingsTable.put(normalizedSettings);
  return normalizedSettings;
}

import posthog from "posthog-js";

export const TELEMETRY_PREFERENCE_STORAGE_KEY = "dragonclaw:telemetry-enabled";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

type TelemetryPropertyValue = string | number | boolean | null | undefined;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

export type TelemetryEventName =
  | "launcher_app_opened"
  | "launcher_ready_workspace_entered"
  | "launcher_workspace_configured"
  | "launcher_setup_completed"
  | "launcher_setup_failed"
  | "launcher_service_start_requested"
  | "launcher_service_stop_requested"
  | "launcher_service_ready"
  | "launcher_service_failed"
  | "launcher_service_repair_requested"
  | "launcher_environment_reinstall_requested"
  | "launcher_api_config_saved"
  | "launcher_default_model_changed"
  | "launcher_saved_provider_upserted"
  | "launcher_saved_provider_deleted"
  | "launcher_config_reset_confirmed"
  | "launcher_chat_message_sent"
  | "launcher_task_run_started";

let telemetryInitialized = false;

function getConfiguredPostHogKey() {
  return import.meta.env.VITE_POSTHOG_KEY?.trim() || "";
}

function getConfiguredPostHogHost() {
  return import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
}

export function getTelemetryHost() {
  return getConfiguredPostHogHost();
}

function canUseBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeTelemetryProperties(properties?: TelemetryProperties) {
  if (!properties) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }
    normalized[key] = value;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function isTelemetryConfigured() {
  return Boolean(getConfiguredPostHogKey());
}

export function getTelemetryEnabled() {
  if (!canUseBrowserStorage()) {
    return true;
  }

  try {
    return window.localStorage.getItem(TELEMETRY_PREFERENCE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function initializeTelemetry() {
  if (telemetryInitialized || typeof window === "undefined") {
    return;
  }

  telemetryInitialized = true;

  const apiKey = getConfiguredPostHogKey();
  if (!apiKey) {
    return;
  }

  try {
    posthog.init(apiKey, {
      api_host: getConfiguredPostHogHost(),
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      loaded: (instance) => {
        if (getTelemetryEnabled()) {
          instance.opt_in_capturing();
          return;
        }

        instance.opt_out_capturing();
      },
    });
  } catch {
    // Telemetry must never block the launcher.
  }
}

export function setTelemetryEnabled(enabled: boolean) {
  if (canUseBrowserStorage()) {
    try {
      window.localStorage.setItem(TELEMETRY_PREFERENCE_STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      // Ignore storage failures and still try to apply runtime preference.
    }
  }

  if (!isTelemetryConfigured()) {
    return enabled;
  }

  initializeTelemetry();

  try {
    if (enabled) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  } catch {
    // Ignore runtime opt-in/opt-out failures.
  }

  return enabled;
}

export function captureTelemetryEvent(event: TelemetryEventName, properties?: TelemetryProperties) {
  if (!isTelemetryConfigured() || !getTelemetryEnabled()) {
    return;
  }

  initializeTelemetry();

  try {
    posthog.capture(event, normalizeTelemetryProperties(properties));
  } catch {
    // Telemetry failures should never affect product behavior.
  }
}

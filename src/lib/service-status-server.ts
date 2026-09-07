import "server-only";

import { ApiRouteError } from "@/lib/api-contracts";
import { BANDORI_SERVER_CODES } from "@/lib/bandori-server";
import { getBandoriBackendToken } from "@/lib/hhwx-bandori-backend-server";
import type { ServiceStatusEntry, ServiceStatusSnapshot } from "@/lib/service-status";

const POLL_INTERVAL_MS = 60_000;
const UNCONFIRMED_LIMIT_MS = 180_000;
const MAX_RESPONSE_BYTES = 65_536;
const SERVICE_NAMES = {
  cutoffTracker: "scoreTracking",
  userFetcher: "userFetch",
  masterBuilder: "dataBuild",
  assetsBuilder: "assetBuild",
} as const;

type CachedEntry = {
  service: keyof typeof SERVICE_NAMES;
  server: typeof BANDORI_SERVER_CODES[number];
  value: ServiceStatusEntry;
  unconfirmedSince: number | null;
};

type Collector = {
  entries: CachedEntry[];
  checkedAt: string | null;
  checkedAtMonotonic: number;
};

// Share one collector across route bundles and development module reloads.
// ponytail: memory is per Node process; coordinate only if deploying multiple replicas.
const processState = globalThis as typeof globalThis & {
  hhwxServiceStatusCollector?: Collector;
};

function readConfiguration() {
  const baseUrl = process.env.HHWX_USER_FETCHER_BASE_URL?.trim();
  const token = getBandoriBackendToken();
  try {
    if (!baseUrl || !token) throw new Error();
    const base = new URL(baseUrl);
    if (!["http:", "https:"].includes(base.protocol)
      || base.username || base.password || base.search || base.hash) throw new Error();
    return { endpoint: `${base.href.replace(/\/+$/u, "")}/internal/service-health`, token };
  } catch {
    throw new ApiRouteError(503, "SERVICE_STATUS_NOT_CONFIGURED", "Service status is not configured");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConfirmedEntry(value: unknown): ServiceStatusEntry | null {
  if (!isRecord(value) || value.reportState !== "confirmed"
    || !["operational", "maintenance", "error"].includes(value.status as string)
    || typeof value.observedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(value.observedAt)) {
    return null;
  }
  const timestamp = Date.parse(value.observedAt);
  if (!Number.isFinite(timestamp)) return null;
  const observedAt = new Date(timestamp).toISOString();
  if (observedAt.slice(0, 19) !== value.observedAt.slice(0, 19)) return null;
  return {
    status: value.status as ServiceStatusEntry["status"],
    observedAt,
    ...(value.status === "error" && value.reasonCode === "update_required"
      ? { reasonCode: "update_required" as const } : {}),
  };
}

async function fetchComponents(config: ReturnType<typeof readConfiguration>) {
  const response = await fetch(config.endpoint, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Service health response unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Service health response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const payload: unknown = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  if (!isRecord(payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.components)) {
    throw new Error("Invalid service health response");
  }
  return payload.components.filter(isRecord);
}

export function startServiceStatusPolling(): void {
  if (processState.hhwxServiceStatusCollector) return;
  let config: ReturnType<typeof readConfiguration>;
  try {
    config = readConfiguration();
  } catch {
    // This private integration is optional for self-hosted installations.
    console.warn("[service-status] Configure HHWX_USER_FETCHER_BASE_URL and HHWX_BANDORI_BACKEND_TOKEN to enable collection.");
    return;
  }
  const startedAt = performance.now();
  const collector: Collector = {
    entries: (Object.keys(SERVICE_NAMES) as CachedEntry["service"][]).flatMap((service) =>
      BANDORI_SERVER_CODES.map((server) => ({
        service, server, value: { status: null, observedAt: null }, unconfirmedSince: startedAt,
      }))),
    checkedAt: null,
    checkedAtMonotonic: startedAt,
  };
  processState.hhwxServiceStatusCollector = collector;
  let inFlight = false;
  async function poll() {
    if (inFlight) return;
    inFlight = true;
    const attemptedAt = performance.now();
    let components: Record<string, unknown>[] = [];
    try {
      components = await fetchComponents(config);
    } catch {
      // Failed reads cannot confirm any component. Never expose upstream errors.
    }
    const now = performance.now();
    for (const entry of collector.entries) {
      const matches = components.filter((item) =>
        item.service === SERVICE_NAMES[entry.service] && item.server === entry.server);
      const confirmed = matches.length === 1 ? readConfirmedEntry(matches[0]) : null;
      if (confirmed) {
        entry.value = confirmed;
        entry.unconfirmedSince = null;
      } else {
        entry.unconfirmedSince ??= Math.min(attemptedAt, collector.checkedAtMonotonic + POLL_INTERVAL_MS);
      }
    }
    collector.checkedAt = new Date().toISOString();
    collector.checkedAtMonotonic = now;
    inFlight = false;
  }
  void poll();
  setInterval(() => { void poll(); }, POLL_INTERVAL_MS).unref();
}

export function readServiceStatus(): ServiceStatusSnapshot {
  const collector = processState.hhwxServiceStatusCollector;
  if (!collector) {
    readConfiguration();
    throw new ApiRouteError(503, "SERVICE_STATUS_UNAVAILABLE", "Service status is unavailable");
  }
  const now = performance.now();
  const entries = collector.entries.map((entry) => {
    // A stalled collector also cannot keep an old confirmation valid forever.
    const unconfirmedSince = entry.unconfirmedSince
      ?? collector.checkedAtMonotonic + POLL_INTERVAL_MS;
    const value: ServiceStatusEntry = now - unconfirmedSince >= UNCONFIRMED_LIMIT_MS
      ? { status: "error", observedAt: entry.value.observedAt }
      : { ...entry.value };
    return { ...entry, value };
  });
  return {
    data: {
      hhwxBandoriBackend: Object.fromEntries(Object.keys(SERVICE_NAMES).map((service) => [
        service,
        Object.fromEntries(entries.filter((entry) => entry.service === service)
          .map((entry) => [entry.server, entry.value])),
      ])) as ServiceStatusSnapshot["data"]["hhwxBandoriBackend"],
    },
    meta: { checkedAt: collector.checkedAt },
  };
}

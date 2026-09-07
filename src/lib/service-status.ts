import type { BandoriServerCode } from "./bandori-server";

export type ServiceStatusEntry = {
  status: "operational" | "maintenance" | "error" | null;
  observedAt: string | null;
  reasonCode?: "update_required";
};

export type ServiceStatusData = {
  hhwxBandoriBackend: Record<
    "cutoffTracker" | "userFetcher" | "masterBuilder" | "assetsBuilder",
    Record<BandoriServerCode, ServiceStatusEntry>
  >;
};

export type ServiceStatusSnapshot = {
  data: ServiceStatusData;
  meta: { checkedAt: string | null };
};

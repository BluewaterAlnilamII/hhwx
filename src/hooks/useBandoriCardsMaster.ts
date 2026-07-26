"use client";

import { useMemo } from "react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import {
  materializeBandoriCardsMasterForServer,
  materializeBandoriCardsMasterForServerWithJpFallback,
  parseBandoriCardsMasterResponse,
  type BandoriCardsMasterMap,
} from "@/lib/bandori-cards-api-client";
import type { BandoriServer } from "@/lib/bandori-server";

const BANDORI_CARDS_MASTER_CACHE_KEY = "bandori-master-cards-canonical-v1";
export type BandoriCardsMissingCardFallback = "none" | "jp";

export function useBandoriCardsMaster(
  server?: BandoriServer,
  enabled = true,
  missingCardFallback: BandoriCardsMissingCardFallback = "none",
): {
  data: BandoriCardsMasterMap | null;
  canonicalData: BandoriCardsMasterMap | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
} {
  const result = useCachedFetch(
    enabled ? BANDORI_CARDS_MASTER_CACHE_KEY : null,
    enabled ? "/api/bandori/master/cards" : null,
    parseBandoriCardsMasterResponse,
    { ...SESSION_CLIENT_CACHE_POLICY },
  );
  const data = useMemo(() => {
    if (!result.data || server === undefined) {
      return result.data;
    }
    return missingCardFallback === "jp"
      ? materializeBandoriCardsMasterForServerWithJpFallback(result.data, server)
      : materializeBandoriCardsMasterForServer(result.data, server);
  }, [missingCardFallback, result.data, server]);

  return {
    ...result,
    data,
    canonicalData: result.data,
  };
}

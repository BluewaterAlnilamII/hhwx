"use client";

import { useEffect } from "react";
import { create } from "zustand";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  normalizeBandoriServer,
  type BandoriServer,
} from "@/lib/bandori-server";

const PREFERRED_SERVER_STORAGE_KEY = "hhwx:bandori:preferred-server:v1";

type BandoriPreferencesStore = {
  preferredServer: BandoriServer;
  hydrated: boolean;
  setPreferredServer: (server: BandoriServer) => void;
  hydratePreferredServer: () => void;
};

export const useBandoriPreferencesStore = create<BandoriPreferencesStore>((set) => ({
  preferredServer: DEFAULT_BANDORI_PREFERRED_SERVER,
  hydrated: false,
  setPreferredServer: (server) => {
    set({ preferredServer: server, hydrated: true });
    try {
      window.localStorage.setItem(PREFERRED_SERVER_STORAGE_KEY, String(server));
    } catch {
      // Browser storage is an optional persistence layer; in-memory state remains authoritative.
    }
  },
  hydratePreferredServer: () => {
    let preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER;
    try {
      preferredServer = normalizeBandoriServer(
        window.localStorage.getItem(PREFERRED_SERVER_STORAGE_KEY),
      ) ?? DEFAULT_BANDORI_PREFERRED_SERVER;
    } catch {
      // Keep the deterministic CN default when storage is unavailable.
    }
    set({ preferredServer, hydrated: true });
  },
}));

export function useBandoriPreferredServer(): BandoriServer {
  const preferredServer = useBandoriPreferencesStore((state) => state.preferredServer);
  const hydrated = useBandoriPreferencesStore((state) => state.hydrated);
  const hydratePreferredServer = useBandoriPreferencesStore((state) => state.hydratePreferredServer);

  useEffect(() => {
    if (!hydrated) {
      hydratePreferredServer();
    }
  }, [hydratePreferredServer, hydrated]);

  return preferredServer;
}

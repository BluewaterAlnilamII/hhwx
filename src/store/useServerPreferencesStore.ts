"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { DEFAULT_BANDORI_PREFERRED_SERVER, normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import { DEFAULT_OURNOTES_PREFERRED_SERVER, normalizeOurNotesServer } from "@/lib/ournotes/server";
import type { OurNotesServer } from "@/lib/ournotes/master-contract";

type ServerPreferences<Server extends number> = {
  preferredServer: Server;
  hydrated: boolean;
  setPreferredServer: (server: Server) => void;
  hydratePreferredServer: () => void;
};

function createServerPreferences<Server extends number>(storageKey: string, defaultServer: Server, normalize: (value: unknown) => Server | null) {
  const useStore = create<ServerPreferences<Server>>((set, get) => ({
    preferredServer: defaultServer,
    hydrated: false,
    setPreferredServer: (value) => {
      const server = normalize(value);
      if (server === null) return;
      set({ preferredServer: server, hydrated: true });
      try {
        window.localStorage.setItem(storageKey, String(server));
      } catch {
        // Browser storage is optional; in-memory state remains authoritative.
      }
    },
    hydratePreferredServer: () => {
      if (get().hydrated) return;
      let preferredServer = defaultServer;
      try {
        preferredServer = normalize(window.localStorage.getItem(storageKey)) ?? defaultServer;
      } catch {
        // Keep the deterministic default when storage is unavailable.
      }
      set({ preferredServer, hydrated: true });
    },
  }));

  function usePreferredServer(): Server {
    const preferredServer = useStore((state) => state.preferredServer);
    const hydrated = useStore((state) => state.hydrated);
    const hydratePreferredServer = useStore((state) => state.hydratePreferredServer);
    useEffect(() => {
      if (!hydrated) hydratePreferredServer();
    }, [hydratePreferredServer, hydrated]);
    return preferredServer;
  }

  return { useStore, usePreferredServer };
}

export const { useStore: useBandoriPreferencesStore, usePreferredServer: useBandoriPreferredServer } =
  createServerPreferences<BandoriServer>("hhwx:bandori:preferred-server:v1", DEFAULT_BANDORI_PREFERRED_SERVER, normalizeBandoriServer);
export const { useStore: useOurNotesPreferencesStore, usePreferredServer: useOurNotesPreferredServer } =
  createServerPreferences<OurNotesServer>("hhwx:ournotes:preferred-server:v1", DEFAULT_OURNOTES_PREFERRED_SERVER, normalizeOurNotesServer);

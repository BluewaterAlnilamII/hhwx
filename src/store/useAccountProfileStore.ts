"use client";

import { useStore } from "zustand";
import { createAccountProfileStore } from "@/lib/account-profile-store";
import { getSafeSession } from "@/lib/supabase";

export const accountProfileStore = createAccountProfileStore({
  getAccessToken: async () => {
    const session = await getSafeSession();
    return session?.access_token ?? null;
  },
});

export function useAccountProfileStore<T>(
  selector: (state: ReturnType<typeof accountProfileStore.getState>) => T,
): T {
  return useStore(accountProfileStore, selector);
}

import { createStore, type StoreApi } from "zustand/vanilla";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { type BandoriServer } from "@/lib/bandori-server";

export type AccountProfile = {
  userId: string;
  publicUid: number;
  email: string | null;
  emailVerified: boolean;
  username: string;
  avatarCardId: number;
  avatarCardServer: BandoriServer | null;
  avatarCardTrainType: "normal" | "after_training";
  displayDegreeServer: BandoriServer;
  displayDegreeId: number;
  displayDegreeEffectId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  roles: string[];
};

export class AccountProfileRequestError extends Error {
  readonly status: number | null;
  readonly payload: unknown;
  readonly reason: "unauthenticated" | "http" | "invalid-response" | "unknown";

  constructor(
    message: string,
    options?: {
      status?: number | null;
      payload?: unknown;
      reason?: "unauthenticated" | "http" | "invalid-response" | "unknown";
    },
  ) {
    super(message);
    this.name = "AccountProfileRequestError";
    this.status = options?.status ?? null;
    this.payload = options?.payload;
    this.reason = options?.reason ?? "unknown";
  }
}

export type AccountProfileStoreStatus = "idle" | "loading" | "ready" | "error";

export type AccountProfileStoreState = {
  userId: string | null;
  profile: AccountProfile | null;
  status: AccountProfileStoreStatus;
  error: AccountProfileRequestError | null;
  loadProfile: (userId: string, options?: { force?: boolean }) => Promise<AccountProfile>;
  setProfile: (profile: AccountProfile) => void;
  clearProfile: () => void;
};

type AccountProfileStoreDependencies = {
  fetcher?: typeof fetch;
  getAccessToken: () => Promise<string | null>;
};

type InFlightProfileRequest = {
  userId: string;
  promise: Promise<AccountProfile>;
};

/**
 * Creates the page-lifetime account profile store. Requests for the same user
 * share one promise, while mutation responses invalidate older GET results so
 * stale reads cannot roll profile changes back.
 */
export function createAccountProfileStore({
  fetcher = fetch,
  getAccessToken,
}: AccountProfileStoreDependencies): StoreApi<AccountProfileStoreState> {
  let requestSequence = 0;
  let inFlightRequest: InFlightProfileRequest | null = null;

  return createStore<AccountProfileStoreState>((set, get) => ({
    userId: null,
    profile: null,
    status: "idle",
    error: null,

    loadProfile: (userId, options) => {
      const current = get();
      if (
        !options?.force
        && current.userId === userId
        && current.profile
        && current.status === "ready"
      ) {
        return Promise.resolve(current.profile);
      }

      if (inFlightRequest?.userId === userId) {
        return inFlightRequest.promise;
      }

      const sequence = requestSequence + 1;
      requestSequence = sequence;
      const previousProfile = current.userId === userId ? current.profile : null;

      const promise = (async () => {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new AccountProfileRequestError("Account session is unavailable", {
            status: 401,
            reason: "unauthenticated",
          });
        }

        const response = await fetcher("/api/account/profile", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new AccountProfileRequestError(
            `Account profile request failed: HTTP ${response.status}`,
            {
              status: response.status,
              payload,
              reason: "http",
            },
          );
        }

        const profile = parseApiSuccessData<AccountProfile>(payload);
        if (!profile || profile.userId !== userId) {
          throw new AccountProfileRequestError("Account profile response is invalid", {
            status: response.status,
            payload,
            reason: "invalid-response",
          });
        }

        if (requestSequence === sequence) {
          set({
            userId,
            profile,
            status: "ready",
            error: null,
          });
        }
        return profile;
      })()
        .catch((error: unknown) => {
          const profileError = error instanceof AccountProfileRequestError
            ? error
            : new AccountProfileRequestError(
              error instanceof Error ? error.message : "Account profile request failed",
            );
          if (requestSequence === sequence) {
            set({
              userId,
              profile: previousProfile,
              status: "error",
              error: profileError,
            });
          }
          throw profileError;
        })
        .finally(() => {
          if (inFlightRequest?.promise === promise) {
            inFlightRequest = null;
          }
        });

      inFlightRequest = { userId, promise };
      set({
        userId,
        profile: previousProfile,
        status: "loading",
        error: null,
      });
      return promise;
    },

    setProfile: (profile) => {
      requestSequence += 1;
      inFlightRequest = null;
      set({
        userId: profile.userId,
        profile,
        status: "ready",
        error: null,
      });
    },

    clearProfile: () => {
      requestSequence += 1;
      inFlightRequest = null;
      set({
        userId: null,
        profile: null,
        status: "idle",
        error: null,
      });
    },
  }));
}

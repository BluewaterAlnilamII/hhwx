import type {
  BestdoriCardMaster,
  BestdoriSkillMaster,
} from "@/lib/bandori-team-calculator";

export const TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS = 5 * 60 * 1000;
export const TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS = 60 * 60 * 1000;
export const TEAM_SEARCH_CHART_CACHE_MAX_ENTRIES = 64;

export type TimedCacheSnapshot<T> = {
  value: T;
  generation: number;
  loadedAt: number;
};

type CacheLoadOptions = {
  forceRefresh?: boolean;
};

type AtomicTimedCacheOptions = {
  freshTimeMs: number;
  now?: () => number;
};

export type AtomicTimedCache<T> = {
  get: (
    loader: (requestCache: RequestCache) => Promise<T>,
    options?: CacheLoadOptions,
  ) => Promise<TimedCacheSnapshot<T>>;
  peek: () => TimedCacheSnapshot<T> | null;
};

export function createAtomicTimedCache<T>({
  freshTimeMs,
  now = Date.now,
}: AtomicTimedCacheOptions): AtomicTimedCache<T> {
  let active: TimedCacheSnapshot<T> | null = null;
  let refreshPromise: Promise<TimedCacheSnapshot<T>> | null = null;
  let refreshRequestCache: RequestCache | null = null;

  const get: AtomicTimedCache<T>["get"] = (loader, options = {}) => {
    if (
      !options.forceRefresh
      && active
      && now() - active.loadedAt < freshTimeMs
    ) {
      return Promise.resolve(active);
    }
    if (refreshPromise) {
      if (options.forceRefresh && refreshRequestCache !== "no-cache") {
        const activeRefresh = refreshPromise;
        return activeRefresh.then(
          () => get(loader, { forceRefresh: true }),
          () => get(loader, { forceRefresh: true }),
        );
      }
      return refreshPromise;
    }

    const requestCache: RequestCache = active || options.forceRefresh ? "no-cache" : "default";
    refreshRequestCache = requestCache;
    const request = loader(requestCache)
      .then((value) => {
        const snapshot: TimedCacheSnapshot<T> = {
          value,
          generation: (active?.generation ?? 0) + 1,
          loadedAt: now(),
        };
        active = snapshot;
        return snapshot;
      })
      .finally(() => {
        if (refreshPromise === request) {
          refreshPromise = null;
          refreshRequestCache = null;
        }
      });
    refreshPromise = request;
    return request;
  };

  return {
    get,
    peek: () => active,
  };
}

type TimedLruCacheOptions = AtomicTimedCacheOptions & {
  maxEntries: number;
};

type TimedLruCacheEntry<T> = {
  snapshot: TimedCacheSnapshot<T> | null;
  promise: Promise<TimedCacheSnapshot<T>> | null;
  requestCache: RequestCache | null;
};

export type TimedLruCache<T> = {
  get: (
    key: string,
    loader: (requestCache: RequestCache) => Promise<T>,
    options?: CacheLoadOptions,
  ) => Promise<TimedCacheSnapshot<T>>;
  has: (key: string) => boolean;
  size: () => number;
};

export function createTimedLruCache<T>({
  freshTimeMs,
  maxEntries,
  now = Date.now,
}: TimedLruCacheOptions): TimedLruCache<T> {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Timed LRU cache must retain at least one entry");
  }

  const entries = new Map<string, TimedLruCacheEntry<T>>();

  const touch = (key: string, entry: TimedLruCacheEntry<T>): void => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const trim = (): void => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (typeof oldestKey !== "string") {
        return;
      }
      entries.delete(oldestKey);
    }
  };

  const get: TimedLruCache<T>["get"] = (key, loader, options = {}) => {
    const existing = entries.get(key);
    if (existing) {
      touch(key, existing);
      const snapshot = existing.snapshot;
      if (
        !options.forceRefresh
        && snapshot
        && now() - snapshot.loadedAt < freshTimeMs
      ) {
        return Promise.resolve(snapshot);
      }
      if (existing.promise) {
        if (options.forceRefresh && existing.requestCache !== "no-cache") {
          const activeRefresh = existing.promise;
          return activeRefresh.then(
            () => get(key, loader, { forceRefresh: true }),
            () => get(key, loader, { forceRefresh: true }),
          );
        }
        return existing.promise;
      }
    }

    const entry: TimedLruCacheEntry<T> = existing ?? {
      snapshot: null,
      promise: null,
      requestCache: null,
    };
    const requestCache: RequestCache = entry.snapshot || options.forceRefresh ? "no-cache" : "default";
    entry.requestCache = requestCache;
    const request = loader(requestCache)
      .then((value) => {
        const snapshot: TimedCacheSnapshot<T> = {
          value,
          generation: (entry.snapshot?.generation ?? 0) + 1,
          loadedAt: now(),
        };
        entry.snapshot = snapshot;
        return snapshot;
      })
      .catch((error) => {
        if (entries.get(key) === entry && !entry.snapshot) {
          entries.delete(key);
        }
        throw error;
      })
      .finally(() => {
        if (entry.promise === request) {
          entry.promise = null;
          entry.requestCache = null;
        }
      });
    entry.promise = request;
    touch(key, entry);
    trim();
    return request;
  };

  return {
    get,
    has: (key) => entries.has(key),
    size: () => entries.size,
  };
}

export class TeamSearchDataIntegrityError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(", "));
    this.name = "TeamSearchDataIntegrityError";
  }
}

type CharacterMasterMap = Record<string, { bandId?: number | null } | undefined>;
type AreaItemMasterMap = Record<string, unknown>;
type SongMasterMap = Record<string, unknown>;

function readPositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
}

function throwIntegrityIssues(issues: string[]): void {
  if (issues.length > 0) {
    throw new TeamSearchDataIntegrityError(issues.slice(0, 20));
  }
}

export function assertTeamSearchMasterReferences({
  cardsById,
  charactersById,
  skillsById,
}: {
  cardsById: Record<string, BestdoriCardMaster | undefined>;
  charactersById: CharacterMasterMap;
  skillsById: Record<string, BestdoriSkillMaster | undefined>;
}): void {
  const issues: string[] = [];
  for (const [cardId, card] of Object.entries(cardsById)) {
    if (!card) {
      continue;
    }
    const characterId = readPositiveInteger(card.characterId);
    const skillId = readPositiveInteger(card.skillId);
    if (characterId === null || !charactersById[String(characterId)]) {
      issues.push(`card ${cardId} -> character ${characterId ?? "invalid"}`);
    }
    if (skillId === null || !skillsById[String(skillId)]) {
      issues.push(`card ${cardId} -> skill ${skillId ?? "invalid"}`);
    }
    if (issues.length >= 20) {
      break;
    }
  }
  throwIntegrityIssues(issues);
}

export function assertTeamSearchRequestReferences({
  cardIds,
  eventCardIds,
  areaItemIds,
  externalSkillIds,
  songIds,
  cardsById,
  areaItemsById,
  skillsById,
  songsById,
}: {
  cardIds: Iterable<number>;
  eventCardIds: Iterable<number>;
  areaItemIds: Iterable<number>;
  externalSkillIds: Iterable<number>;
  songIds: Iterable<number>;
  cardsById: Record<string, BestdoriCardMaster | undefined>;
  areaItemsById: AreaItemMasterMap;
  skillsById: Record<string, BestdoriSkillMaster | undefined>;
  songsById: SongMasterMap;
}): void {
  const issues: string[] = [];
  for (const cardId of cardIds) {
    if (!cardsById[String(cardId)]) {
      issues.push(`selected card ${cardId}`);
    }
  }
  for (const cardId of eventCardIds) {
    if (!cardsById[String(cardId)]) {
      issues.push(`event card ${cardId}`);
    }
  }
  for (const areaItemId of areaItemIds) {
    if (!areaItemsById[String(areaItemId)]) {
      issues.push(`area item ${areaItemId}`);
    }
  }
  for (const skillId of externalSkillIds) {
    if (!skillsById[String(skillId)]) {
      issues.push(`external skill ${skillId}`);
    }
  }
  for (const songId of songIds) {
    if (!songsById[String(songId)]) {
      issues.push(`song ${songId}`);
    }
  }
  throwIntegrityIssues(issues);
}

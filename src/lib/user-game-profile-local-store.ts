"use client";

import {
  decodeCompressedGameProfilePayload,
  encodeCompressedGameProfilePayload,
  getGameProfileCardCount,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";

const DB_NAME = "hhwx-game-profiles";
const DB_VERSION = 1;
const STORE_NAME = "profiles";

export type LocalGameProfileSummary = {
  id: string;
  kind: "manual";
  name: string;
  server: number;
  sourceGameUid: null;
  isEditable: true;
  cardCount: number;
  syncedAt: null;
  updatedAt: string;
  location: "local";
};

type LocalGameProfileRecord = LocalGameProfileSummary & CompressedGameProfilePayload;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("打开本地 Profile 数据库失败"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("访问本地 Profile 失败"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("访问本地 Profile 失败"));
    };
  });
}

export function isLocalGameProfileId(profileId: string): boolean {
  return profileId.startsWith("local_");
}

export async function listLocalGameProfiles(): Promise<LocalGameProfileSummary[]> {
  const records = await withStore<LocalGameProfileRecord[]>("readonly", (store) => store.getAll());
  return records
    .map((record) => ({
      id: record.id,
      kind: record.kind,
      name: record.name,
      server: record.server,
      sourceGameUid: record.sourceGameUid,
      isEditable: record.isEditable,
      cardCount: record.cardCount,
      syncedAt: record.syncedAt,
      updatedAt: record.updatedAt,
      location: record.location,
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readLocalCompressedGameProfile(profileId: string): Promise<CompressedGameProfilePayload> {
  const record = await withStore<LocalGameProfileRecord | undefined>("readonly", (store) => store.get(profileId));
  if (!record) {
    throw new Error("本地 Profile 不存在");
  }

  return {
    storageCodec: record.storageCodec,
    payloadCompressed: record.payloadCompressed,
    payloadSha256: record.payloadSha256,
    payloadSize: record.payloadSize,
  };
}

export async function readLocalGameProfilePayload(profileId: string): Promise<UserGameProfilePayload> {
  return decodeCompressedGameProfilePayload(await readLocalCompressedGameProfile(profileId));
}

export async function saveLocalGameProfilePayload(
  payload: UserGameProfilePayload,
  name = payload.bestdoriProfile.name || "Manual Profile",
): Promise<LocalGameProfileSummary> {
  const compressed = await encodeCompressedGameProfilePayload(payload);
  const now = new Date().toISOString();
  const record: LocalGameProfileRecord = {
    id: `local_${crypto.randomUUID()}`,
    kind: "manual",
    name,
    server: payload.bestdoriProfile.server,
    sourceGameUid: null,
    isEditable: true,
    cardCount: getGameProfileCardCount(payload),
    syncedAt: null,
    updatedAt: now,
    location: "local",
    ...compressed,
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteLocalGameProfile(profileId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(profileId));
}

export async function duplicateLocalGameProfile(profileId: string, name: string): Promise<LocalGameProfileSummary> {
  const payload = await readLocalGameProfilePayload(profileId);
  payload.bestdoriProfile.name = name;
  return saveLocalGameProfilePayload(payload, name);
}

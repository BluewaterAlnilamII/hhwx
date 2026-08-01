import { normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import type { CompressedGameProfilePayload } from "@/lib/user-game-profile-payload";
import { decodeGameProfilePayload } from "@/lib/user-game-profile-payload-server";

export type StoredGameProfileServerRow = {
  id: string;
  server: number;
  storage_codec: string;
  payload_compressed: string;
  payload_sha256: string;
  payload_size: number;
};

export type StoredGameProfileServerInspection = {
  payloadServer: BandoriServer;
  storedServer: BandoriServer | null;
  matches: boolean;
};

export function inspectStoredGameProfileServer(
  row: StoredGameProfileServerRow,
): StoredGameProfileServerInspection {
  const compressed: CompressedGameProfilePayload = {
    storageCodec: row.storage_codec as CompressedGameProfilePayload["storageCodec"],
    payloadCompressed: row.payload_compressed,
    payloadSha256: row.payload_sha256,
    payloadSize: row.payload_size,
  };
  const payload = decodeGameProfilePayload(compressed);
  const payloadServer = normalizeBandoriServer(payload.bestdoriProfile.server);
  if (payloadServer === null) {
    throw new Error("Invalid Bandori server in stored game profile payload");
  }

  const storedServer = normalizeBandoriServer(row.server);
  return {
    payloadServer,
    storedServer,
    matches: storedServer === payloadServer,
  };
}

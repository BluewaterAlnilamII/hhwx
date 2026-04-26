import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  USER_GAME_PROFILE_STORAGE_CODEC,
  compactGameProfilePayload,
  type CompressedGameProfilePayload,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";

export function encodeGameProfilePayload(payload: UserGameProfilePayload): CompressedGameProfilePayload {
  const json = JSON.stringify(compactGameProfilePayload(payload));
  const rawBytes = Buffer.from(json, "utf8");
  return {
    storageCodec: USER_GAME_PROFILE_STORAGE_CODEC,
    payloadCompressed: gzipSync(rawBytes).toString("base64"),
    payloadSha256: createHash("sha256").update(rawBytes).digest("hex"),
    payloadSize: rawBytes.length,
  };
}

export function decodeGameProfilePayload(compressed: CompressedGameProfilePayload): UserGameProfilePayload {
  if (compressed.storageCodec !== USER_GAME_PROFILE_STORAGE_CODEC) {
    throw new Error(`Unsupported game profile storage codec: ${compressed.storageCodec}`);
  }

  const rawBytes = gunzipSync(Buffer.from(compressed.payloadCompressed, "base64"));
  const sha256 = createHash("sha256").update(rawBytes).digest("hex");
  if (sha256 !== compressed.payloadSha256) {
    throw new Error("Game profile payload checksum mismatch");
  }

  const payload = JSON.parse(rawBytes.toString("utf8")) as UserGameProfilePayload;
  if (!payload.bestdoriProfile) {
    throw new Error("Invalid game profile payload format");
  }
  return payload;
}

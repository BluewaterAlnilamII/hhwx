export const CHAT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_IMAGE_MAX_DIMENSION = 4096;
export const CHAT_IMAGE_MAX_ATTACHMENTS = 10;
export const CHAT_IMAGE_PREFIX = "user/images/temporary/";
export const CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/apng"] as const;
export type ChatImageType = typeof CHAT_IMAGE_TYPES[number];
export type ChatImageMetadata = { width: number; height: number; bytes: number; contentType: ChatImageType; hash: string };
export type ChatImage = ChatImageMetadata & { key: string };
export type PreparedChatImage = ChatImageMetadata & { blob: Blob };
export type ChatImageUpload = { url: string; receipt: string; expiresAt: number; headers: Record<string, string> };

export function isChatImageMetadata(value: unknown): value is ChatImageMetadata {
  if (!value || typeof value !== "object") return false;
  const m = value as ChatImageMetadata;
  return Number.isSafeInteger(m.width) && m.width > 0 && m.width <= CHAT_IMAGE_MAX_DIMENSION
    && Number.isSafeInteger(m.height) && m.height > 0 && m.height <= CHAT_IMAGE_MAX_DIMENSION
    && Number.isSafeInteger(m.bytes) && m.bytes > 0 && m.bytes <= CHAT_IMAGE_MAX_BYTES
    && CHAT_IMAGE_TYPES.includes(m.contentType) && typeof m.hash === "string" && /^[a-f0-9]{64}$/u.test(m.hash);
}

export function isChatImage(value: unknown): value is ChatImage {
  if (!isChatImageMetadata(value)) return false;
  const key = (value as ChatImage).key;
  return typeof key === "string" && /^user\/images\/temporary\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(jpg|png|webp|gif)$/u.test(key);
}

export function chatImageUrl(image: ChatImage): string {
  const base = (process.env.NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL || "https://cdn.hhwx.org").replace(/\/+$/u, "");
  return `${base}/${image.key}`;
}

import { CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_MAX_DIMENSION, CHAT_IMAGE_MAX_PIXELS, type ChatImageType, type PreparedChatImage } from "./chat-image-contract";

/** Inspect container markers, not file extensions: PNG and WebP may also animate. */
export function inspectChatImage(bytes: Uint8Array): { contentType: ChatImageType; animated: boolean } {
  const ascii = (offset: number, size: number) => String.fromCharCode(...bytes.subarray(offset, offset + size));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return { contentType: "image/gif", animated: true };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { contentType: "image/jpeg", animated: false };
  if (bytes.length >= 24 && ascii(1, 3) === "PNG" && bytes[0] === 137 && view.getUint32(4) === 0x0d0a1a0a) {
    for (let pos = 8; pos + 12 <= bytes.length;) {
      const size = view.getUint32(pos), tag = ascii(pos + 4, 4);
      if (size > bytes.length - pos - 12) throw new Error("CHAT_IMAGE_INVALID");
      if (tag === "acTL") return { contentType: "image/apng", animated: true };
      if (tag === "IDAT") return { contentType: "image/png", animated: false };
      pos += size + 12;
    }
    throw new Error("CHAT_IMAGE_INVALID");
  }
  if (bytes.length >= 20 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    for (let pos = 12; pos + 8 <= bytes.length;) {
      const size = view.getUint32(pos + 4, true), tag = ascii(pos, 4);
      if (size > bytes.length - pos - 8) throw new Error("CHAT_IMAGE_INVALID");
      if (tag === "VP8X" && size >= 10) return { contentType: "image/webp", animated: !!(bytes[pos + 8] & 2) };
      if (tag === "VP8 " || tag === "VP8L") return { contentType: "image/webp", animated: false };
      pos += 8 + size + (size & 1);
    }
    throw new Error("CHAT_IMAGE_INVALID");
  }
  throw new Error("CHAT_IMAGE_FORMAT");
}

export async function prepareChatImage(file: Blob): Promise<PreparedChatImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectChatImage(bytes);
  if (info.animated && file.size > CHAT_IMAGE_MAX_BYTES) throw new Error("CHAT_IMAGE_ANIMATED_LIMIT");
  const original = new Blob([bytes], { type: info.contentType });
  const bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
  let width = bitmap.width, height = bitmap.height, blob = original;
  let contentType = info.contentType;
  try {
    if (!width || !height) throw new Error("CHAT_IMAGE_INVALID");
    const scale = Math.min(1, CHAT_IMAGE_MAX_DIMENSION / Math.max(width, height), Math.sqrt(CHAT_IMAGE_MAX_PIXELS / (width * height)));
    if (info.animated && scale < 1) throw new Error("CHAT_IMAGE_ANIMATED_LIMIT");
    if (scale < 1 || file.size > CHAT_IMAGE_MAX_BYTES) {
      width = Math.max(1, Math.floor(width * scale)); height = Math.max(1, Math.floor(height * scale));
      // Bounded attempts in a worker; WebP retains transparency unlike JPEG.
      for (let round = 0; round < 3; round++) {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("CHAT_IMAGE_PROCESSING");
        context.drawImage(bitmap, 0, 0, width, height);
        for (const quality of [0.9, 0.75, 0.6]) {
          blob = await canvas.convertToBlob({ type: "image/webp", quality });
          if (blob.size <= CHAT_IMAGE_MAX_BYTES) break;
        }
        if (blob.size <= CHAT_IMAGE_MAX_BYTES) break;
        if (round < 2) { width = Math.max(1, Math.floor(width * 0.8)); height = Math.max(1, Math.floor(height * 0.8)); }
      }
      if (blob.size > CHAT_IMAGE_MAX_BYTES) throw new Error("CHAT_IMAGE_TOO_LARGE");
      if (blob.type !== "image/webp" && blob.type !== "image/png") throw new Error("CHAT_IMAGE_PROCESSING");
      contentType = blob.type;
    }
  } finally { bitmap.close(); }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return { blob, width, height, bytes: blob.size, contentType, hash };
}

/** Clipboard representation only; the source image and upload bytes are unchanged. */
export async function createChatClipboardPng(file: Blob): Promise<Blob> {
  const info = inspectChatImage(new Uint8Array(await file.arrayBuffer()));
  if (info.contentType === "image/png" && !info.animated) return new Blob([file], { type: "image/png" });
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CHAT_IMAGE_PROCESSING");
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally { bitmap.close(); }
}

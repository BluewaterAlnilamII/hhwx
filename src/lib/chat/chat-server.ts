import "server-only";
import { SignJWT } from "jose";
import { ApiRouteError } from "@/lib/api-contracts";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CHAT_DEFAULT_ROOM_ID, chatChannel, CHAT_MAX_LENGTH, CHAT_UUID, type ChatConnection, type ChatCursor, type ChatEvent, type ChatViewer } from "./chat-contract";
import type { ChatStampPublication } from "./chat-stamp-contract";

export const chatHeaders = () => withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);

export function requireChatRoom(request: Request): string {
  const roomId = new URL(request.url).searchParams.get("roomId") ?? CHAT_DEFAULT_ROOM_ID;
  if (roomId !== CHAT_DEFAULT_ROOM_ID) throw new ApiRouteError(404, "CHAT_ROOM_NOT_FOUND", "房间不存在");
  return roomId;
}

export function requireChatEnabled(): void {
  if (process.env.CHAT_ENABLED !== "true") throw new ApiRouteError(503, "CHAT_DISABLED", "留言板暂未开放");
}

export async function requireChatIdentity(request: Request, verifyUser = false): Promise<{ userId: string; expiresAt: number }> {
  requireChatEnabled();
  const match = /^Bearer ([^\s]+)$/iu.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new ApiRouteError(401, "UNAUTHENTICATED", "请先登录");
  const client = createServerSupabaseClient();
  if (verifyUser) {
    const { data, error } = await client.auth.getUser(match[1]);
    if (error || !data.user || data.user.is_anonymous) throw new ApiRouteError(401, "AUTHENTICATION_FAILED", "请先登录");
    // Chat uses the site's authenticated identity; only chat restrictions belong in SQL.
    return { userId: data.user.id, expiresAt: 0 };
  }
  const { data, error } = await client.auth.getClaims(match[1]);
  const c = data?.claims;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (error || !c || !url || c.iss !== `${new URL(url).origin}/auth/v1`
    || c.aud !== "authenticated" || c.role !== "authenticated" || c.is_anonymous === true
    || typeof c.sub !== "string" || !CHAT_UUID.test(c.sub)
    || typeof c.exp !== "number" || !Number.isFinite(c.exp) || c.exp <= Math.floor(Date.now() / 1000)) {
    throw new ApiRouteError(401, "AUTHENTICATION_FAILED", "登录状态已失效");
  }
  return { userId: c.sub.toLowerCase(), expiresAt: c.exp };
}

const CHAT_ERROR_STATUS: Record<string, number> = {
  CHAT_ACCOUNT_REQUIRED: 403, CHAT_FORBIDDEN: 403,
  CHAT_MUTED: 403, CHAT_COOLDOWN: 429, CHAT_STAMP_COOLDOWN: 429, CHAT_REQUEST_CONFLICT: 409,
  CHAT_UPLOAD_COOLDOWN: 429, CHAT_IMAGE_INVALID: 400,
  CHAT_NOT_FOUND: 404, CHAT_INVALID_CONTENT: 400, CHAT_INVALID_CURSOR: 400, CHAT_INVALID_MUTE: 400,
};

export async function chatRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createServerSupabaseClient().rpc(name, args);
  if (error) {
    const code = error.message;
    if (Object.hasOwn(CHAT_ERROR_STATUS, code)) {
      let details: { retryAt: string } | undefined;
      if (code === "CHAT_MUTED" || code === "CHAT_COOLDOWN" || code === "CHAT_UPLOAD_COOLDOWN" || code === "CHAT_STAMP_COOLDOWN") {
        try {
          const parsed = JSON.parse(error.details);
          if (typeof parsed.retryAt === "string" && Number.isFinite(Date.parse(parsed.retryAt))) details = { retryAt: parsed.retryAt };
        } catch { /* Only controlled retry metadata is public. */ }
      }
      throw new ApiRouteError(CHAT_ERROR_STATUS[code], code, "留言板操作未完成", details);
    }
    // Database errors can contain message text or connection details.
    throw new ApiRouteError(503, "CHAT_UNAVAILABLE", "留言板暂时不可用");
  }
  return data as T;
}

export function parseChatId(value: unknown): string {
  if (typeof value !== "string" || !CHAT_UUID.test(value)) throw new ApiRouteError(400, "CHAT_INVALID_ID", "无效的标识");
  return value.toLowerCase();
}

export function parseChatContent(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || [...value.trim()].length > CHAT_MAX_LENGTH) {
    throw new ApiRouteError(400, "CHAT_INVALID_CONTENT", "消息须为 1 至 1000 字的文本");
  }
  return value.trim();
}

export function parseChatCursor(value: string | null): ChatCursor | null {
  if (!value) return null;
  if (value.length > 100) throw new ApiRouteError(400, "CHAT_INVALID_CURSOR", "无效的分页位置");
  const [createdAt, id, extra] = value.split("|");
  if (extra !== undefined || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u.test(createdAt)
    || !Number.isFinite(Date.parse(createdAt)) || !CHAT_UUID.test(id ?? "")) {
    throw new ApiRouteError(400, "CHAT_INVALID_CURSOR", "无效的分页位置");
  }
  return { createdAt, id: id.toLowerCase() };
}

export async function readChatBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiRouteError(400, "INVALID_JSON", "请求内容无效");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new ApiRouteError(413, "CHAT_BODY_TOO_LARGE", "请求内容过长");
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiRouteError) throw error;
    throw new ApiRouteError(400, "INVALID_JSON", "请求内容无效");
  } finally { reader.releaseLock(); }
}

export async function issueChatConnection(identity: { userId: string; expiresAt: number }, roomId = CHAT_DEFAULT_ROOM_ID): Promise<ChatConnection> {
  const secret = process.env.CHAT_TOKEN_SECRET;
  const url = process.env.CHAT_WEBSOCKET_URL;
  if (!secret || Buffer.byteLength(secret) < 32 || !url || !/^wss?:\/\//u.test(url)
    || (process.env.NODE_ENV === "production" && !url.startsWith("wss://"))) {
    throw new ApiRouteError(503, "CHAT_UNAVAILABLE", "留言板暂时不可用");
  }
  const viewer = await chatRpc<ChatViewer>("read_chat_viewer", { p_actor: identity.userId });
  const channel = chatChannel(roomId);
  const token = await new SignJWT({ channels: [channel] })
    .setProtectedHeader({ alg: "HS256" }).setSubject(identity.userId)
    .setIssuer("hhwx-chat").setAudience("hhwx-chat")
    .setIssuedAt().setExpirationTime(Math.min(identity.expiresAt, Math.floor(Date.now() / 1000) + 3600))
    .sign(new TextEncoder().encode(secret));
  return { token, url, channel, viewer };
}

/** Call only after the database mutation or send authorization has committed. */
export async function publishChatEvent(event: ChatEvent | ChatStampPublication, roomId = CHAT_DEFAULT_ROOM_ID): Promise<void> {
  const messageId = event.type === "stamp.sent" ? event.id : event.type === "message.created" ? event.message.id : event.messageId;
  try {
    const url = process.env.CHAT_PUBLISH_URL;
    const key = process.env.CHAT_PUBLISH_API_KEY;
    if (!url || !key || !/^https?:\/\//u.test(url)) throw new Error("Chat publish configuration missing");
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2000),
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ channel: chatChannel(roomId), data: event, idempotency_key: `${event.type}:${messageId}` }),
    });
    if (!response.ok) throw new Error("Chat publish HTTP error");
    const result = await response.json();
    if (!result || result.error || !result.result || typeof result.result !== "object") throw new Error("Chat publish rejected");
  } catch {
    // shortcut: no durable retry; clients reload saved history on reopen/reconnect. Add a queue only if automatic redelivery becomes required.
    console.warn(event.type === "stamp.sent" ? "[chat] Ephemeral stamp publication failed; not retried."
      : "[chat] Realtime publication failed; database change remains saved.", { type: event.type, messageId });
  }
}

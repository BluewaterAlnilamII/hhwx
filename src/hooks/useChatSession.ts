"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Centrifuge, UnauthorizedError } from "centrifuge";
import { getSafeSession } from "@/lib/supabase";
import { getApiErrorCode, parseApiSuccessData } from "@/lib/api-contracts";
import { CHAT_CHANNEL } from "@/lib/chat/chat-contract";
import { ChatRequestError, ChatSession } from "@/lib/chat/chat-session";
import { useGameStore } from "@/store/useGameStore";

export function useChatSession(userId: string, open: boolean) {
  const session = useMemo(() => new ChatSession(userId, {
    async uploadImage(upload, blob, signal) {
      const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: blob,
        credentials: "omit", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]) });
      // A previous PUT may have succeeded despite a lost response; completion verifies it with HEAD.
      if (!response.ok && response.status !== 412) throw new ChatRequestError("CHAT_IMAGE_UPLOAD");
    },
    async request<T>(path: string, init?: RequestInit): Promise<T> {
      const auth = await getSafeSession();
      if (!auth || auth.user.id !== userId || useGameStore.getState().userId !== userId) {
        throw new ChatRequestError("AUTHENTICATION_FAILED");
      }
      const response = await fetch(path, { ...init, cache: "no-store",
        signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30_000)]),
        headers: { ...init?.headers, Authorization: `Bearer ${auth.access_token}` } });
      const payload = await response.json();
      if (useGameStore.getState().userId !== userId) throw new ChatRequestError("AUTHENTICATION_FAILED");
      const data = parseApiSuccessData<T>(payload);
      if (!response.ok || data === null) {
        throw new ChatRequestError(getApiErrorCode(payload) ?? "CHAT_UNAVAILABLE", payload?.error?.details?.retryAt ?? null);
      }
      return data;
    },
    transport(connection, refresh, handlers) {
      const channel = connection.channel ?? CHAT_CHANNEL;
      const client = new Centrifuge(connection.url, { token: connection.token, getToken: async () => {
        try { return await refresh(); }
        catch (error) {
          if (error instanceof ChatRequestError && ["AUTHENTICATION_FAILED", "UNAUTHENTICATED", "CHAT_DISABLED", "CHAT_ACCOUNT_REQUIRED"].includes(error.code)) {
            throw new UnauthorizedError("Chat authorization expired");
          }
          throw error;
        }
      } });
      client.on("publication", (ctx) => { if (ctx.channel === channel) handlers.publication(ctx.data); });
      client.on("subscribed", (ctx) => { if (ctx.channel === channel) handlers.subscribed(); });
      client.on("connecting", handlers.connecting);
      client.on("disconnected", handlers.disconnected);
      return client;
    },
  }), [userId]);
  useEffect(() => session.mount(), [session]);
  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      if (open && document.visibilityState === "visible") void session.activate();
      else session.pause(!open);
    };
    queueMicrotask(update);
    document.addEventListener("visibilitychange", update);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", update); session.pause(); };
  }, [session, open]);
  return { session, state: useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot) };
}

"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Centrifuge, UnauthorizedError } from "centrifuge";
import { getSafeSession } from "@/lib/supabase";
import { getApiErrorCode, parseApiSuccessData } from "@/lib/api-contracts";
import { compareChatMessages, isChatCursor } from "@/lib/chat/chat-contract";
import { ChatRequestError, ChatSession } from "@/lib/chat/chat-session";
import { useGameStore } from "@/store/useGameStore";

export function useChatSession(userId: string, open: boolean) {
  const storageKey = `hhwx:chat-read:v1:${userId}:main`;
  const session = useMemo(() => new ChatSession(userId, {
    readCursor() {
      try {
        const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        return value && (value.cursor === null || isChatCursor(value.cursor)) ? value.cursor : undefined;
      } catch { return undefined; }
    },
    saveReadCursor(cursor) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null")?.cursor;
        if (isChatCursor(stored) && (!cursor || compareChatMessages(stored, cursor) >= 0)) return;
        localStorage.setItem(storageKey, JSON.stringify({ cursor }));
      } catch { /* Reading works without storage. */ }
    },
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
      let refreshing: ReturnType<typeof refresh> | null = null;
      const getConnection = async () => {
        try { return await (refreshing ??= refresh().finally(() => { refreshing = null; })); }
        catch (error) {
          if (error instanceof ChatRequestError && ["AUTHENTICATION_FAILED", "UNAUTHENTICATED", "CHAT_DISABLED", "CHAT_ACCOUNT_REQUIRED"].includes(error.code)) {
            throw new UnauthorizedError("Chat authorization expired");
          }
          throw error;
        }
      };
      const client = new Centrifuge(connection.url, { token: connection.token, getToken: async () => (await getConnection()).token });
      const messages = client.newSubscription(connection.channel, { token: connection.subscriptionToken,
        getToken: async () => (await getConnection()).subscriptionToken });
      messages.on("publication", ctx => handlers.publication(ctx.data));
      messages.on("subscribed", handlers.subscribed);
      messages.on("subscribing", handlers.subscribing);
      messages.on("unsubscribed", handlers.unsubscribed);
      client.on("publication", ctx => { if (ctx.channel === connection.activityChannel) handlers.activityPublication(ctx.data); });
      client.on("subscribed", ctx => { if (ctx.channel === connection.activityChannel) handlers.activitySubscribed(ctx); });
      client.on("connecting", handlers.connecting);
      client.on("disconnected", handlers.disconnected);
      return { connect: () => client.connect(), disconnect: () => client.disconnect(),
        subscribeMessages: () => messages.subscribe(), unsubscribeMessages: () => messages.unsubscribe() };
    },
  }), [userId, storageKey]);
  useEffect(() => session.mount(), [session]);
  useEffect(() => {
    session.setOpen(open);
    if (open) void session.activate();
    const update = () => session.setReadingAllowed(open && document.visibilityState === "visible" && document.hasFocus());
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update); window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update); window.removeEventListener("blur", update);
      session.setReadingAllowed(false);
    };
  }, [session, open]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        const value = JSON.parse(event.newValue);
        if (value.cursor === null || isChatCursor(value.cursor)) session.restoreReadCursor(value.cursor);
      } catch { /* Ignore incomplete or obsolete local records. */ }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [session, storageKey]);
  return { session, state: useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot) };
}

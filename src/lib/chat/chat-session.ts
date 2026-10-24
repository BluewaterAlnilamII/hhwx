import { CHAT_RETENTION_MS, CHAT_WINDOW_SIZE, compareChatMessages, parseChatEvent,
  type ChatConnection, type ChatCursor, type ChatEvent, type ChatMessage, type ChatPage,
  type ChatSendResult, type ChatViewer } from "./chat-contract";
import { truncateCommentContent } from "../comments/comment-contract";
import { CHAT_IMAGE_MAX_ATTACHMENTS, type ChatImageUpload, type PreparedChatImage } from "./chat-image-contract";
import { parseChatStampPublication, type ChatStampPublication, type ChatStampReference, type ChatStampSendResult } from "./chat-stamp-contract";

export class ChatRequestError extends Error {
  constructor(public code: string, public retryAt: string | null = null) { super(code); }
}
type Transport = { connect(): void; disconnect(): void };
type TransportHandlers = {
  publication(data: unknown): void;
  subscribed(): void;
  connecting(): void;
  disconnected(): void;
};
export type ChatSessionDependencies = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  uploadImage?(upload: ChatImageUpload, blob: Blob, signal: AbortSignal): Promise<void>;
  transport(connection: ChatConnection, refresh: () => Promise<string>, handlers: TransportHandlers): Transport;
};
type PendingMessage = { clientRequestId: string; content: string; startedAt: number; status: "queued" | "uploading" | "sending" | "failed"; error: string | null;
  batchId?: string;
  image?: { url: string; width: number; height: number; contentType: PreparedChatImage["contentType"] } };
export type ChatSnapshot = {
  messages: ChatMessage[];
  nextCursor: ChatCursor | null;
  viewer: ChatViewer | null;
  status: "paused" | "connecting" | "syncing" | "live" | "error";
  error: string | null;
  draft: string;
  pending: PendingMessage[];
  loadingOlder: boolean;
  newMessages: number;
  hasNewerMessages: boolean;
  nextStampAt: string | null;
};

/** One account's panel lifetime. Transport continuity never substitutes for a loaded snapshot. */
export class ChatSession {
  private snapshot: ChatSnapshot = {
    messages: [], nextCursor: null, viewer: null, status: "paused", error: null,
    draft: "", pending: [], loadingOlder: false, newMessages: 0, hasNewerMessages: false, nextStampAt: null,
  };
  private listeners = new Set<() => void>();
  private stampListeners = new Set<(event: ChatStampPublication) => void>();
  private ownStamps = new Set<string>();
  private stampAbort = new AbortController();
  private socket: Transport | null = null;
  private opening = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private active = false;
  private disposed = false;
  private baselineReady = false;
  private synchronizing = false;
  private readGeneration = 0;
  private readAbort = new AbortController();
  private buffered: ChatEvent[] = [];
  private deleted = new Set<string>();
  private tail = new Map<string, ChatMessage>();
  private tailOverflow = false;
  private following = true;
  private mountGeneration = 0;
  private sending = false;
  private sendStateVersion = 0;
  private sendingImages = false;
  private imageJobs = new Map<string, { image: PreparedChatImage; previewUrl: string; upload?: ChatImageUpload; uploaded: boolean; abort: AbortController }>();

  constructor(readonly userId: string, private deps: ChatSessionDependencies) {}
  mount = () => {
    const generation = ++this.mountGeneration;
    return () => {
      this.pause(true);
      // React Strict Mode immediately reattaches; a real unmount disposes after the turn.
      queueMicrotask(() => { if (generation === this.mountGeneration) this.dispose(); });
    };
  };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeStamps = (listener: (event: ChatStampPublication) => void) => {
    this.stampListeners.add(listener);
    return () => { this.stampListeners.delete(listener); };
  };
  sendStamp = (stamp: ChatStampReference): string | null => {
    if (this.disposed || Date.parse(this.snapshot.viewer?.mutedUntil ?? "") > Date.now()
      || Date.parse(this.snapshot.nextStampAt ?? "") > Date.now()) return null;
    const id = crypto.randomUUID();
    this.ownStamps.add(id);
    // Retain a bounded echo window so a delayed echo cannot restart an older effect.
    if (this.ownStamps.size > 128) this.ownStamps.delete(this.ownStamps.values().next().value!);
    const signal = this.stampAbort.signal;
    void this.deps.request<ChatStampSendResult>("/api/chat/stamps", { method: "POST", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: id,
        stamp: { id: stamp.id, region: stamp.region, kind: stamp.kind } }) }).then((result) => {
      if (!this.disposed && !signal.aborted && result.nextStampAt
        && Date.parse(result.nextStampAt) > Date.parse(this.snapshot.nextStampAt ?? "1970-01-01")) {
        this.update({ nextStampAt: result.nextStampAt });
      }
    }).catch((error) => {
      if (this.disposed || signal.aborted) return;
      const code = error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE";
      if (error instanceof ChatRequestError && error.retryAt) {
        if (code === "CHAT_STAMP_COOLDOWN") this.update({ nextStampAt: error.retryAt });
        if (code === "CHAT_MUTED") this.updateSendState({ mutedUntil: error.retryAt });
      }
    });
    return id;
  };
  private update(patch: Partial<ChatSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch, hasNewerMessages: this.tailOverflow || this.tail.size > 0 };
    for (const listener of this.listeners) listener();
  }
  private cancelReads() {
    this.readGeneration++;
    this.readAbort.abort();
    this.readAbort = new AbortController();
    if (this.synchronizing) this.baselineReady = false;
    this.synchronizing = false;
    this.buffered = [];
    this.update({ loadingOlder: false });
  }
  private recover(error: unknown) {
    const code = error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE";
    this.pause();
    this.update({ status: "error", error: code });
    if (this.disposed || !["CHAT_UNAVAILABLE", "CHAT_SYNC_OVERFLOW"].includes(code)) return;
    // Retry only a failed connection/snapshot, never a send or a healthy subscription.
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempt++, 5) * (1 + Math.random() * 0.2));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.activate(); }, delay);
  }
  setDraft = (draft: string) => this.update({ draft: truncateCommentContent(draft) });
  setFollowing = (following: boolean) => {
    this.following = following && !this.tailOverflow;
    if (this.following && this.tail.size) void this.jumpLatest();
  };
  private live(message: ChatMessage) {
    return !this.deleted.has(message.id) && Date.parse(message.createdAt) > Date.now() - CHAT_RETENTION_MS;
  }
  private merge(messages: ChatMessage[], keep: "newest" | "oldest" = "newest", nextCursor = this.snapshot.nextCursor): ChatPage {
    const unique = new Map(messages.filter((m) => this.live(m)).map((m) => [m.id, m]));
    const sorted = [...unique.values()].sort(compareChatMessages);
    const retained = keep === "newest" ? sorted.slice(-CHAT_WINDOW_SIZE) : sorted.slice(0, CHAT_WINDOW_SIZE);
    if (keep === "newest" && sorted.length > retained.length) {
      // Evicted older rows must remain reachable, including when the original page had no cursor.
      const first = retained[0];
      nextCursor = { createdAt: first.createdAt, id: first.id };
    }
    return { messages: retained, nextCursor };
  }
  private confirm(message: ChatMessage) {
    if (message.author.userId === this.userId && this.snapshot.pending.some((p) => p.clientRequestId === message.clientRequestId)) {
      this.releaseImage(message.clientRequestId);
      this.update({ pending: this.snapshot.pending.filter((p) => p.clientRequestId !== message.clientRequestId) });
    }
  }
  private apply(event: ChatEvent) {
    if (event.type === "message.deleted") {
      this.deleted.add(event.messageId);
      this.tail.delete(event.messageId);
      this.update({ messages: this.snapshot.messages.filter((m) => m.id !== event.messageId), newMessages: this.tail.size });
      // A new snapshot replaces the bounded deletion window and cancels stale page reads.
      if (this.deleted.size > 1000 && this.active && !this.synchronizing) void this.syncLatest();
      return;
    }
    const message = event.message;
    this.confirm(message);
    if (!this.live(message)) return;
    if (this.following || this.snapshot.messages.some((m) => m.id === message.id)) {
      this.update(this.merge([...this.snapshot.messages, message]));
    } else {
      this.tail.set(message.id, message);
      if (this.tail.size > CHAT_WINDOW_SIZE) {
        this.tail.delete(this.tail.keys().next().value!);
        this.tailOverflow = true;
      }
      this.update({ newMessages: this.tail.size });
    }
  }
  receive = (value: unknown) => {
    if (!this.active || this.disposed) return;
    const stamp = parseChatStampPublication(value);
    if (stamp) {
      if (!this.ownStamps.has(stamp.id)) this.stampListeners.forEach((listener) => listener(stamp));
      return; // Ephemeral effects never enter the history/reconnect buffer.
    }
    const event = parseChatEvent(value);
    if (!event) return;
    if (this.synchronizing || !this.baselineReady) {
      if (event.type === "message.created" && event.message.author.userId === this.userId
        && this.snapshot.pending.some((p) => p.clientRequestId === event.message.clientRequestId)) this.apply(event);
      this.buffered.push(event);
      if (this.buffered.length > 1000) {
        this.recover(new ChatRequestError("CHAT_SYNC_OVERFLOW"));
      }
    } else this.apply(event);
  };

  private refresh = async (): Promise<string> => {
    const version = this.sendStateVersion;
    const result = await this.deps.request<ChatConnection>("/api/chat/connection", { method: "POST" });
    if (this.disposed || result.viewer.userId !== this.userId) throw new ChatRequestError("AUTHENTICATION_FAILED");
    this.setViewer(result.viewer, version);
    return result.token;
  };

  activate = async () => {
    if (this.disposed || this.active) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.active = true;
    this.update({ status: "connecting", error: null });
    if (this.socket) { this.socket.connect(); return; }
    if (this.opening) return;
    this.opening = true;
    const version = this.sendStateVersion;
    try {
      const result = await this.deps.request<ChatConnection>("/api/chat/connection", { method: "POST" });
      if (this.disposed) return;
      if (result.viewer.userId !== this.userId) throw new ChatRequestError("AUTHENTICATION_FAILED");
      this.setViewer(result.viewer, version);
      this.socket = this.deps.transport(result, this.refresh, {
        publication: this.receive,
        subscribed: () => {
          if (!this.active) return;
          // Reconnects reload committed writes, including ones whose publication failed.
          void this.syncLatest();
        },
        connecting: () => {
          if (!this.active) return;
          this.cancelReads();
          this.update({ status: "connecting" });
        },
        disconnected: () => {
          if (!this.active) return;
          // The SDK retries transient failures through connecting; disconnected is terminal.
          this.pause();
          this.update({ status: "error", error: "CHAT_DISCONNECTED" });
        },
      });
      if (this.active) this.socket.connect();
    } catch (error) {
      if (!this.active) return;
      this.recover(error);
    } finally { this.opening = false; }
  };

  pause = (close = false) => {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.active = false;
    this.stampAbort.abort();
    this.stampAbort = new AbortController();
    this.cancelReads();
    this.socket?.disconnect();
    if (close) {
      this.socket = null;
      this.baselineReady = false;
      this.tail.clear();
      this.deleted.clear();
      this.tailOverflow = false;
      this.following = true;
      this.update({ messages: [], nextCursor: null, newMessages: 0 });
    }
    this.update({ status: "paused" });
  };
  dispose = () => {
    this.pause(true);
    for (const id of this.imageJobs.keys()) this.releaseImage(id);
    this.update({ draft: "", pending: [], viewer: null });
    this.disposed = true;
    this.listeners.clear();
    this.stampListeners.clear();
    this.ownStamps.clear();
  };

  syncLatest = async () => {
    if (!this.active || this.synchronizing) return;
    this.cancelReads();
    const generation = this.readGeneration;
    this.synchronizing = true;
    this.baselineReady = false;
    this.update({ status: "syncing", error: null });
    try {
      const page = await this.deps.request<ChatPage>("/api/chat/messages", { signal: this.readAbort.signal });
      if (!this.active || this.disposed || generation !== this.readGeneration) return;
      const events = this.buffered;
      this.buffered = [];
      for (const event of events) if (event.type === "message.deleted") this.deleted.add(event.messageId);
      this.tail.clear();
      this.tailOverflow = false;
      this.following = true;
      this.update({ ...this.merge(page.messages, "newest", page.nextCursor), newMessages: 0 });
      for (const event of events) this.apply(event);
      // Compact only after reconciliation; leave room so each subsequent delete does not fetch again.
      if (this.deleted.size > 1000) {
        while (this.deleted.size > 500) this.deleted.delete(this.deleted.values().next().value!);
      }
      for (const message of this.snapshot.messages) this.confirm(message);
      this.baselineReady = true;
      this.synchronizing = false;
      this.reconnectAttempt = 0;
      this.update({ status: "live" });
    } catch (error) {
      if (generation !== this.readGeneration || !this.active || this.disposed) return;
      this.recover(error);
    }
  };

  loadOlder = async () => {
    const cursor = this.snapshot.nextCursor;
    if (!cursor || !this.active || !this.baselineReady || this.snapshot.loadingOlder) return;
    const generation = this.readGeneration;
    this.following = false;
    this.update({ loadingOlder: true, error: null });
    try {
      const before = encodeURIComponent(`${cursor.createdAt}|${cursor.id}`);
      const page = await this.deps.request<ChatPage>(`/api/chat/messages?before=${before}`, { signal: this.readAbort.signal });
      if (generation !== this.readGeneration || this.disposed) return;
      // Keep the visible older window; discarded newer rows remain reachable via Jump to latest.
      if (this.snapshot.messages.length + page.messages.length > CHAT_WINDOW_SIZE) this.tailOverflow = true;
      this.update(this.merge([...page.messages, ...this.snapshot.messages], "oldest", page.nextCursor));
    } catch (error) {
      if (generation !== this.readGeneration || this.disposed) return;
      this.update({ error: error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE" });
    } finally {
      if (generation === this.readGeneration) this.update({ loadingOlder: false });
    }
  };
  jumpLatest = async () => {
    if (this.tailOverflow) { await this.syncLatest(); return; }
    this.following = true;
    const page = this.merge([...this.snapshot.messages, ...this.tail.values()]);
    this.tail.clear();
    this.update({ ...page, newMessages: 0 });
  };

  private setViewer(viewer: ChatViewer, version: number) {
    const current = this.snapshot.viewer;
    this.update({ viewer: version === this.sendStateVersion || !current ? viewer : {
      ...viewer, nextSendAt: current.nextSendAt, mutedUntil: current.mutedUntil,
    } });
  }
  private updateSendState(patch: Partial<ChatViewer>) {
    // Image and text acknowledgements can arrive out of order within the same quota window.
    const current = this.snapshot.viewer?.nextSendAt;
    if ("nextSendAt" in patch && current && Date.parse(current) > Date.now()
      && !(Date.parse(patch.nextSendAt ?? "") > Date.parse(current))) patch = { ...patch, nextSendAt: current };
    this.sendStateVersion++;
    this.update({ viewer: { userId: this.userId, canModerate: false, mutedUntil: null, nextSendAt: null,
      ...this.snapshot.viewer, ...patch } });
  }
  private sendRestriction(): string | null {
    if (Date.parse(this.snapshot.viewer?.mutedUntil ?? "") > Date.now()) return "CHAT_MUTED";
    if (Date.parse(this.snapshot.viewer?.nextSendAt ?? "") > Date.now()) return "CHAT_COOLDOWN";
    return null;
  }
  send = (images: PreparedChatImage[] = []): Promise<void> | null => {
    if (this.disposed || this.sendRestriction() || images.length > CHAT_IMAGE_MAX_ATTACHMENTS) return null;
    const content = this.snapshot.draft.trim();
    if (!content && !images.length) return null;
    const batchId = images.length ? crypto.randomUUID() : undefined;
    const pending: PendingMessage[] = images.map((image) => {
      const id = crypto.randomUUID(), previewUrl = URL.createObjectURL(image.blob);
      this.imageJobs.set(id, { image, previewUrl, uploaded: false, abort: new AbortController() });
      return { clientRequestId: id, batchId, content: "", startedAt: Date.now(), status: "queued", error: null,
        image: { url: previewUrl, width: image.width, height: image.height, contentType: image.contentType } };
    });
    if (content) pending.push({ clientRequestId: crypto.randomUUID(), batchId, content, startedAt: Date.now(), status: "queued", error: null });
    this.update({ draft: "", pending: [...this.snapshot.pending, ...pending] });
    return Promise.all([this.drainImages(), this.drainSends()]).then(() => undefined);
  };
  retry = async (id: string) => {
    if (this.disposed || this.sendRestriction()) return;
    this.update({ pending: this.snapshot.pending.map((p) => p.clientRequestId !== id || p.status !== "failed" ? p : {
      ...p, ...(!p.image && Date.now() - p.startedAt >= CHAT_RETENTION_MS ? { clientRequestId: crypto.randomUUID(), startedAt: Date.now() } : {}),
      batchId: undefined, status: "queued", error: null,
    }) });
    await Promise.all([this.drainSends(), this.drainImages()]);
  };
  private releaseImage(id: string) {
    const job = this.imageJobs.get(id);
    if (job) { job.abort.abort(); URL.revokeObjectURL(job.previewUrl); this.imageJobs.delete(id); }
  }
  discard = (id: string) => {
    if (!this.snapshot.pending.some((p) => p.clientRequestId === id && p.status === "failed")) return;
    this.releaseImage(id);
    this.update({ pending: this.snapshot.pending.filter((p) => p.clientRequestId !== id) });
  };
  private acceptSend(result: ChatSendResult, id: string) {
    this.updateSendState({ nextSendAt: result.nextSendAt });
    if (result.deleted) this.apply({ type: "message.deleted", messageId: result.messageId, deletedAt: new Date().toISOString() });
    else if (result.message) {
      const event: ChatEvent = { type: "message.created", message: result.message };
      this.apply(event);
      if (this.synchronizing) this.buffered.push(event);
    }
    this.releaseImage(id);
    this.update({ pending: this.snapshot.pending.filter((p) => p.clientRequestId !== id) });
  }
  private async drainImages() {
    if (this.sendingImages || this.disposed) return;
    this.sendingImages = true;
    try {
      for (;;) {
        const pending = this.snapshot.pending.find((p) => p.image && p.status === "queued");
        if (!pending || this.disposed) break;
        const id = pending.clientRequestId, job = this.imageJobs.get(id);
        if (!job) break;
        try {
          const restriction = this.sendRestriction();
          if (restriction) throw new ChatRequestError(restriction);
          this.update({ pending: this.snapshot.pending.map((p) => p === pending ? { ...p, status: "uploading" } : p) });
          if (!job.uploaded) {
            if (!job.upload || job.upload.expiresAt <= Date.now()) {
              const { width, height, bytes, contentType, hash } = job.image;
              job.upload = await this.deps.request<ChatImageUpload>("/api/chat/images/upload", { method: "POST",
                headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: id, image: { width, height, bytes, contentType, hash } }) });
            }
            if (this.disposed) break;
            if (!this.deps.uploadImage) throw new ChatRequestError("CHAT_IMAGES_UNAVAILABLE");
            await this.deps.uploadImage(job.upload, job.image.blob, job.abort.signal);
            job.uploaded = true;
          }
          if (this.disposed) break;
          this.update({ pending: this.snapshot.pending.map((p) => p.clientRequestId === id ? { ...p, status: "sending" } : p) });
          const result = await this.deps.request<ChatSendResult>("/api/chat/images", { method: "POST",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: id, receipt: job.upload!.receipt }) });
          if (!this.disposed) this.acceptSend(result, id);
        } catch (error) {
          if (this.disposed) break;
          // A publication can confirm the save before its HTTP response is lost.
          if (!this.snapshot.pending.some((p) => p.clientRequestId === id)) { await this.drainSends(); continue; }
          const code = error instanceof ChatRequestError ? error.code : "CHAT_IMAGE_UPLOAD";
          if (error instanceof ChatRequestError && error.retryAt && ["CHAT_MUTED", "CHAT_COOLDOWN"].includes(code)) {
            this.updateSendState(code === "CHAT_MUTED" ? { mutedUntil: error.retryAt } : { nextSendAt: error.retryAt });
          }
          this.update({ pending: this.snapshot.pending.map((p) => p.clientRequestId === id ? { ...p, status: "failed", error: code } : p) });
          // Unattempted items in this submission require an explicit individual retry.
          if (pending.batchId) this.update({ pending: this.snapshot.pending.map((p) => p.batchId === pending.batchId && p.status === "queued"
            ? { ...p, status: "failed", error: "CHAT_NOT_SENT" } : p) });
        }
        await this.drainSends();
      }
    } finally { this.sendingImages = false; }
  }
  private async drainSends() {
    if (this.sending || this.disposed) return;
    this.sending = true;
    try {
      for (;;) {
        const pending = this.snapshot.pending.find((p) => !p.image && p.status === "queued"
          && (!p.batchId || !this.snapshot.pending.some((other) => other.batchId === p.batchId && other.image)));
        if (!pending || this.disposed) break;
        const restriction = this.sendRestriction();
        if (restriction) {
          this.failQueued(restriction);
          break;
        }
        const { clientRequestId, content } = pending;
        this.update({ pending: this.snapshot.pending.map((p) => p === pending ? { ...p, status: "sending" } : p) });
        try {
          const result = await this.deps.request<ChatSendResult>("/api/chat/messages", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, clientRequestId }),
          });
          if (this.disposed) break;
          this.acceptSend(result, clientRequestId);
        } catch (error) {
          if (this.disposed) break;
          const code = error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE";
          if (error instanceof ChatRequestError && error.retryAt && ["CHAT_MUTED", "CHAT_COOLDOWN"].includes(code)) {
            this.updateSendState(code === "CHAT_MUTED" ? { mutedUntil: error.retryAt } : { nextSendAt: error.retryAt });
          }
          // An echo may already have confirmed this request; never recreate its pending row.
          this.update({ pending: this.snapshot.pending.map((p) => p.clientRequestId === clientRequestId ? { ...p, status: "failed", error: code } : p) });
          if (["CHAT_MUTED", "CHAT_COOLDOWN", "AUTHENTICATION_FAILED", "UNAUTHENTICATED", "CHAT_UNAVAILABLE"].includes(code)) {
            this.failQueued(code);
            break;
          }
        }
      }
    } finally { this.sending = false; }
  }
  private failQueued(code: string) {
    this.update({ pending: this.snapshot.pending.map((p) => !p.image && p.status === "queued" ? { ...p, status: "failed", error: code } : p) });
  }
  remove = async (id: string) => {
    try {
      const event = await this.deps.request<ChatEvent>(`/api/chat/messages/${id}`, { method: "DELETE" });
      if (!this.disposed) this.apply(event);
      return true;
    } catch (error) {
      this.update({ error: error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE" });
      return false;
    }
  };
  mute = async (userId: string, minutes: number | null) => {
    try {
      await this.deps.request(`/api/chat/mutes/${userId}`, {
        method: minutes === null ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        ...(minutes === null ? {} : { body: JSON.stringify({ mutedUntil: new Date(Date.now() + minutes * 60000).toISOString() }) }),
      });
      this.update({ error: null });
      return true;
    } catch (error) {
      this.update({ error: error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE" });
      return false;
    }
  };
}

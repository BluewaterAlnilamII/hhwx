import { CHAT_RETENTION_MS, CHAT_DEFAULT_ROOM_ID, compareChatMessages, parseChatEvent, parseChatActivityEvent, parseChatMentionAcknowledgement,
  type ChatConnection, type ChatCursor, type ChatEvent, type ChatMessage, type ChatPage,
  type ChatActivity, type ChatActivityEvent, type ChatSendResult, type ChatViewer, type ChatReply, type ChatReactionEvent, type ChatMention, type ChatMentionInbox, type ChatMentionUser, type ChatRecentMentionUser, type ChatPresenceConnection, type ChatPresenceEvent } from "./chat-contract";
import { editChatMentions, recentChatUsers } from "./chat-mentions";
import type { CommentReactionParticipantListResponse } from "../comments/comment-contract";
import { truncateCommentContent } from "../comments/comment-contract";
import { COMMENT_EMOJI_NAME_SET } from "../comments/emoji";
import { CHAT_IMAGE_MAX_ATTACHMENTS, type ChatImageUpload, type PreparedChatImage } from "./chat-image-contract";
import { parseChatStampPublication, type ChatStampPublication, type ChatStampReference, type ChatStampSendResult } from "./chat-stamp-contract";

export class ChatRequestError extends Error {
  constructor(public code: string, public retryAt: string | null = null) { super(code); }
}
type Transport = { connect(): void; disconnect(): void; subscribeMessages(): void; unsubscribeMessages(): void };
type TransportHandlers = {
  publication(data: unknown): void;
  subscribed(context?: { recovered: boolean }): void;
  subscribing(): void;
  unsubscribed(): void;
  activityPublication(data: unknown): void;
  activitySubscribed(context: { recovered: boolean }): void;
  presenceChanged(event: ChatPresenceEvent): void;
  mentionChanged(data?: unknown): void;
  mentionSubscribed(): void;
  connecting(): void;
  disconnected(): void;
};
export type ChatSessionDependencies = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  readCursor?(): ChatCursor | null | undefined;
  saveReadCursor?(cursor: ChatCursor | null): void;
  readQuickReactions?(): unknown;
  saveQuickReactions?(keys: readonly string[]): void;
  uploadImage?(upload: ChatImageUpload, blob: Blob, signal: AbortSignal): Promise<void>;
  transport(connection: ChatConnection, refresh: () => Promise<ChatConnection>, handlers: TransportHandlers): Transport;
};
type PendingMessage = { clientRequestId: string; content: string; startedAt: number; status: "queued" | "uploading" | "sending" | "failed"; error: string | null;
  mentions?: ChatMention[];
  batchId?: string;
  reply?: ChatReply | null;
  image?: { url: string; width: number; height: number; contentType: PreparedChatImage["contentType"] } };
export type ChatSnapshot = {
  directory: ChatMentionUser[] | null;
  recentMentionUsers: ChatRecentMentionUser[] | null;
  mentionSuggestionsVersion: number;
  onlineUsers: ChatMentionUser[] | null;
  presenceError: boolean;
  draftMentions: ChatMention[];
  mentions: ChatMentionInbox;
  mentionError: boolean;
  mentionTarget: string | null;
  messages: ChatMessage[];
  nextCursor: ChatCursor | null;
  viewer: ChatViewer | null;
  status: "paused" | "connecting" | "syncing" | "live" | "error";
  error: string | null;
  draft: string;
  reply: ChatReply | null;
  context: ChatPage | null;
  pending: PendingMessage[];
  loadingOlder: boolean;
  following: boolean;
  newMessages: number;
  unread: boolean;
  nextStampAt: string | null;
  quickReactions: string[];
};

const DEFAULT_QUICK_REACTIONS = ["Tae", "KokoroYay", "LisaMelt"];

/** One signed-in account; the dialog only controls the full-message subscription. */
export class ChatSession {
  private snapshot: ChatSnapshot = {
    directory: null, recentMentionUsers: null, mentionSuggestionsVersion: 0, onlineUsers: null, presenceError: false,
    draftMentions: [], mentions: { items: [], total: 0 }, mentionError: false, mentionTarget: null,
    messages: [], nextCursor: null, viewer: null, status: "paused", error: null,
    draft: "", reply: null, context: null, pending: [], loadingOlder: false, following: true, newMessages: 0, unread: false, nextStampAt: null,
    quickReactions: [...DEFAULT_QUICK_REACTIONS],
  };
  private listeners = new Set<() => void>();
  private stampListeners = new Set<(event: ChatStampPublication) => void>();
  private ownStamps = new Set<string>();
  private stampAbort = new AbortController();
  private socket: Transport | null = null;
  private mentionsEnabled = false;
  private membersVisible = false;
  private directoryLoadedAt = 0;
  private directoryAbort: AbortController | null = null;
  private suggestionsAbort: AbortController | null = null;
  private suggestionsRequest: Promise<void> | null = null;
  private suggestionsBuffer: ChatRecentMentionUser[] = [];
  private presenceAbort: AbortController | null = null;
  private presenceConnections = new Map<string, ChatMentionUser>();
  private presenceBuffer = new Map<string, ChatMentionUser | null>();
  private opening = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private active = false;
  private disposed = false;
  private baselineReady = false;
  private subscribed = false;
  private synchronizing = false;
  private readGeneration = 0;
  private readAbort = new AbortController();
  private buffered: ChatEvent[] = [];
  private deleted = new Set<string>();
  private following = true;
  private latestSeen: ChatCursor | null = null;
  private closed = true;
  private readingAllowed = false;
  private activity: ChatActivity = { latest: null, latestOther: null };
  private activityReady = false;
  private activityConnected = false;
  private activityBuffer: ChatActivityEvent[] = [];
  private activityAbort: AbortController | null = null;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
  private readCursor: ChatCursor | null | undefined;
  private mountGeneration = 0;
  private sending = false;
  private sendStateVersion = 0;
  private sendingImages = false;
  private imageJobs = new Map<string, { image: PreparedChatImage; previewUrl: string; upload?: ChatImageUpload; uploaded: boolean; abort: AbortController }>();
  private imagePreviews = new Map<string, string>();
  private reactionRequests = new Set<string>();
  private reactionUpdates = new Map<string, { latest: ChatReactionEvent; own?: ChatReactionEvent }>();
  private contextAbort: AbortController | null = null;
  private mentionsAbort: AbortController | null = null;
  private mentionsDirty = false;
  private mentionsVersion = 0;
  private mentionsLoaded = false;
  private mentionAcks = new Set<string>();
  private readMentions = new Set<string>();
  scrollAnchors: { id: string; top: number }[] = [];
  setScrollAnchors = (anchors: { id: string; top: number }[]) => { this.scrollAnchors = anchors; };

  constructor(readonly userId: string, private deps: ChatSessionDependencies) {}
  mount = () => {
    const generation = ++this.mountGeneration;
    this.restoreReadCursor(this.deps.readCursor?.());
    this.restoreQuickReactions(this.deps.readQuickReactions?.());
    void this.activate();
    return () => {
      this.pause();
      // React Strict Mode immediately reattaches; a real unmount disposes after the turn.
      queueMicrotask(() => { if (generation === this.mountGeneration) this.dispose(); });
    };
  };
  getSnapshot = () => this.snapshot;
  getImagePreview = (messageId: string) => this.imagePreviews.get(messageId);
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
    const other = this.activity.latestOther;
    const unread = this.readCursor !== undefined && !!other && Date.parse(other.createdAt) > Date.now() - CHAT_RETENTION_MS
      && (!this.readCursor || compareChatMessages(other, this.readCursor) > 0);
    this.snapshot = { ...this.snapshot, ...patch, following: this.following, unread: unread || (patch.mentions ?? this.snapshot.mentions).total > 0 };
    if ((patch.messages || patch.status === "live") && !this.synchronizing) {
      const retained = new Set(this.snapshot.messages.map(message => message.id));
      for (const [id, url] of this.imagePreviews) if (!retained.has(id)) {
        URL.revokeObjectURL(url); this.imagePreviews.delete(id);
      }
    }
    for (const listener of this.listeners) listener();
  }
  restoreReadCursor = (cursor: ChatCursor | null | undefined) => {
    if (cursor === undefined || (this.readCursor && (!cursor || compareChatMessages(cursor, this.readCursor) <= 0))) return;
    this.readCursor = cursor;
    this.update({});
  };
  restoreQuickReactions = (value: unknown) => {
    const keys = Array.isArray(value) ? value.filter((key): key is string => typeof key === "string" && COMMENT_EMOJI_NAME_SET.has(key)) : [];
    this.update({ quickReactions: [...new Set([...keys, ...DEFAULT_QUICK_REACTIONS])].slice(0, 3) });
  };
  setReadingAllowed = (allowed: boolean) => {
    this.readingAllowed = allowed;
  };
  markRead = () => {
    if (this.closed || this.snapshot.context || !this.readingAllowed || !this.following || !this.baselineReady || !this.subscribed) return;
    const cursor = this.latestSeen;
    if (cursor && (this.readCursor === undefined || !this.readCursor || compareChatMessages(cursor, this.readCursor) > 0)) {
      this.readCursor = cursor;
      this.deps.saveReadCursor?.(cursor);
      this.update({});
    }
  };
  private acceptActivity(activity: ChatActivity) {
    this.activity = activity;
    this.activityReady = true;
    if (this.readCursor === undefined) {
      this.readCursor = activity.latest;
      this.deps.saveReadCursor?.(this.readCursor);
    }
    this.update({});
  }
  private applyActivity(event: ChatActivityEvent) {
    if (event.type === "message.created") {
      if (this.deleted.has(event.cursor.id)) return;
      if (!this.activity.latest || compareChatMessages(event.cursor, this.activity.latest) > 0) this.activity.latest = event.cursor;
      if (event.userId !== this.userId && (!this.activity.latestOther || compareChatMessages(event.cursor, this.activity.latestOther) > 0)) {
        this.activity.latestOther = event.cursor;
      }
      this.update({});
    } else {
      this.deleted.add(event.messageId);
      this.removeDeletedMention(event.messageId);
      if (this.activity.latest?.id === event.messageId || this.activity.latestOther?.id === event.messageId) {
        // Only a deletion of a summary marker needs a new summary, not every room event.
        this.scheduleActivityRead();
      }
    }
  }
  private replayActivity() {
    const events = this.activityBuffer; this.activityBuffer = [];
    events.forEach(event => this.applyActivity(event));
  }
  private scheduleActivityRead(delay = 0) {
    if (this.activityTimer || !this.active) return;
    this.activityTimer = setTimeout(() => { this.activityTimer = null; void this.syncActivity(); }, delay);
  }
  private receiveActivity = (value: unknown) => {
    if (!this.active) return;
    const event = parseChatActivityEvent(value);
    if (!event) return;
    this.updateMentionSuggestions(event);
    if (!this.activityReady || this.activityAbort || this.synchronizing) {
      this.activityBuffer.push(event);
      if (this.activityBuffer.length > 1000) {
        this.activityAbort?.abort(); this.activityAbort = null; this.activityBuffer = [];
        this.activityReady = false; this.scheduleActivityRead();
      }
    } else this.applyActivity(event);
  };
  private syncActivity = async () => {
    if (!this.active || !this.activityConnected || this.activityAbort || this.synchronizing) return;
    if (!this.closed && !this.subscribed) return;
    if (!this.closed && !this.baselineReady) {
      if (this.subscribed) void this.syncLatest();
      return;
    }
    const abort = new AbortController();
    this.activityAbort = abort;
    try {
      const activity = await this.deps.request<ChatActivity>("/api/chat/activity", { signal: abort.signal });
      if (abort.signal.aborted || this.disposed) return;
      this.acceptActivity(activity);
      this.activityAbort = null;
      this.replayActivity();
    } catch (error) {
      if (!abort.signal.aborted && this.active && (!(error instanceof ChatRequestError) || error.code === "CHAT_UNAVAILABLE")) {
        this.scheduleActivityRead(5000);
      }
    } finally { if (this.activityAbort === abort) this.activityAbort = null; }
  };
  private cancelReads() {
    this.contextAbort?.abort(); this.contextAbort = null;
    this.readGeneration++;
    this.readAbort.abort(); this.readAbort = new AbortController();
    if (this.synchronizing) this.baselineReady = false;
    this.synchronizing = false; this.buffered = [];
    this.update({ loadingOlder: false });
  }
  private recover(error: unknown, connection = false) {
    const code = error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE";
    if (connection) this.pause();
    this.update({ status: "error", error: code });
    if (this.disposed || !["CHAT_UNAVAILABLE", "CHAT_SYNC_OVERFLOW"].includes(code)) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempt++, 5) * (1 + Math.random() * 0.2));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (connection) void this.activate(); else void this.syncLatest();
    }, delay);
  }
  setDraft = (draft: string, mentions?: ChatMention[]) => {
    const text = truncateCommentContent(draft);
    this.update({ draft: text, draftMentions: mentions
      ? mentions.filter(m => m.end <= [...text].length)
      : editChatMentions(this.snapshot.draft, text, this.snapshot.draftMentions) });
  };
  searchMentionUsers = async (query: string, signal: AbortSignal) => {
    const users = await this.deps.request<ChatMentionUser[]>(`/api/chat/mentions/users?q=${encodeURIComponent(query)}`, { signal });
    if (users.length && !signal.aborted && !this.disposed && this.snapshot.directory) {
      const directory = new Map(this.snapshot.directory.map(user => [user.userId, user]));
      for (const user of users) directory.set(user.userId, user);
      this.update({ directory: [...directory.values()] });
    }
    return users;
  };

  private invalidateMentionSuggestions() {
    if (this.snapshot.recentMentionUsers === null && !this.suggestionsAbort) return;
    this.suggestionsAbort?.abort(); this.suggestionsAbort = null; this.suggestionsRequest = null; this.suggestionsBuffer = [];
    this.update({ recentMentionUsers: null, mentionSuggestionsVersion: this.snapshot.mentionSuggestionsVersion + 1 });
  }

  private updateMentionSuggestions(event: ChatActivityEvent, author?: ChatMentionUser) {
    if (this.snapshot.recentMentionUsers === null && !this.suggestionsAbort) return;
    if (event.type === "message.deleted") return;
    if (this.deleted.has(event.cursor.id)) return;
    const user = author ?? this.snapshot.directory?.find(user => user.userId === event.userId)
      ?? this.snapshot.recentMentionUsers?.find(user => user.userId === event.userId)
      ?? this.snapshot.onlineUsers?.find(user => user.userId === event.userId);
    if (!user) { this.invalidateMentionSuggestions(); return; }
    const recent = { ...user, lastMessageAt: event.cursor.createdAt };
    if (this.suggestionsAbort) this.suggestionsBuffer = recentChatUsers([...this.suggestionsBuffer, recent]);
    if (this.snapshot.recentMentionUsers !== null) {
      this.update({ recentMentionUsers: recentChatUsers([...this.snapshot.recentMentionUsers, recent]) });
    }
  }

  refreshMentionSuggestions = (): Promise<void> => {
    if (this.disposed || this.snapshot.recentMentionUsers !== null) return Promise.resolve();
    if (this.suggestionsRequest) return this.suggestionsRequest;
    const abort = new AbortController(); this.suggestionsAbort = abort; this.suggestionsBuffer = [];
    this.suggestionsRequest = (async () => {
      try {
        const users = await this.deps.request<ChatRecentMentionUser[]>("/api/chat/mentions/users?q=", { signal: abort.signal });
        if (!abort.signal.aborted && !this.disposed) {
          this.update({ recentMentionUsers: recentChatUsers([...users, ...this.suggestionsBuffer]) });
        }
      } finally {
        if (this.suggestionsAbort === abort) { this.suggestionsAbort = null; this.suggestionsRequest = null; this.suggestionsBuffer = []; }
      }
    })();
    return this.suggestionsRequest;
  };

  refreshDirectory = async () => {
    if (this.disposed || this.directoryAbort || Date.now() - this.directoryLoadedAt < 300_000) return;
    const abort = new AbortController(); this.directoryAbort = abort;
    try {
      const directory = await this.deps.request<ChatMentionUser[]>("/api/chat/users", { signal: abort.signal });
      if (!abort.signal.aborted && !this.disposed) {
        this.directoryLoadedAt = Date.now(); this.update({ directory });
      }
    } catch { /* Remote mention search remains available; retry the directory on the next open/focus. */ }
    finally { if (this.directoryAbort === abort) this.directoryAbort = null; }
  };

  private cancelPresence() {
    this.presenceAbort?.abort(); this.presenceAbort = null;
    this.presenceConnections.clear(); this.presenceBuffer.clear();
    this.update({ onlineUsers: null });
  }

  private showPresence() {
    const users = new Map([...this.presenceConnections.values()].map(user => [user.userId, user]));
    this.update({ onlineUsers: [...users.values()].sort((a, b) => a.username.localeCompare(b.username) || a.publicUid - b.publicUid), presenceError: false });
  }

  private receivePresence = (event: ChatPresenceEvent) => {
    if (!this.active || !this.activityConnected) return;
    const clientId = event.type === "join" ? event.connection.clientId : event.clientId;
    const user = event.type === "join" ? event.connection.user : null;
    if (this.presenceAbort) {
      // Keep the last change per connection until the initial snapshot is ready.
      this.presenceBuffer.set(clientId, user);
    } else if (this.snapshot.onlineUsers !== null) {
      if (user) this.presenceConnections.set(clientId, user);
      else this.presenceConnections.delete(clientId);
      this.showPresence();
    }
  };

  refreshPresence = async () => {
    if (this.disposed || !this.active || !this.activityConnected || this.presenceAbort) return;
    this.presenceBuffer.clear();
    const abort = new AbortController(); this.presenceAbort = abort;
    try {
      const connections = await this.deps.request<ChatPresenceConnection[]>("/api/chat/presence?connections=1", { signal: abort.signal });
      if (abort.signal.aborted || this.disposed) return;
      this.presenceConnections = new Map(connections.map(connection => [connection.clientId, connection.user]));
      for (const [clientId, user] of this.presenceBuffer) {
        if (user) this.presenceConnections.set(clientId, user);
        else this.presenceConnections.delete(clientId);
      }
      this.showPresence();
    } catch {
      if (!abort.signal.aborted && !this.disposed) this.update({ onlineUsers: null, presenceError: true });
    } finally {
      if (this.presenceAbort === abort) {
        this.presenceAbort = null;
        this.presenceBuffer.clear();
      }
    }
  };

  setMembersVisible = (visible: boolean) => {
    if (this.membersVisible === visible) return;
    this.membersVisible = visible;
    if (visible) {
      void this.refreshDirectory();
    }
  };
  requestMentionLocation = (id: string | null) => this.update({ mentionTarget: id });
  private removeDeletedMention(id: string) {
    if (!this.snapshot.mentions.items.some(m => m.id === id)) return;
    const complete = this.completeMentionInbox();
    this.update({ mentions: { items: this.snapshot.mentions.items.filter(m => m.id !== id), total: Math.max(0, this.snapshot.mentions.total - 1) } });
    if (!complete) void this.refreshMentions();
  }
  refreshMentions = async () => {
    if (!this.active || this.disposed) return;
    this.mentionsVersion++;
    if (this.mentionsAbort) { this.mentionsDirty = true; return; }
    do {
      this.mentionsDirty = false;
      const version = this.mentionsVersion, abort = new AbortController(); this.mentionsAbort = abort;
      try {
        const mentions = await this.deps.request<ChatMentionInbox>("/api/chat/mentions", { signal: abort.signal });
        if (!abort.signal.aborted && !this.disposed && version === this.mentionsVersion) {
          this.mentionsLoaded = true;
          this.update({ mentions, mentionError: false });
        }
      } catch {
        if (!abort.signal.aborted && !this.disposed) this.update({ mentionError: true });
      } finally { if (this.mentionsAbort === abort) this.mentionsAbort = null; }
      if (abort.signal.aborted) return;
    } while (this.mentionsDirty && this.active && !this.disposed);
  };
  private completeMentionInbox() {
    return this.mentionsLoaded && !this.mentionsAbort && !this.mentionsDirty && !this.snapshot.mentionError
      && this.snapshot.mentions.total === this.snapshot.mentions.items.length;
  }
  private confirmMentionReads = async (ids: string[]) => {
    const confirmed = new Set(ids.filter(id => !this.readMentions.has(id)));
    if (this.disposed || !confirmed.size) return;
    const complete = this.completeMentionInbox();
    confirmed.forEach(id => this.readMentions.add(id));
    const previous = this.snapshot.mentions, items = previous.items.filter(m => !confirmed.has(m.id));
    this.update({ mentions: { items, total: Math.max(0, previous.total - (previous.items.length - items.length)) }, mentionError: false });
    // Incomplete totals and pre-acknowledgement reads need one reconciled refill.
    if (!complete) await this.refreshMentions();
  };
  acknowledgeMentions = async (ids: string[], visible = false) => {
    if (this.disposed || (visible && (this.closed || !this.readingAllowed))) return;
    const shown = this.snapshot.context?.messages ?? this.snapshot.messages;
    const pending = [...new Set(ids)].filter(id => !this.mentionAcks.has(id) && !this.readMentions.has(id)
      && (this.snapshot.mentions.items.some(m => m.id === id)
        || (visible && !this.completeMentionInbox() && shown.some(m => m.id === id && m.author.userId !== this.userId && m.mentions?.some(mention => mention.userId === this.userId))))).slice(0, 50);
    if (!pending.length) return;
    pending.forEach(id => this.mentionAcks.add(id));
    try {
      await this.deps.request("/api/chat/mentions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: pending }) });
      if (this.disposed) return;
      await this.confirmMentionReads(pending);
    } catch { if (!this.disposed) this.update({ mentionError: true }); }
    finally { pending.forEach(id => this.mentionAcks.delete(id)); }
  };
  setReply = (message: ChatMessage | null) => this.update({ reply: message ? {
    id: message.id, deleted: false, username: message.author.username, content: [...message.content].slice(0, 160).join(""),
    image: !!message.image, createdAt: message.createdAt,
  } : null });
  setFollowing = (following: boolean) => {
    if (this.snapshot.context) following = false;
    if (this.following === following && (!following || !this.snapshot.newMessages)) return;
    this.following = following;
    this.update(following ? { newMessages: 0 } : {});
  };
  private live(message: ChatMessage) {
    return !this.deleted.has(message.id) && Date.parse(message.createdAt) > Date.now() - CHAT_RETENTION_MS;
  }
  private merge(messages: ChatMessage[], nextCursor = this.snapshot.nextCursor): ChatPage {
    const known = new Map<string, ChatMessage>();
    for (const message of [...this.snapshot.messages, ...(this.snapshot.context?.messages ?? [])]) {
      known.set(message.id, this.mergeMessage(known.get(message.id), message));
    }
    const unique = new Map<string, ChatMessage>();
    for (const message of messages) if (this.live(message)) {
      let merged = this.mergeMessage(unique.get(message.id) ?? known.get(message.id), message);
      const updates = this.reactionUpdates.get(message.id);
      if (updates) {
        merged = this.updateInteraction(merged, updates.latest);
        if (updates.own && updates.own !== updates.latest) merged = this.updateInteraction(merged, updates.own);
        this.reactionUpdates.delete(message.id);
      }
      unique.set(message.id, merged);
    }
    return { messages: [...unique.values()].sort(compareChatMessages), nextCursor };
  }
  private mergeMessage(previous: ChatMessage | undefined, incoming: ChatMessage): ChatMessage {
    const reply = incoming.reply;
    if (reply && (this.deleted.has(reply.id) || (!reply.deleted && Date.parse(reply.createdAt) <= Date.now() - CHAT_RETENTION_MS))) {
      incoming = { ...incoming, reply: { id: reply.id, deleted: true } };
    }
    if (!previous?.reactions && !incoming.reactions) return incoming;
    const version = incoming.reactionsVersion ?? 0;
    const ownVersion = incoming.viewerReactionsVersion ?? (incoming.reactionsViewerId === this.userId ? version : -1);
    const own = (previous?.viewerReactionsVersion ?? -1) > ownVersion ? previous! : incoming;
    const counts = (previous?.reactionsVersion ?? 0) > version ? previous! : incoming;
    const selected = new Set(own.reactions?.filter(r => r.reactedByViewer && (own.reactionsViewerId === this.userId || own.viewerReactionsVersion !== undefined)).map(r => r.emojiKey));
    return { ...incoming,
      reactions: counts.reactions?.map(r => ({ ...r, reactedByViewer: selected.has(r.emojiKey) })),
      reactionsVersion: counts.reactionsVersion, reactionsViewerId: this.userId,
      viewerReactionsVersion: Math.max(ownVersion, previous?.viewerReactionsVersion ?? -1) };
  }
  private updateInteraction(message: ChatMessage, event: ChatEvent): ChatMessage {
    if (event.type === "message.deleted") return message.reply?.id === event.messageId ? { ...message, reply: { id: event.messageId, deleted: true } } : message;
    if (event.type !== "message.reactions" || event.messageId !== message.id) return message;
    const own = event.userId === this.userId && event.version >= (message.viewerReactionsVersion ?? -1);
    const selected = new Set(own ? event.ownEmojiKeys : message.reactions?.filter(r => r.reactedByViewer).map(r => r.emojiKey));
    const counts = event.version >= (message.reactionsVersion ?? 0) ? event.reactions : message.reactions ?? [];
    return { ...message, reactionsVersion: Math.max(event.version, message.reactionsVersion ?? 0),
      viewerReactionsVersion: own ? event.version : message.viewerReactionsVersion,
      reactions: counts.map(r => ({ ...r, reactedByViewer: selected.has(r.emojiKey) })) };
  }
  private applyToPage(page: ChatPage, event: ChatEvent): ChatPage {
    return { ...page, messages: page.messages.filter(m => event.type !== "message.deleted" || m.id !== event.messageId).map(m => this.updateInteraction(m, event)) };
  }
  private confirm(messages: ChatMessage[]) {
    const confirmed = new Set<string>();
    for (const message of messages) {
      if (message.author.userId !== this.userId || !this.snapshot.pending.some((p) => p.clientRequestId === message.clientRequestId)) continue;
      confirmed.add(message.clientRequestId);
      const job = this.imageJobs.get(message.clientRequestId);
      if (job && message.image && this.live(message) && !this.closed) {
        // Transfer the displayed preview; release the upload job without reloading its image.
        this.imagePreviews.set(message.id, job.previewUrl);
        job.abort.abort();
        this.imageJobs.delete(message.clientRequestId);
      } else this.releaseImage(message.clientRequestId);
    }
    return confirmed.size ? this.snapshot.pending.filter((p) => !confirmed.has(p.clientRequestId)) : this.snapshot.pending;
  }
  private apply(event: ChatEvent) {
    if (event.type !== "message.reactions") this.updateMentionSuggestions(event.type === "message.created"
      ? { type: event.type, cursor: { id: event.message.id, createdAt: event.message.createdAt }, userId: event.message.author.userId }
      : event, event.type === "message.created" ? event.message.author : undefined);
    if (event.type === "message.reactions") {
      if (this.deleted.has(event.messageId)) return;
      if (!this.snapshot.messages.some(m => m.id === event.messageId)
        && !this.snapshot.context?.messages.some(m => m.id === event.messageId)) {
        const previous = this.reactionUpdates.get(event.messageId);
        // Loaded messages own their versions; only unseen messages need an event overlay.
        this.reactionUpdates.set(event.messageId, {
          latest: previous && previous.latest.version > event.version ? previous.latest : event,
          own: event.userId === this.userId && event.version >= (previous?.own?.version ?? -1) ? event : previous?.own,
        });
      }
    }
    if (this.snapshot.context) this.update({ context: this.applyToPage(this.snapshot.context, event) });
    if (event.type === "message.reactions") {
      this.update({ messages: this.snapshot.messages.map(m => this.updateInteraction(m, event)) });
      return;
    }
    if (this.activityReady) this.applyActivity(event.type === "message.created"
      ? { type: event.type, cursor: { id: event.message.id, createdAt: event.message.createdAt }, userId: event.message.author.userId }
      : { type: event.type, messageId: event.messageId });
    if (event.type === "message.deleted") {
      this.deleted.add(event.messageId);
      this.reactionUpdates.delete(event.messageId);
      this.removeDeletedMention(event.messageId);
      this.update({ messages: this.snapshot.messages.filter(message => message.id !== event.messageId).map(m => this.updateInteraction(m, event)),
        reply: this.snapshot.reply?.id === event.messageId ? { id: event.messageId, deleted: true } : this.snapshot.reply,
        pending: this.snapshot.pending.map(p => p.reply?.id === event.messageId ? { ...p, reply: { id: event.messageId, deleted: true } } : p) });
      return;
    }
    const message = event.message;
    const pending = this.confirm([message]);
    if (!this.live(message)) { this.update({ pending }); return; }
    const isNew = !this.latestSeen || compareChatMessages(message, this.latestSeen) > 0;
    if (isNew) this.latestSeen = { createdAt: message.createdAt, id: message.id };
    this.update({ ...this.merge([...this.snapshot.messages, message]), pending,
      newMessages: !this.following && isNew ? this.snapshot.newMessages + 1 : this.snapshot.newMessages });
  }
  receive = (value: unknown) => {
    if (!this.active || this.closed || this.disposed) return;
    const stamp = parseChatStampPublication(value);
    if (stamp) {
      if (!this.ownStamps.has(stamp.id)) this.stampListeners.forEach(listener => listener(stamp));
      return;
    }
    const event = parseChatEvent(value);
    if (!event) return;
    if (this.synchronizing || !this.baselineReady) {
      if (event.type === "message.created" && event.message.author.userId === this.userId
        && this.snapshot.pending.some(p => p.clientRequestId === event.message.clientRequestId)) this.apply(event);
      this.buffered.push(event);
      if (this.buffered.length > 1000) {
        this.cancelReads(); this.recover(new ChatRequestError("CHAT_SYNC_OVERFLOW"));
      }
    } else this.apply(event);
  };
  private refresh = async (): Promise<ChatConnection> => {
    const version = this.sendStateVersion;
    const result = await this.deps.request<ChatConnection>("/api/chat/connection?activity=1", { method: "POST" });
    if (this.disposed || result.viewer.userId !== this.userId) throw new ChatRequestError("AUTHENTICATION_FAILED");
    this.mentionsEnabled = !!result.mentionChannel;
    this.setViewer(result.viewer, version);
    return result;
  };
  activate = async () => {
    if (this.disposed || this.active) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null; this.active = true;
    this.update({ status: "connecting", error: null });
    if (this.socket) { this.socket.connect(); return; }
    if (this.opening) return;
    this.opening = true;
    try {
      const result = await this.refresh();
      if (this.disposed) return;
      this.socket = this.deps.transport(result, this.refresh, {
        publication: this.receive,
        activityPublication: this.receiveActivity,
        presenceChanged: this.receivePresence,
        mentionChanged: data => {
          const acknowledged = parseChatMentionAcknowledgement(data);
          if (acknowledged) {
            if (acknowledged.roomId === CHAT_DEFAULT_ROOM_ID) void this.confirmMentionReads(acknowledged.acknowledgedMessageIds);
          } else void this.refreshMentions();
        },
        mentionSubscribed: () => { void this.refreshMentions(); },
        activitySubscribed: context => {
          if (!this.active) return;
          this.activityConnected = true;
          void this.refreshPresence();
          if (!context.recovered) { this.activityReady = false; this.invalidateMentionSuggestions(); }
          if (!this.activityReady) this.scheduleActivityRead();
          else this.replayActivity();
        },
        subscribed: context => {
          if (!this.active || this.closed) return;
          this.subscribed = true;
          if (context?.recovered && this.baselineReady) {
            this.update({ status: "live", error: null });
            if (!this.activityReady) this.scheduleActivityRead();
          }
          else void this.syncLatest();
        },
        subscribing: () => {
          if (!this.active || this.closed) return;
          this.subscribed = false; this.cancelReads(); this.update({ status: "connecting" });
        },
        unsubscribed: () => {
          if (!this.active || this.closed) return;
          this.subscribed = false; this.cancelReads();
          this.update({ status: "error", error: "CHAT_DISCONNECTED" });
        },
        connecting: () => {
          if (!this.active) return;
          this.subscribed = false; this.activityConnected = false;
          this.cancelPresence();
          this.cancelReads();
          if (this.activityAbort) this.activityReady = false;
          this.activityAbort?.abort(); this.activityAbort = null;
          this.update({ status: "connecting" });
        },
        disconnected: () => {
          if (!this.active) return;
          this.pause(); this.update({ status: "error", error: "CHAT_DISCONNECTED" });
        },
      });
      if (this.active) {
        if (!this.closed) this.socket.subscribeMessages();
        this.socket.connect();
      }
    } catch (error) { if (this.active) this.recover(error, true); }
    finally { this.opening = false; }
  };
  setOpen = (open: boolean) => {
    if (this.closed === !open) return;
    this.closed = !open;
    if (open) {
      this.update(this.merge(this.snapshot.messages));
      if (this.mentionsEnabled) void this.refreshMentions();
      this.socket?.subscribeMessages();
    } else {
      this.setMembersVisible(false);
      this.subscribed = false;
      this.cancelReads();
      this.socket?.unsubscribeMessages();
      this.stampAbort.abort(); this.stampAbort = new AbortController();
      for (const url of this.imagePreviews.values()) URL.revokeObjectURL(url);
      this.imagePreviews.clear();
      if (!this.activityReady) this.scheduleActivityRead();
      else this.replayActivity();
    }
  };
  pause = () => {
    this.mentionsLoaded = false;
    this.invalidateMentionSuggestions();
    this.cancelPresence();
    this.mentionsAbort?.abort(); this.mentionsAbort = null; this.mentionsDirty = false; this.mentionsVersion++;
    this.active = false; this.subscribed = false; this.activityConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.reconnectTimer = null; this.activityTimer = null;
    if (this.activityAbort) this.activityReady = false;
    this.activityAbort?.abort(); this.activityAbort = null;
    this.cancelReads(); this.socket?.disconnect();
    this.update({ status: "paused" });
  };
  dispose = () => {
    this.directoryAbort?.abort(); this.directoryAbort = null;
    this.setOpen(false); this.pause();
    for (const id of this.imageJobs.keys()) this.releaseImage(id);
    this.activity = { latest: null, latestOther: null }; this.readCursor = undefined;
    this.readMentions.clear(); this.reactionUpdates.clear();
    this.update({ directory: null, recentMentionUsers: null, onlineUsers: null, messages: [], draft: "", draftMentions: [], mentions: { items: [], total: 0 }, mentionTarget: null, reply: null, context: null, pending: [], viewer: null, quickReactions: [...DEFAULT_QUICK_REACTIONS] });
    this.disposed = true;
    this.listeners.clear(); this.stampListeners.clear(); this.ownStamps.clear();
  };
  syncLatest = async () => {
    if (!this.active || this.closed || !this.subscribed || this.synchronizing) return;
    this.cancelReads();
    this.reactionUpdates.clear();
    this.activityAbort?.abort(); this.activityAbort = null;
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    const generation = this.readGeneration;
    this.synchronizing = true; this.baselineReady = false;
    this.update({ status: "syncing", error: null });
    try {
      const page = await this.deps.request<ChatPage>("/api/chat/messages?activity=1", { signal: this.readAbort.signal });
      if (!this.active || this.disposed || generation !== this.readGeneration) return;
      const events = this.buffered; this.buffered = [];
      // Start over only when recovery cannot bridge the retained list; preserve drafts and uploads.
      for (const event of events) if (event.type === "message.deleted") this.deleted.add(event.messageId);
      this.latestSeen = page.messages.at(-1) ?? null;
      this.following = true; this.scrollAnchors = [];
      this.update({ ...this.merge(page.messages, page.nextCursor), context: null, pending: this.confirm(page.messages), newMessages: 0 });
      this.baselineReady = true;
      for (const event of events) this.apply(event);
      if (page.activity) this.acceptActivity(page.activity);
      this.synchronizing = false;
      this.replayActivity();
      this.reconnectAttempt = 0;
      this.update({ status: "live" });
    } catch (error) {
      if (generation !== this.readGeneration || !this.active || this.disposed) return;
      this.synchronizing = false;
      this.recover(error);
    }
  };
  loadOlder = async () => {
    const context = this.snapshot.context;
    const cursor = (context ?? this.snapshot).nextCursor;
    if (!cursor || this.closed || !this.baselineReady || this.snapshot.loadingOlder) return;
    const generation = this.readGeneration;
    this.following = false; this.update({ loadingOlder: true, error: null });
    try {
      const before = encodeURIComponent(`${cursor.createdAt}|${cursor.id}`);
      const page = await this.deps.request<ChatPage>(`/api/chat/messages?before=${before}`, { signal: this.readAbort.signal });
      if (generation !== this.readGeneration || this.disposed) return;
      if (context && this.snapshot.context) this.update({ context: this.merge([...page.messages, ...this.snapshot.context.messages], page.nextCursor) });
      else this.update(this.merge([...page.messages, ...this.snapshot.messages], page.nextCursor));
    } catch (error) {
      if (generation !== this.readGeneration || this.disposed) return;
      this.update({ error: error instanceof ChatRequestError ? error.code : "CHAT_UNAVAILABLE" });
    } finally { if (generation === this.readGeneration) this.update({ loadingOlder: false }); }
  };
  jumpLatest = async () => {
    if (!this.synchronizing) this.cancelReads();
    this.following = true;
    this.update({ context: null, newMessages: 0 });
  };
  locate = async (id: string) => {
    if (!this.baselineReady || this.closed || this.disposed) return false;
    const shown = this.snapshot.context ?? this.snapshot;
    const inMain = this.snapshot.messages.some(m => m.id === id);
    const destination = shown.messages.some(m => m.id === id) ? shown : inMain ? this.snapshot : null;
    const showMain = destination === this.snapshot;
    this.cancelReads();
    const abort = new AbortController(); this.contextAbort = abort;
    try {
      let page = destination ?? await this.deps.request<ChatPage>(`/api/chat/messages/${id}/context`, { signal: abort.signal });
      if (abort.signal.aborted || this.disposed) return false;
      page = this.merge(page.messages, page.nextCursor);
      if (!page.messages.some(m => m.id === id)) throw new ChatRequestError("CHAT_NOT_FOUND");
      this.following = false;
      this.update({ context: showMain ? null : page });
      return true;
    } catch (error) {
      if (abort.signal.aborted || this.disposed) return false;
      if (error instanceof ChatRequestError && error.code === "CHAT_NOT_FOUND") {
        this.apply({ type: "message.deleted", messageId: id, deletedAt: new Date().toISOString() });
        return false;
      }
      throw error;
    } finally {
      if (this.contextAbort === abort) this.contextAbort = null;
    }
  };
  react = async (messageId: string, emojiKey: string, active: boolean, options: { remember?: boolean } = {}) => {
    if (this.reactionRequests.has(messageId)) return;
    this.reactionRequests.add(messageId);
    try {
      const event = await this.deps.request<ChatReactionEvent>(`/api/chat/messages/${messageId}/reactions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emojiKey, active }),
      });
      if (!this.disposed) {
        this.apply(event);
        if (this.synchronizing) this.buffered.push(event);
        if (active && options.remember) {
          this.restoreQuickReactions([emojiKey, ...this.snapshot.quickReactions]);
          this.deps.saveQuickReactions?.(this.snapshot.quickReactions);
        }
      }
    } finally { this.reactionRequests.delete(messageId); }
  };
  loadReactionParticipants = async ({ commentId, emojiKey, cursor, signal }: { commentId: string; emojiKey: string; cursor?: string | null; signal?: AbortSignal }): Promise<CommentReactionParticipantListResponse> => {
    const query = new URLSearchParams({ emojiKey, ...(cursor ? { after: cursor } : {}) });
    const result = await this.deps.request<Omit<CommentReactionParticipantListResponse, "commentId">>(`/api/chat/messages/${commentId}/reactions?${query}`, { signal });
    return { ...result, commentId };
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
    const leading = [...this.snapshot.draft].length - [...this.snapshot.draft.trimStart()].length;
    const mentions = this.snapshot.draftMentions.map(m => ({ ...m, start: m.start - leading, end: m.end - leading }));
    if (!content && !images.length) return null;
    const reply = this.snapshot.reply;
    if (reply && (reply.deleted || this.deleted.has(reply.id) || Date.parse(reply.createdAt) <= Date.now() - CHAT_RETENTION_MS)) {
      this.update({ reply: { id: reply.id, deleted: true } }); return null;
    }
    const batchId = images.length ? crypto.randomUUID() : undefined;
    const pending: PendingMessage[] = images.map((image) => {
      const id = crypto.randomUUID(), previewUrl = URL.createObjectURL(image.blob);
      this.imageJobs.set(id, { image, previewUrl, uploaded: false, abort: new AbortController() });
      return { clientRequestId: id, batchId, content: "", startedAt: Date.now(), status: "queued", error: null,
        image: { url: previewUrl, width: image.width, height: image.height, contentType: image.contentType } };
    });
    if (content) pending.push({ clientRequestId: crypto.randomUUID(), batchId, content, mentions, startedAt: Date.now(), status: "queued", error: null });
    pending[0].reply = reply;
    this.update({ draft: "", draftMentions: [], reply: null, pending: [...this.snapshot.pending, ...pending] });
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
  retryWithoutReply = async (id: string) => {
    if (!this.snapshot.pending.some(p => p.clientRequestId === id && p.status === "failed" && p.error === "CHAT_REPLY_DELETED")) return;
    // This rejection guarantees that the original request did not save a message.
    this.update({ pending: this.snapshot.pending.map(p => p.clientRequestId === id ? { ...p, reply: null } : p) });
    await this.retry(id);
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
    if (this.snapshot.pending.some((p) => p.clientRequestId === id)) {
      this.releaseImage(id);
      this.update({ pending: this.snapshot.pending.filter((p) => p.clientRequestId !== id) });
    }
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
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: id, receipt: job.upload!.receipt, ...(pending.reply ? { replyToId: pending.reply.id } : {}) }) });
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
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, clientRequestId, ...(pending.mentions?.length ? { mentions: pending.mentions } : {}), ...(pending.reply ? { replyToId: pending.reply.id } : {}) }),
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

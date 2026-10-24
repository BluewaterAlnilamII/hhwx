import type { CommentStamp } from "@/lib/comments/stamps";
import type { ChatStampReference } from "./chat-stamp-contract";

export const CHAT_STAMP_EXIT_MS = 3000;
export const CHAT_STAMP_SCALE_MS = 200;
export const CHAT_STAMP_LIFETIME_MS = CHAT_STAMP_EXIT_MS + CHAT_STAMP_SCALE_MS;
export const CHAT_STAMP_MAX_VISIBLE = 5;

export type ChatStampEvent = {
  id: string;
  userId: string;
  publicUid: number;
  username: string;
  stamp: ChatStampReference | CommentStamp;
};
export type ChatStampEffect = ChatStampEvent & { startedAt: number; x: number; y: number };

type Playback = {
  effect: ChatStampEffect;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout>;
  audioDone: boolean;
  visible: boolean;
};

export function chatStampPlayer(publicUid: number): number {
  return publicUid % 5 || 5;
}

export function placeChatStamp(area: { width: number; height: number }, size: { width: number; height: number }, x: number, y: number) {
  const inset = Math.min(8, area.width / 2, area.height / 2);
  const scale = Math.max(0, Math.min(1, (area.width - inset * 2) / size.width, (area.height - inset * 2) / size.height));
  return {
    left: inset + Math.max(0, area.width - inset * 2 - size.width * scale) * x,
    top: inset + Math.max(0, area.height - inset * 2 - size.height * scale) * y,
    scale,
  };
}

// Audio may outlive the visual; retain its cancellation handle until both finish.
export class ChatStampPlayback {
  private owners = new Map<string, Playback>();
  private effects: ChatStampEffect[] = [];
  private listeners = new Set<() => void>();

  constructor(private playAudio: (event: ChatStampEffect, signal: AbortSignal) => Promise<void>) {}

  getSnapshot = () => this.effects;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  };
  private notify() { this.listeners.forEach((callback) => callback()); }

  private stop(playback: Playback) {
    clearTimeout(playback.timer);
    playback.abort.abort();
    this.owners.delete(playback.effect.userId);
    this.effects = this.effects.filter((effect) => effect !== playback.effect);
  }

  play = (event: ChatStampEvent) => {
    const previous = this.owners.get(event.userId);
    if (previous?.effect.id === event.id) return;
    if (previous) this.stop(previous);
    if (this.effects.length === CHAT_STAMP_MAX_VISIBLE) this.stop(this.owners.get(this.effects[0].userId)!);

    const effect: ChatStampEffect = { ...event, startedAt: Date.now(), x: Math.random(), y: Math.random() };
    const playback: Playback = {
      effect, abort: new AbortController(), audioDone: false, visible: true,
      timer: setTimeout(() => {
        playback.visible = false;
        this.effects = this.effects.filter((item) => item !== effect);
        if (playback.audioDone) this.owners.delete(event.userId);
        this.notify();
      }, CHAT_STAMP_LIFETIME_MS),
    };
    this.owners.set(event.userId, playback);
    this.effects = [...this.effects, effect];
    this.notify();
    void this.playAudio(effect, playback.abort.signal).catch(() => {}).finally(() => {
      playback.audioDone = true;
      if (!playback.visible && this.owners.get(event.userId) === playback) this.owners.delete(event.userId);
    });
  };

  clear = () => {
    for (const playback of this.owners.values()) this.stop(playback);
    this.notify();
  };
}

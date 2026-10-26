"use client";

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from "react";
import { BandoriStampAnimationCanvas } from "@/components/bandori/BandoriStampView";
import { useCommentStampAnimation, useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { buildCommentStampLookup, resolveCommentStamp, type CommentStampLookup } from "@/lib/comments/comment-content";
import { buildBandoriChatStampResources } from "@/lib/bandori-builtin-resources";
import { type CommentStamp } from "@/lib/comments/stamps";
import { playIndependentSoundEffect, preloadSoundEffect } from "@/lib/sound-effect-audio";
import { CHAT_STAMP_EXIT_MS, CHAT_STAMP_SCALE_MS, ChatStampPlayback, chatStampPlayer, placeChatStamp, type ChatStampEffect, type ChatStampEvent } from "@/lib/chat/chat-stamps";

const { popSound, voiceBadge, nameplate } = buildBandoriChatStampResources();

function fitStampName(text: HTMLSpanElement) {
  const plate = text.parentElement!;
  const style = getComputedStyle(plate);
  const available = plate.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  text.style.fontSize = "";
  // Layout widths ignore the entrance scale; leave one pixel for fractional glyph rounding.
  if (text.scrollWidth > available) {
    const fitted = Math.floor(parseFloat(style.fontSize) * (available - 1) / text.scrollWidth * 10) / 10;
    text.style.fontSize = `${Math.max(9, fitted)}px`;
  }
}

function preloadCommonAssets() {
  if (popSound) void preloadSoundEffect(popSound).catch(() => {});
  let nameplateImage: HTMLImageElement | undefined;
  for (const src of [voiceBadge, nameplate]) {
    if (!src) continue;
    const image = new Image();
    // CSS masks use CORS; preload in the same mode instead of caching an opaque response.
    if (src === nameplate) { image.crossOrigin = "anonymous"; nameplateImage = image; }
    image.src = src;
  }
  return nameplateImage;
}

const ChatStampVisual = memo(function ChatStampVisual({ effect, area, stamp }: {
  effect: ChatStampEffect; area: { width: number; height: number }; stamp: CommentStamp | undefined;
}) {
  const root = useRef<HTMLDivElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [animationFailed, setAnimationFailed] = useState(false);
  const { animation } = useCommentStampAnimation(effect.stamp.region, effect.stamp.id, stamp?.animation, !animationFailed);
  const oneShot = useMemo(() => animation ? { ...animation, loop: false } : null, [animation]);
  const failAnimation = useCallback(() => setAnimationFailed(true), []);

  useLayoutEffect(() => {
    const element = root.current!;
    const measure = () => {
      fitStampName(name.current!);
      setSize({ width: element.offsetWidth, height: element.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [effect.username]);

  useLayoutEffect(() => {
    const element = visual.current;
    const untilExit = effect.startedAt + CHAT_STAMP_EXIT_MS - Date.now();
    if (!element || untilExit <= 0) return;
    const animations: Animation[] = [];
    element.style.visibility = "visible";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) animations.push(element.animate(
      [{ transform: "scale(0)" }, { transform: "scale(1)" }],
      { duration: CHAT_STAMP_SCALE_MS, easing: "cubic-bezier(0.333333,0.666667,0.666667,1)", fill: "both" },
    ));
    const exitTimer = setTimeout(() => {
      if (reduced) { element.style.visibility = "hidden"; return; }
      animations.push(element.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0)" }],
        { duration: CHAT_STAMP_SCALE_MS, easing: "cubic-bezier(0.333333,0.666667,0.666667,1)", fill: "both" },
      ));
    }, untilExit);
    return () => {
      clearTimeout(exitTimer);
      animations.forEach((animation) => animation.cancel());
    };
  }, [effect.startedAt]);

  const position = placeChatStamp(area, size, effect.x, effect.y);
  return <div ref={root} data-chat-stamp={effect.id} data-stamp-user={effect.userId} data-player={chatStampPlayer(effect.publicUid)}
    className="absolute w-max origin-top-left" style={{ left: position.left, top: position.top, transform: `scale(${position.scale})` }}>
    <div ref={visual} className="chat-stamp-visual invisible flex flex-col items-center">
      <div className="relative h-20 w-[120px] sm:h-24 sm:w-36">
        {oneShot && !animationFailed ? <BandoriStampAnimationCanvas animation={oneShot} label="" onError={failAnimation} pauseWhenHidden={false} />
          : stamp && (!stamp.animation || animationFailed) ?
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stamp.imageUrl} alt="" decoding="async" className="h-full w-full object-contain" /> : null}
        {voiceBadge && stamp?.kind === "normal" && stamp.voiceUrl &&
          // eslint-disable-next-line @next/next/no-img-element
          <img src={voiceBadge} alt="" className="absolute right-0 top-0 w-[24%]" />}
      </div>
      <div className="chat-stamp-name"><span ref={name}>{effect.username}</span></div>
    </div>
  </div>;
});

export type ChatStampLayerHandle = { play(event: ChatStampEvent): void };

export const ChatStampLayer = memo(function ChatStampLayer({ ref }: { ref: Ref<ChatStampLayerHandle> }) {
  const root = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [nameplateLoaded, setNameplateLoaded] = useState(false);
  const { catalog } = useCommentStampCatalog();
  const items = useMemo(() => buildCommentStampLookup(catalog), [catalog]);
  const [{ playback, updateCatalog }] = useState(() => {
    let lookup: CommentStampLookup | null = null;
    const waiting = new Set<() => void>();
    const playback = new ChatStampPlayback(async (effect, signal) => {
      // Names appear immediately, even on a cold catalog; audio waits only within this effect's lifetime.
      if (!("imageUrl" in effect.stamp) && !lookup && !signal.aborted) await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); waiting.delete(done); resolve(); };
        const timer = setTimeout(done, Math.max(0, effect.startedAt + CHAT_STAMP_EXIT_MS - Date.now()));
        waiting.add(done);
        signal.addEventListener("abort", done, { once: true });
      });
      const stamp = "imageUrl" in effect.stamp ? effect.stamp : lookup && resolveCommentStamp(lookup, effect.stamp.region, effect.stamp.id, effect.stamp.kind);
      const sound = stamp ? stamp.voiceUrl || popSound : null;
      if (sound) await playIndependentSoundEffect(sound, signal, effect.startedAt + CHAT_STAMP_EXIT_MS);
    });
    return { playback, updateCatalog(value: CommentStampLookup) { lookup = value; waiting.forEach((resolve) => resolve()); } };
  });
  useLayoutEffect(() => { if (catalog) updateCatalog(items); }, [catalog, items, updateCatalog]);
  const effects = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
  useImperativeHandle(ref, () => ({ play: playback.play }), [playback]);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    void preloadCommonAssets()?.decode().then(() => { if (active) setNameplateLoaded(true); }).catch(() => {});
    return () => {
      active = false;
      playback.clear();
    };
  }, [playback]);

  return <div ref={root} data-chat-stamp-layer aria-hidden="true" className="pointer-events-none absolute inset-0 z-1 overflow-hidden"
    style={{ "--chat-stamp-nameplate": nameplate ? `url("${nameplate}")` : "none",
      "--chat-stamp-name-fallback": nameplateLoaded ? "transparent" : undefined } as CSSProperties}>
    {effects.map((effect) => <ChatStampVisual key={effect.id} effect={effect} area={area}
      stamp={"imageUrl" in effect.stamp ? effect.stamp : resolveCommentStamp(items, effect.stamp.region, effect.stamp.id, effect.stamp.kind) ?? undefined} />)}
  </div>;
});

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Ellipsis, FileMusic, ListEnd, ListPlus, Music2, Pause, Play, Star, StarOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import useBandoriFavoriteAction from "@/hooks/useBandoriFavoriteAction";
import { Link } from "@/i18n/navigation";
import { useActionFeedback } from "@/hooks/useActionFeedback";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";
import { buildBandoriMusicPlayerItem } from "@/lib/bandori-music-player";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import { pickBandoriRegionalText } from "@/lib/bandori-server";
import { formatPlaybackTime, musicPlayerAlbum, type MusicPlayerItem } from "@/lib/music-player-contract";
import type { FavoriteItem } from "@/lib/bandori/favorites";
import { getTooltipPosition } from "@/lib/tooltip-position";
import { dismissMenuOnScroll } from "@/lib/dismiss-menu-on-scroll";
import ActionFeedback from "@/components/ActionFeedback";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import LoadingIndicator from "@/components/LoadingIndicator";
import LoadingError from "@/components/LoadingError";
import type { useProfileSectionSave } from "@/hooks/useProfileSectionSave";
import FavoriteRemoveButton from "./FavoriteRemoveButton";
import ProfileSortList from "./ProfileSortList";
import SortableSongRow, { type SongSortControls } from "./SortableSongRow";
import styles from "./FavoriteSongList.module.css";

type Song = { target: string; title: string; artist: string; thumb: string | null; duration: string; track: MusicPlayerItem | null };
type OpenMenu = { song: Song; trigger: HTMLButtonElement; point?: DOMRect; closing?: boolean };

const sheetQuery = "(max-width: 639px), (hover: none) and (pointer: coarse)";
function subscribeSheet(callback: () => void) {
  const media = matchMedia(sheetQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function isRowContent(target: EventTarget | null) {
  return target instanceof Element && !target.closest("button:not([data-song-title])");
}

function Cover({ song }: { song: Song }) {
  const fallback = <Music2 size={20} aria-hidden="true" />;
  return song.thumb ? <MusicArtwork src={song.thumb} alt="" draggable={false} width={44} height={44} loading="lazy" decoding="async" fallback={fallback} /> : fallback;
}

function SongActions({ menu, editor, onClose, onClosed, onRemove, onFeedback }: {
  menu: OpenMenu; editor: string | null; onClose: () => void; onClosed: () => void; onRemove: (target: string, keyboardMenu?: boolean) => void; onFeedback: (message: string) => void;
}) {
  const { song, trigger } = menu;
  const t = useTranslations("account.favorites");
  const sheet = useSyncExternalStore(subscribeSheet, () => matchMedia(sheetQuery).matches);
  const favorite = useBandoriFavoriteAction("songs:" + song.target, "addToFavorites");
  const href = "/bandori/songs/" + song.target;
  const returnFocus = useRef<HTMLElement | null>(trigger);
  const grip = useRef<{ id: number; startY: number } | null>(null);
  const backdropTouch = useRef<Pick<Touch, "identifier" | "clientX" | "clientY"> | null>(null);
  function place(panel: HTMLDivElement | null) {
    if (!panel || sheet || menu.closing) return;
    function position() {
      if (!panel) return;
      const anchor = menu.point ?? trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const viewportWidth = document.documentElement.clientWidth;
      if (anchor.bottom < 0 || anchor.top > window.innerHeight || anchor.right < 0 || anchor.left > viewportWidth) {
        onClose();
        return;
      }
      const { top, placement } = getTooltipPosition({ anchorRect: anchor, tooltipHeight: panel.offsetHeight, tooltipWidth: width,
        viewportHeight: window.innerHeight, viewportWidth });
      const left = Math.max(8, Math.min(menu.point ? anchor.left : anchor.right - width, viewportWidth - width - 8));
      panel.style.setProperty("--menu-top", top + "px");
      panel.style.setProperty("--menu-left", left + "px");
      panel.style.setProperty("--menu-origin-x", Math.max(0, Math.min(width, anchor.left + anchor.width / 2 - left)) + "px");
      panel.dataset.side = placement === "above" ? "top" : "bottom";
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    const onResize = menu.point ? onClose : position;
    window.addEventListener("resize", onResize);
    const stopWatchingScroll = dismissMenuOnScroll(trigger, onClose);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      stopWatchingScroll();
    };
  }
  function enqueue(position: "next" | "end") {
    if (!song.track) return;
    useMusicPlayerStore.getState().enqueue(song.track, position);
    onFeedback(t(position === "next" ? "queuedNext" : "queuedEnd"));
    onClose();
  }
  function toggleFavorite(event: MouseEvent<HTMLButtonElement>) {
    const viaKeyboard = event.detail === 0;
    const dialog = event.currentTarget.closest('[role="dialog"]');
    void favorite.activate((selected, message) => {
      if (editor && !selected) {
        const row = trigger.closest("li");
        returnFocus.current = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
          ?? trigger.closest("section")?.querySelector("button") ?? trigger;
        onRemove(song.target, viaKeyboard && Boolean(dialog?.isConnected && dialog.contains(document.activeElement)));
      } else onFeedback(message);
      onClose();
    });
  }
  return <Dialog.Root open={!menu.closing} modal={sheet} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      {sheet && <div className={styles.overlay} data-state={menu.closing ? "closed" : "open"} aria-hidden="true"
        onTouchStart={e => { backdropTouch.current = e.touches.length === 1 ? e.touches[0] : null; }}
        onTouchCancel={() => { backdropTouch.current = null; }}
        onTouchEnd={e => {
          const start = backdropTouch.current;
          backdropTouch.current = null;
          const end = e.changedTouches[0];
          if (!start || start.identifier !== end.identifier || Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY) > 8) return;
          e.preventDefault();
          onClose();
        }} />}
      <Dialog.Content ref={place} className={sheet ? styles.menu : `${styles.menu} hhwx-anchored-menu`} data-song-menu={song.target} aria-describedby={undefined}
        aria-modal={sheet || undefined}
        onOpenAutoFocus={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector("button")?.focus({preventScroll: true});
        }}
        onInteractOutside={e => {
          if (sheet) return;
          const pointer = e.detail.originalEvent;
          if (pointer instanceof PointerEvent && (trigger.contains(pointer.target as Node) || pointer.clientX >= document.documentElement.clientWidth)) {
            e.preventDefault();
            return;
          }
          returnFocus.current = null;
        }}
        onCloseAutoFocus={e => {
          e.preventDefault();
          if (document.activeElement === document.body) returnFocus.current?.focus({ preventScroll: true });
          onClosed();
        }}>
        {sheet && <div className={styles.sheetGrip} aria-hidden="true"
          onPointerDown={e => {
            if (!e.isPrimary || e.button !== 0) return;
            grip.current = { id: e.pointerId, startY: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.parentElement!.dataset.gripped = "true";
            e.currentTarget.parentElement!.dataset.dragging = "true";
          }}
          onPointerMove={e => {
            if (grip.current?.id !== e.pointerId) return;
            e.currentTarget.parentElement!.style.setProperty("--sheet-drag", Math.max(0, e.clientY - grip.current.startY) + "px");
          }}
          onPointerUp={e => {
            if (grip.current?.id !== e.pointerId) return;
            if (e.clientY - grip.current.startY >= 56) { grip.current = null; onClose(); }
          }}
          onLostPointerCapture={e => {
            if (grip.current?.id !== e.pointerId) return;
            grip.current = null;
            const panel = e.currentTarget.parentElement!;
            delete panel.dataset.dragging;
            panel.style.removeProperty("--sheet-drag");
          }}
        />}
        <div className={styles.menuHeading}><Link className={styles.art} href={href} prefetch={false} onNavigate={onClose} aria-label={song.title} tabIndex={-1}><Cover song={song} /></Link>
          <div><Dialog.Title><Link href={href} prefetch={false} onNavigate={onClose}>{song.title}</Link></Dialog.Title><small>{song.artist}</small></div>
        </div>
        <button type="button" aria-pressed={favorite.selected} aria-disabled={favorite.pending} aria-busy={favorite.pending} onClick={toggleFavorite}>
          {favorite.selected ? <StarOff /> : <Star />}{favorite.label}
        </button>
        <Link href={href} prefetch={false} onNavigate={onClose}><FileMusic />{t("goToSong")}</Link>
        <button type="button" className={styles.queueStart} disabled={!song.track} onClick={() => enqueue("next")}><ListPlus />{t("playNext")}</button>
        <button type="button" disabled={!song.track} onClick={() => enqueue("end")}><ListEnd />{t("addToQueue")}</button>
        <ActionFeedback feedback={favorite.feedback} className="bottom-2 right-2" />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export default function FavoriteSongList({ items, limit, expanded, editing, orderSave, footer, queueId, editor, onRemove }: {
  items: FavoriteItem[]; limit: number; expanded: boolean; footer: ReactNode;
  editing: boolean; orderSave: ReturnType<typeof useProfileSectionSave<string[]>>;
  queueId: string; editor: string | null; onRemove: (target: string, keyboardMenu?: boolean) => void;
}) {
  const catalog = useBandoriMusicMaster();
  const assets = useBandoriMusicAssetIndex();
  const server = useBandoriPreferredServer();
  const t = useTranslations("account.favorites");
  const player = useTranslations("navigation.toolbar.player");
  const common = useTranslations("common");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const touch = useRef(false);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);
  function cancelHold() {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }
  useEffect(() => cancelHold, [editing, expanded]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    window.addEventListener("hashchange", dismiss);
    return () => window.removeEventListener("hashchange", dismiss);
  }, [menu]);
  if (editing && menu) setMenu(null);
  const [feedbackTarget, setFeedbackTarget] = useState<string | null>(null);
  const { feedback, showFeedback } = useActionFeedback(queueId);
  const currentId = useMusicPlayerStore(s => s.queueId === queueId && s.currentIndex !== null ? s.queue[s.currentIndex]?.id : null);
  const status = useMusicPlayerStore(s => s.status);
  const playing = status === "playing" || status === "loading";
  const { songs, queue } = useMemo(() => {
    const queue: MusicPlayerItem[] = [];
    const songs: Song[] = items.map(({ target }) => {
      const music = catalog.music?.[target], entry = assets.value?.songs[target];
      const track = buildBandoriMusicPlayerItem({ musicId: Number(target), music, assets: entry, preferredServer: server });
      if (track) queue.push(track);
      return { target, track, title: track?.title ?? pickBandoriRegionalText(music?.musicTitle, server) ?? "#" + target,
        artist: track?.artist ?? pickBandoriRegionalText(music?.bandName, server) ?? "", thumb: buildBandoriPublicAssetUrl(entry?.files.thumb),
        duration: entry?.length ? formatPlaybackTime(entry.length) : "—" };
    });
    return { songs, queue };
  }, [items, catalog.music, assets.value, server]);
  function play(track: MusicPlayerItem) {
    const state = useMusicPlayerStore.getState();
    if (state.queueId === queueId && state.currentIndex !== null && state.queue[state.currentIndex]?.id === track.id) {
      state.playQueueFromStart(state.queue, state.currentIndex, queueId);
    } else {
      state.playQueueFromStart(queue, queue.indexOf(track), queueId);
    }
  }
  const visibleSongs = expanded ? songs : songs.slice(0, limit);
  const list = <ol className={styles.list} data-sortable={editor ? true : undefined}
        onPointerMove={e => { if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) cancelHold(); }}
        onPointerUp={cancelHold} onPointerCancel={cancelHold}
        onTouchEnd={e => {
          // Lifting the opening finger can otherwise click the action now beneath it.
          if (held.current && e.cancelable) e.preventDefault();
        }}
        onClickCapture={e => {
          if (held.current && e.detail) { held.current = false; e.preventDefault(); e.stopPropagation(); }
        }}>{visibleSongs.map((song, index) => {
        const active = Boolean(song.track && currentId === song.track.id);
        const Mark = active && playing ? Pause : Play;
        const label = song.track ? player("playTrack", { title: song.title }) : player("audioUnavailable");
        const start = () => { if (song.track) play(song.track); };
        function playFromRow(event: MouseEvent<HTMLLIElement>) {
          if (!event.detail || !isRowContent(event.target)) return;
          if (event.type !== (touch.current ? "click" : "dblclick")) return;
          start();
        }
        function openRowMenu(row: HTMLLIElement, point?: DOMRect) {
          const trigger = row.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
          if (!trigger) return;
          setMenu({ song, trigger, point });
        }
        function activateMore(trigger: HTMLButtonElement, toggle: boolean) {
          setMenu(current => current?.trigger === trigger && !current.closing
            ? (toggle ? { ...current, closing: true } : current) : { song, trigger });
        }
        const renderRow = (sort?: SongSortControls) => <li key={song.target} ref={sort?.rowRef} style={sort?.style} className={styles.row}
          data-song={song.target} data-collection-extra={index >= limit || undefined} data-current={active || undefined} data-dragging={sort?.dragging || undefined}
          data-edit-draggable={editing && sort?.listeners ? true : undefined}
          onTouchStart={e => { if (editing && isRowContent(e.target)) sort?.listeners?.onTouchStart?.(e); }}
          onPointerDown={e => {
            cancelHold();
            held.current = false;
            touch.current = e.pointerType === "touch" || e.pointerType === "pen";
            if (e.pointerType === "mouse" || (editing && e.pointerType === "pen")) {
              if (isRowContent(e.target)) sort?.listeners?.onPointerDown?.(e);
            }
            if (!touch.current || !e.isPrimary) return;
            if (editing && !isRowContent(e.target)) return;
            const row = e.currentTarget;
            const timer = window.setTimeout(() => {
              held.current = true;
              if (!editing) openRowMenu(row);
            }, 500);
            hold.current = { timer, x: e.clientX, y: e.clientY };
          }}
          onContextMenu={e => {
            e.preventDefault();
            cancelHold();
            if (held.current) return;
            held.current = touch.current;
            if (editing) return;
            openRowMenu(e.currentTarget, e.clientX || e.clientY ? new DOMRect(e.clientX, e.clientY, 0, 0) : undefined);
          }}
          onClick={playFromRow} onDoubleClick={playFromRow}>
          {sort?.handle || <div className={styles.number}><span>{index + 1}</span>
            {song.track && <button type="button" data-song-play tabIndex={active ? 0 : -1}
              aria-label={active && playing ? player("pauseSong", { title: song.title }) : label}
              onClick={active ? () => useMusicPlayerStore.getState().requestTogglePlayback() : start}><Mark size={15} fill="currentColor" /></button>}
          </div>}
          <div className={styles.track}>
            <span className={styles.art} aria-hidden="true">
              <Cover song={song} />
            </span>
            <div className={styles.meta}><button type="button" className={styles.title} disabled={!song.track} data-song-title aria-label={label}
              onClick={e => { if (!e.detail) start(); }}>{song.title}</button>
              <small><span>{song.artist}</span><span className={styles.mobileTime}>{song.duration}</span></small>
            </div>
          </div>
          <span className={styles.album}>{musicPlayerAlbum("bandori")}</span><span className={styles.time}>{song.duration}</span>
          {editing && editor ? <FavoriteRemoveButton kind="songs" editor={editor} target={song.target} editing onRemove={onRemove} /> :
            <button type="button" className={styles.more} aria-haspopup="dialog" aria-expanded={!menu?.closing && menu?.song.target === song.target}
            aria-label={t("songActions", { title: song.title })}
            onPointerUp={e => {
              // A tap immediately after a sheet drag may have no compatibility click.
              if (e.pointerType === "touch" && e.isPrimary && hold.current && !held.current) {
                held.current = true;
                activateMore(e.currentTarget, false);
              }
            }}
            onClick={e => activateMore(e.currentTarget, !touch.current || e.detail === 0)}><Ellipsis size={19} /></button>}
          <ActionFeedback feedback={(feedbackTarget === song.target ? feedback : null) ?? (editor ? orderSave.feedbackFor(song.target) : null)} className="right-12 top-1/2 -translate-y-1/2" />
        </li>;
        return editor ? <SortableSongRow key={song.target} id={song.target} title={song.title} editing={editing}
          disabled={Boolean(orderSave.pending) || songs.length < 2}>{renderRow}</SortableSongRow> : renderRow();
      })}</ol>;
  return <>
    {!catalog.music || !assets.value ? (catalog.error || assets.error ? <LoadingError onRetry={() => {
      if (!catalog.music) catalog.refresh();
      if (!assets.value) assets.refresh();
    }} /> : <LoadingIndicator label={common("states.loading")} />) : <>
      {editor ? <ProfileSortList ids={visibleSongs.map(song => song.target)} onOrder={(order, moved) =>
        orderSave.save(order.concat(items.slice(order.length).map(item => item.target)), moved)} touchHold>{list}</ProfileSortList> : list}
      {footer}
      {menu && <SongActions key={menu.song.target} menu={menu} editor={editor} onRemove={onRemove}
        onClose={() => setMenu(current => current === menu && !current.closing ? { ...current, closing: true } : current)}
        onClosed={() => setMenu(current => current?.trigger === menu.trigger && current.closing ? null : current)}
        onFeedback={message => { setFeedbackTarget(menu.song.target); showFeedback("success", message); }} />}
    </>}
  </>;
}

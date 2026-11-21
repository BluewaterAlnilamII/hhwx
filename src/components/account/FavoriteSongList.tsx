"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Ellipsis, ListEnd, ListPlus, Music2, Pause, Play, StarOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { setBandoriFavorite } from "@/hooks/useBandoriFavorites";
import { useActionFeedback } from "@/hooks/useActionFeedback";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";
import { buildBandoriMusicPlayerItem } from "@/lib/bandori-music-player";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import { pickBandoriRegionalText } from "@/lib/bandori-server";
import { formatPlaybackTime, musicPlayerAlbum, type MusicPlayerItem } from "@/lib/music-player-contract";
import type { FavoriteItem } from "@/lib/bandori/favorites";
import { getTooltipPosition } from "@/lib/tooltip-position";
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
type OpenMenu = { song: Song; trigger: HTMLButtonElement; anchor: DOMRect; atPointer: boolean };

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

function SongActions({ menu, editor, onClose, onRemove, onQueued }: {
  menu: OpenMenu; editor: string | null; onClose: () => void; onRemove: (target: string, keyboardMenu?: boolean) => void; onQueued: (message: string) => void;
}) {
  const { song, trigger } = menu;
  const t = useTranslations("account.favorites");
  const sheet = useSyncExternalStore(subscribeSheet, () => matchMedia(sheetQuery).matches);
  const [saving, setSaving] = useState(false);
  const { feedback, showFeedback } = useActionFeedback(song.target);
  const returnFocus = useRef<HTMLElement | null>(trigger);
  function place(panel: HTMLDivElement | null) {
    if (!panel || sheet) return;
    function position() {
      if (!panel) return;
      const anchor = menu.anchor;
      const box = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const { top } = getTooltipPosition({ anchorRect: anchor, tooltipHeight: box.height, tooltipWidth: box.width,
        viewportHeight: window.innerHeight, viewportWidth });
      const left = menu.atPointer ? anchor.left : anchor.right - box.width;
      panel.style.setProperty("--menu-top", top + "px");
      panel.style.setProperty("--menu-left", Math.max(8, Math.min(left, viewportWidth - box.width - 8)) + "px");
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }
  function enqueue(position: "next" | "end") {
    if (!song.track) return;
    useMusicPlayerStore.getState().enqueue(song.track, position);
    onQueued(t(position === "next" ? "queuedNext" : "queuedEnd"));
    onClose();
  }
  async function remove(event: MouseEvent<HTMLButtonElement>) {
    if (!editor || saving) return;
    const viaKeyboard = event.detail === 0;
    const dialog = event.currentTarget.closest('[role="dialog"]');
    setSaving(true);
    try {
      await setBandoriFavorite(editor, "songs:" + song.target, false, () => {
        const row = trigger.closest("li");
        returnFocus.current = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
          ?? trigger.closest("section")?.querySelector("button") ?? trigger;
        onClose();
        onRemove(song.target, viaKeyboard && Boolean(dialog?.isConnected && dialog.contains(document.activeElement)));
      });
    } catch {
      showFeedback("error", t("removeFailed"));
      setSaving(false);
    }
  }
  return <Dialog.Root open modal={sheet} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      {sheet && <div className={styles.overlay} aria-hidden="true" />}
      <Dialog.Content ref={place} className={styles.menu} aria-describedby={undefined}
        aria-modal={sheet || undefined}
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
        }}>
        <div className={styles.menuHeading}><span className={styles.art}><Cover song={song} /></span>
          <div><Dialog.Title>{song.title}</Dialog.Title><small>{song.artist}</small></div>
        </div>
        <button type="button" disabled={!song.track} onClick={() => enqueue("next")}><ListPlus />{t("playNext")}</button>
        <button type="button" disabled={!song.track} onClick={() => enqueue("end")}><ListEnd />{t("addToQueue")}</button>
        {editor && <button type="button" className={styles.remove} aria-disabled={saving} onClick={remove}><StarOff />{t("remove")}</button>}
        <ActionFeedback feedback={feedback} className="bottom-2 right-2" />
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
  const [queuedTarget, setQueuedTarget] = useState<string | null>(null);
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
  const sortable = Boolean(editor && expanded);
  const visibleSongs = expanded ? songs : songs.slice(0, limit);
  const list = <ol className={styles.list} data-sortable={sortable || undefined}
        onPointerMove={e => { if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) cancelHold(); }}
        onPointerUp={cancelHold} onPointerCancel={cancelHold}
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
          setMenu({ song, trigger, anchor: point ?? trigger.getBoundingClientRect(), atPointer: Boolean(point) });
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
            if (!touch.current || !e.isPrimary || !(editor || song.track)) return;
            if (editing && !isRowContent(e.target)) return;
            const row = e.currentTarget;
            const timer = window.setTimeout(() => {
              held.current = true;
              if (!editing) openRowMenu(row);
            }, 500);
            hold.current = { timer, x: e.clientX, y: e.clientY };
          }}
          onContextMenu={e => {
            if (!(editor || song.track)) return;
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
            (editor || song.track) && <button type="button" className={styles.more} aria-haspopup="dialog" aria-expanded={menu?.song.target === song.target}
            aria-label={t("songActions", { title: song.title })} onClick={e => {
              const trigger = e.currentTarget;
              const anchor = trigger.getBoundingClientRect();
              setMenu(current => current?.trigger === trigger ? null : { song, trigger, anchor, atPointer: false });
            }}><Ellipsis size={19} /></button>}
          <ActionFeedback feedback={(queuedTarget === song.target ? feedback : null) ?? (sortable ? orderSave.feedbackFor(song.target) : null)} className="right-12 top-1/2 -translate-y-1/2" />
        </li>;
        return editor ? <SortableSongRow key={song.target} id={song.target} title={song.title} editing={editing}
          disabled={!sortable || Boolean(orderSave.pending) || songs.length < 2}>{renderRow}</SortableSongRow> : renderRow();
      })}</ol>;
  return <>
    {!catalog.music || !assets.value ? (catalog.error || assets.error ? <LoadingError onRetry={() => {
      if (!catalog.music) catalog.refresh();
      if (!assets.value) assets.refresh();
    }} /> : <LoadingIndicator label={common("states.loading")} />) : <>
      {editor ? <ProfileSortList ids={visibleSongs.map(song => song.target)} onOrder={orderSave.save} touchHold>{list}</ProfileSortList> : list}
      {footer}
      {menu && <SongActions key={menu.song.target} menu={menu} editor={editor} onRemove={onRemove} onClose={() => setMenu(current => current === menu ? null : current)}
        onQueued={message => { setQueuedTarget(menu.song.target); showFeedback("success", message); }} />}
    </>}
  </>;
}

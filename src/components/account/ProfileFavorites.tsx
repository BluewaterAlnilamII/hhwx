"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Check, ChevronDown, ChevronRight, EyeOff, Pencil } from "lucide-react";
import { favoritesRequest, subscribeFavoriteChanges, syncOwnFavoriteKeys } from "@/hooks/useBandoriFavorites";
import { useActionFeedback } from "@/hooks/useActionFeedback";
import ActionFeedback from "@/components/ActionFeedback";
import { applyFavoriteChange, favoritePreviewLimit, type FavoriteCardLayout, type FavoriteChange, type FavoriteGroup } from "@/lib/bandori/favorites";
import { ApiRouteError } from "@/lib/api-contracts";
import { useProfileSectionSave } from "@/hooks/useProfileSectionSave";
import type { ProfileHomepage } from "@/lib/profile-homepage";
import LoadingError from "@/components/LoadingError";
import LoadingIndicator from "@/components/LoadingIndicator";
import FavoriteCardWall from "./FavoriteCardWall";
import FavoriteTimeline from "./FavoriteTimeline";
import FavoriteSongList from "./FavoriteSongList";
import useCollectionNavigation from "./useCollectionNavigation";
import styles from "./ProfileFavorites.module.css";

function orderItems(group: FavoriteGroup, targets: string[]) {
  const rank = new Map(targets.map((target, i) => [target, i]));
  return group.items.toSorted((a, b) => (rank.get(a.target) ?? rank.size) - (rank.get(b.target) ?? rank.size));
}

export default function ProfileFavorites({ profile, viewerId, homeVisible, editable }: {
  profile: ProfileHomepage; viewerId: string | null; homeVisible: boolean; editable: boolean | undefined;
}) {
  const t = useTranslations("account.homepage");
  const action = useTranslations("account.favorites");
  const common = useTranslations("common");
  const [groups, setGroups] = useState<FavoriteGroup[] | null>(null);
  const { feedback, showFeedback } = useActionFeedback(String(profile.publicUid) + ":" + viewerId);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const nextFocus = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  const { expanded, editing, finishEditing, root, start, open, close, rememberDetail, stuck, returnToTop } = useCollectionNavigation(groups, editable);
  function recoverConflict(error: unknown): never {
    if (error instanceof ApiRouteError && error.status === 409) {
      setGroups(null);
      retry(n => n + 1);
    }
    throw error;
  }
  const cardSave = useProfileSectionSave<FavoriteCardLayout>(async layout => {
    if (!editable || !viewerId) throw new Error("Card editor unavailable");
    try {
      await favoritesRequest("/api/bandori/favorites", viewerId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      });
      setGroups(current => current?.map(group => group.kind === "cards"
        ? { ...group, items: orderItems(group, layout.targets), previewCount: layout.previewCount } : group) ?? null);
    } catch (error) { recoverConflict(error); }
  });
  const songSave = useProfileSectionSave<string[]>(async targets => {
    if (!editable || !viewerId) throw new Error("Song editor unavailable");
    try {
      await favoritesRequest("/api/bandori/favorites", viewerId, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "songs", targets }),
      });
      setGroups(current => current?.map(group => group.kind === "songs" ? { ...group, items: orderItems(group, targets) } : group) ?? null);
    } catch (error) { recoverConflict(error); }
  });
  useEffect(() => {
    const controller = new AbortController();
    let duringRead: FavoriteChange[] | null = [];
    const owner = profile.isOwner ? viewerId : null;
    const unsubscribe = owner ? subscribeFavoriteChanges(owner, change => {
      if (duringRead) duringRead.push(change);
      else setGroups(current => current && applyFavoriteChange(current, change));
    }) : undefined;
    favoritesRequest<FavoriteGroup[]>("/api/bandori/favorites?profile=" + profile.publicUid, viewerId, { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted) return;
        // Profile projections return cards and songs in reverse display order.
        let groups = value.map(group => group.kind === "events" ? group : { ...group, items: group.items.slice().reverse() });
        for (const change of duringRead ?? []) groups = applyFavoriteChange(groups, change);
        duringRead = null;
        if (owner) syncOwnFavoriteKeys(owner, groups);
        setGroups(groups);
        setFailed(false);
      })
      .catch(() => {
        duringRead = null;
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => { unsubscribe?.(); controller.abort(); };
  }, [profile.publicUid, profile.isOwner, viewerId, attempt]);
  const ordered = groups && (profile.preferences ? profile.preferences.modules.flatMap(module => groups.filter(group => group.kind === module.id)) : groups);
  const feedbackHost = ordered?.find(group => group.kind === savedSection)?.kind ?? ordered?.[0]?.kind;
  useLayoutEffect(() => {
    const selector = nextFocus.current;
    if (selector === null) return;
    nextFocus.current = null;
    const neighbor = selector ? root.current?.querySelector<HTMLElement>(selector) : null;
    const header = root.current?.querySelector<HTMLElement>(`[data-collection="${feedbackHost}"] [data-collection-heading]`);
    (neighbor ?? header ?? document.getElementById("profile-tab-home"))?.focus({ preventScroll: true });
  }, [groups, feedbackHost, root]);
  if (groups?.length === 0 && !feedback) return null;
  const collectionTitle = (kind: FavoriteGroup["kind"], count?: number) =>
    count === undefined ? t(kind) : action("collectionTitle", { name: t(kind), count });
  const privacy = <EyeOff size={14} aria-label={t("private")} />;
  const privateModule = (kind: string) => profile.preferences?.modules.find(module => module.id === kind)?.public === false;
  function removeFavorite(kind: FavoriteGroup["kind"], target: string, keyboardMenu = false) {
    const section = root.current?.querySelector(`[data-collection="${kind}"]`);
    const adjacentSection = section?.nextElementSibling?.getAttribute("data-collection")
      ?? section?.previousElementSibling?.getAttribute("data-collection");
    const last = groups?.find(group => group.kind === kind)?.items.length === 1;
    setSavedSection(last && adjacentSection ? adjacentSection : kind);
    const attribute = { cards: "data-card", events: "data-event", songs: "data-song" }[kind];
    const rows = Array.from(section?.querySelectorAll(`[${attribute}]`) ?? []);
    const index = rows.findIndex(row => row.getAttribute(attribute) === target);
    if (index >= 0 && (keyboardMenu || (rows[index].contains(document.activeElement) && document.activeElement?.matches(":focus-visible")))) {
      const neighbor = rows[index + 1] ?? rows[index - 1];
      nextFocus.current = neighbor
        ? `[${attribute}="${CSS.escape(neighbor.getAttribute(attribute)!)}"] :is(a[href], [data-song-title]:enabled)`
        : "";
    }
    showFeedback("success", t("saved"));
  }
  return <div ref={root} className={styles.collections} onClickCapture={rememberDetail}>
    {!feedbackHost && <ActionFeedback feedback={feedback} className="top-0 left-0" />}
    {!groups && (failed ? <LoadingError onRetry={() => { setFailed(false); retry(n => n + 1); }} /> : <LoadingIndicator label={common("states.loading")} />)}
    {ordered?.map(group => {
      const { kind } = group;
      const active = expanded === kind;
      const inEditor = active && editing;
      const editLabel = inEditor ? action(kind === "songs" ? "finishSongEdit" : "finishEdit")
        : action(kind === "songs" ? "editSongs" : kind === "cards" ? "editCards" : "editEvents");
      const draft = kind === "cards" ? cardSave.pending : null;
      const targets = draft?.targets ?? (kind === "songs" ? songSave.pending : null);
      const items = targets ? orderItems(group, targets) : group.items;
      const limit = draft?.previewCount ?? favoritePreviewLimit(group);
      const visible = active ? items : items.slice(0, limit);
      const footerToggle = (hasMore = items.length > limit) => hasMore && <>
        {!inEditor && <button type="button" className={styles.more} data-heading-part="more-footer" data-more-footer={kind}
          aria-expanded={active} onClick={active ? close : () => open(kind, "more-footer")}>
          {action(active ? "collapse" : "all")}<ChevronDown className={active ? "rotate-180" : undefined} size={16} aria-hidden="true" />
        </button>}
        {active && stuck.has(kind) && <div className={styles.topAnchor}><button className={styles.toTop} type="button" aria-label={action("top")} title={action("top")}
          onClick={returnToTop}><ArrowUp size={20} /></button></div>}
      </>;
      const heading = (controls?: React.ReactNode, hasMore = items.length > limit) => {
        const label = action(active ? "collapseCollection" : "expandCollection", { name: t(kind) });
        return <div data-collection-heading tabIndex={-1} className={styles.heading} data-stuck={stuck.has(kind) || undefined}>
          {hasMore ?
            <button type="button" className={styles.disclosure} data-heading-part="toggle" data-more={active ? undefined : kind}
              aria-label={label} title={label} aria-expanded={active} onClick={active ? close : () => open(kind)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button> : <span className={styles.disclosure} aria-hidden="true" />}
          <div className={styles.headingContent}>
            <div className={styles.headingTitle}><h2 data-heading-part="title">{collectionTitle(kind, items.length)}</h2>{privateModule(kind) && privacy}</div>
            {controls}
          </div>
          {editable && <button type="button" className={styles.editCollection} data-edit={kind} data-heading-part="edit"
            aria-pressed={inEditor} aria-label={editLabel} title={editLabel}
            onClick={() => inEditor ? finishEditing(hasMore) : open(`${kind}/edit`)}>
            {inEditor ? <Check size={16} /> : <Pencil size={16} />}</button>}
          {feedbackHost === kind && <ActionFeedback feedback={feedback} className={styles.headingFeedback} />}
        </div>;
      };
      return <section key={kind} className={styles.module} data-collection={kind} data-collection-view={active ? kind : undefined}>
        <span data-collection-start={kind} ref={active ? start : undefined} className={styles.scrollStart} aria-hidden="true" />
        {kind !== "events" && heading()}
        {kind === "cards" && <FavoriteCardWall items={visible} previewCount={limit} footer={footerToggle()} visitor={!profile.isOwner} editor={editable ? viewerId : null}
          layoutEditor={inEditor ? { previewCount: limit, saving: Boolean(draft), onLayout: cardSave.save, feedbackFor: cardSave.feedbackFor } : undefined}
          onRemove={target => removeFavorite("cards", target)} onArt={(target, normalArt) => {
          setGroups(current => current?.map(group => group.kind === "cards" ? { ...group, items: group.items.map(item => item.target === target ? { ...item, normalArt } : item) } : group) ?? null);
        }} />}
        {kind === "events" && <FavoriteTimeline items={items} homeVisible={homeVisible} expanded={active} editing={inEditor} visitor={!profile.isOwner} heading={heading} footer={footerToggle}
          editor={editable ? viewerId : null} onRemove={target => removeFavorite("events", target)} />}
        {kind === "songs" && <FavoriteSongList items={items} limit={limit} expanded={active && items.length > limit} footer={footerToggle()}
          editing={inEditor} orderSave={songSave}
          queueId={`favorites:${profile.publicUid}`} editor={editable ? viewerId : null} onRemove={(target, keyboardMenu) => removeFavorite("songs", target, keyboardMenu)} />}
      </section>;
    })}
  </div>;
}

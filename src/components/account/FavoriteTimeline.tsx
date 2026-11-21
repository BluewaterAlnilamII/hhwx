"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import LoadingImage from "@/components/LoadingImage";
import LoadingIndicator from "@/components/LoadingIndicator";
import LoadingError from "@/components/LoadingError";
import FavoriteRemoveButton from "./FavoriteRemoveButton";
import { useBandoriEventsMaster } from "@/hooks/useBandoriEventsMaster";
import { useBandoriEventsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { getBandoriServerCode, getBandoriServerTimeZone, getBandoriRegionalDisplayOrder, normalizeBandoriServer, BANDORI_SERVERS, type BandoriServer } from "@/lib/bandori-server";
import { resolveBandoriEventServerScheduleWindow } from "@/lib/bandori/events/region";
import { getBandoriEventStatusAt } from "@/lib/bandori/events/status";
import { readAttributeBonusItems } from "@/lib/bandori/events/summary";
import { getBandoriEventBandId } from "@/lib/bandori/events/band";
import { buildBandoriCardAttributeIconUrl, buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import { getBandDisplayName } from "@/lib/calendar-character-service";
import { buildBandoriPublicAssetUrl, lookupBandoriEventBanner } from "@/lib/bandori-public-asset-index";
import { eventPreview, type FavoriteItem } from "@/lib/bandori/favorites";
import styles from "./ProfileFavorites.module.css";


export default function FavoriteTimeline({ items, homeVisible, expanded, editing, heading, footer, editor, onRemove }: {
  items: FavoriteItem[]; homeVisible: boolean; expanded: boolean; editing: boolean; heading: (controls: React.ReactNode, hasMore: boolean) => React.ReactNode;
  footer: (hasMore: boolean) => React.ReactNode;
  editor: string | null; onRemove: (target: string) => void;
}) {
  const catalog = useBandoriEventsMaster();
  const assets = useBandoriEventsAssetIndex(!editing);
  const tChart = useTranslations("bandori.events.tracker.chart");
  const t = useTranslations("account.favorites");
  const tStatus = useTranslations("bandori.events.status");
  const tAttribute = useTranslations("bandori.cardFilters.attributes");
  const common = useTranslations("common");
  const locale = useLocale();
  const regions = useMemo(() => BANDORI_SERVERS.map(server => ({
    server, ids: new Set(items.filter(item => item.target.startsWith(getBandoriServerCode(server) + ":")).map(item => Number(item.target.split(":")[1]))),
  })).filter(region => region.ids.size).sort((a,b) => b.ids.size - a.ids.size), [items]);
  const [failedBanners, setFailedBanners] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState("");
  const activeStation = useRef<HTMLLIElement>(null);
  const touch = useRef(false);
  useEffect(() => {
    if (!revealed) return;
    function dismiss(e: PointerEvent) {
      if (e.target instanceof Node && !activeStation.current?.contains(e.target)) setRevealed("");
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [revealed]);
  const [selected, select] = useState<BandoriServer | null>(() => normalizeBandoriServer(history.state?.collectionEventServer));
  const { server, ids } = regions.find(region => region.server === selected) ?? regions[0];
  const code = getBandoriServerCode(server);
  const entries = useMemo(() => catalog.events.filter(event => ids.has(event.eventId)).map(event => {
    const schedule = resolveBandoriEventServerScheduleWindow(event, server);
    return { event, schedule, end: schedule.endAt ?? Infinity };
  }).sort((a, b) => a.schedule.startAt === b.schedule.startAt
    ? a.event.eventId - b.event.eventId
    : (a.schedule.startAt ?? Infinity) - (b.schedule.startAt ?? Infinity)), [catalog.events, ids, server]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!homeVisible) return;
    function refreshTime() {
      if (document.visibilityState === "visible") setNow(Date.now());
    }
    refreshTime();
    document.addEventListener("visibilitychange", refreshTime);
    window.addEventListener("pageshow", refreshTime);
    return () => {
      document.removeEventListener("visibilitychange", refreshTime);
      window.removeEventListener("pageshow", refreshTime);
    };
  }, [homeVisible]);

  const preview = eventPreview(entries, now);
  const shown = expanded ? entries : preview;
  const hasMore = entries.length > preview.length;
  // Right-align the first partial row so the preview still starts in column one.
  const leadingColumns = expanded && preview.length ? (4 - entries.indexOf(preview[0]) % 4) % 4 : 0;
  const hasLaterEvents = !expanded && entries.some(item =>
    (item.schedule.startAt === null || item.schedule.startAt > now) && !shown.includes(item));
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: getBandoriServerTimeZone(server) });
  return <>
    {heading(<div className={styles.flags} data-heading-part="controls" role="group" aria-label={t("server")}>{regions.map(region => <button type="button" key={region.server}
      aria-label={t("region." + getBandoriServerCode(region.server))} title={t("region." + getBandoriServerCode(region.server))}
      aria-pressed={region.server === server} onClick={() => {
        select(region.server);
        history.replaceState({ ...history.state, collectionEventServer: region.server }, "");
      }}><BandoriServerIcon server={region.server} size={20} isDecorative /></button>)}</div>, hasMore)}
    {!catalog.loaded ? (catalog.error ? <LoadingError onRetry={() => { catalog.refresh(); assets.refresh(); }} /> : <LoadingIndicator label={common("states.loading")} />) : <ul className={editing ? undefined : styles.timeline} data-continues={hasLaterEvents || undefined}>{shown.map(({ event, schedule }, index) => {
      const order = getBandoriRegionalDisplayOrder(server);
      const title = order.map(region => event.name[getBandoriServerCode(region)]).find(Boolean) ?? "#" + event.eventId;
      const icons = readAttributeBonusItems(event.bonus).map(({ attribute }) => ({
        src: buildBandoriCardAttributeIconUrl(attribute), label: tAttribute(attribute),
      }));
      const bandId = getBandoriEventBandId(event.band);
      if (bandId !== null) icons.unshift({ src: buildBandoriCardBandIconUrl(bandId), label: getBandDisplayName(event.band) });
      const target = code + ":" + event.eventId;
      const href = `/bandori/events/${event.eventId}?server=${code}`;
      const rememberServer = expanded ? () => history.replaceState({ ...history.state, collectionEventServer: server }, "") : undefined;
      const eventIcons = icons.map(({ src, label }) => src && <Image key={src} unoptimized src={src} alt={label} title={label} width={18} height={18} />);
      const remove = editor && <FavoriteRemoveButton kind="events" editor={editor} target={target} editing={editing} onRemove={removed => {
        select(current => current ?? server);
        setRevealed(current => current === removed ? "" : current);
        onRemove(removed);
      }} />;
      if (editing) return <li key={target} className={styles.editorRow} data-event={target} data-collection-extra={!preview.includes(shown[index]) || undefined}>
        <div className={styles.eventEditorInfo}>
          <span className={styles.eventPeriod} data-has-band={bandId !== null}>{eventIcons}{tChart("eventNumber", { eventId: event.eventId })}</span>
          <Link className={styles.eventEditorName} href={href} prefetch={false} title={title} onNavigate={rememberServer}>{title}</Link>
        </div>
        {remove}
      </li>;
      const status = getBandoriEventStatusAt(now, schedule.startAt, schedule.endAt);
      const banner = order.map(region => lookupBandoriEventBanner(assets.value, event.eventId, getBandoriServerCode(region))).find(Boolean);
      const src = buildBandoriPublicAssetUrl(banner);
      const hasBanner = src && !failedBanners.has(src);
      return <li className={styles.station} key={target} data-event={target} data-live={status === "ongoing"} data-collection-extra={expanded && !preview.includes(shown[index]) || undefined}
        data-start-column={index === 0 ? leadingColumns + 1 : undefined} data-row-end={(index + leadingColumns + 1) % 4 === 0 || undefined}
        data-revealed={revealed === target || (!hasBanner && Boolean(assets.value || assets.error)) || undefined}
        ref={revealed === target ? activeStation : undefined}>
        <small className={styles.when}>{schedule.startAt !== null ? date.format(schedule.startAt) : "—"}</small><i className={styles.rail} aria-hidden="true" />
        <Link className={styles.eventLink} href={href} prefetch={false} aria-label={title} onNavigate={rememberServer}>
          <span className={styles.banner}>{hasBanner && <LoadingImage
            onPointerDown={e => { touch.current = e.pointerType === "touch" || e.pointerType === "pen"; }}
            onClick={e => {
              if (editor && touch.current && e.detail && revealed !== target) {
                e.preventDefault();
                setRevealed(target);
              }
            }}
            onError={() => setFailedBanners(current => new Set(current).add(src))} src={src} loadingLabel={common("states.loading")} alt="" loading="lazy" decoding="async" />}</span>
          <strong><span>{title}</span></strong>
        </Link>
        {remove}
        <small className={styles.status}>
          {eventIcons}
          <span>{tStatus(status)}</span>
        </small>
      </li>;
    })}</ul>}
    {footer(hasMore)}
  </>;
}

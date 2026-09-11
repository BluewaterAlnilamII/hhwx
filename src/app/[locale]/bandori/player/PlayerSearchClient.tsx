"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, Users, Music, Trophy, Star, UserRound, ImageOff } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import Heading from "@/components/Heading";
import LoadingIndicator from "@/components/LoadingIndicator";
import LoadingImage from "@/components/LoadingImage";
import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import BandoriDeckRank from "@/components/bandori/BandoriDeckRank";
import { BandoriCardArtImage } from "@/components/bandori/BandoriCardArtImage";
import { BandoriDetailColumns, BandoriDetailRow as DetailRow } from "@/components/bandori/BandoriDetailLayout";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import BandoriDegreeView from "@/components/bandori/BandoriDegreeView";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { useBandoriDegreeCatalog } from "@/hooks/useBandoriDegrees";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriCardsAssetIndex, useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { buildBandoriBandLogoUrl, buildBandoriCharacterIconUrl, buildBandoriPlayerSpriteUrl } from "@/lib/bandori-builtin-resources";
import { getBandoriDegreeCatalogItemsForRegion } from "@/lib/bandori-degree-assets";
import { BANDORI_CHART_DIFFICULTIES } from "@/lib/bandori-master-contract";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";
import { resolveBandoriSkillLabel } from "@/lib/bandori-skill-label";
import { getBandoriServerCode, getBandoriServerFromCode, pickBandoriRegionalText, type BandoriServer } from "@/lib/bandori-server";
import { pickBandoriCharacterDisplayName, resolveBandoriCardBandId } from "@/lib/bandori/cards/master";
import { PLAYER_BANDS, PLAYER_STAGE_BANDS, PLAYER_CLEAR_ROWS, PLAYER_UID_PATTERN, parseBandoriPlayerResponse, type PlayerProfileView, type PlayerSection } from "@/lib/bandori/player-profile";
import BandoriPageShell from "../BandoriPageShell";
import BandoriCardServerSwitcher from "../cards/_components/BandoriCardServerSwitcher";

const sectionClass = "mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6";
const rowClass = "border-b border-[var(--theme-color-border-subtle)] last:border-b-0";

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className={`@container ${sectionClass}`}><Heading as="h2" visualRole="section" accentSlot="c" icon={icon}>{title}</Heading><div className="mt-4 text-sm font-semibold leading-5 text-[var(--theme-color-text-default)]">{children}</div></section>;
}

function DetailColumns({ children }: { children: ReactNode[] }) {
  const middle = Math.ceil(children.length / 2);
  return <div className="mx-auto max-w-[21rem] @min-[54rem]:max-w-3xl"><BandoriDetailColumns left={<dl>{children.slice(0, middle)}</dl>} right={<dl>{children.slice(middle)}</dl>} /></div>;
}

function Availability({ section, children }: { section: PlayerSection<unknown>; children: ReactNode }) {
  const t = useTranslations("bandori.player");
  return section.public && section.value !== null ? children : <p className="py-3 text-sm text-[var(--theme-color-text-muted)]">{t(section.public ? "noData" : "private")}</p>;
}

function AssetImage({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const common = useTranslations("common");
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
    {src && failed !== src ? <LoadingImage src={src} alt={alt} loadingLabel={common("states.loading")} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailed(src)} />
      : <span role="img" aria-label={`${alt} · ${common("states.imageUnavailable")}`} title={common("states.imageUnavailable")} className="text-[var(--theme-color-text-muted)]"><ImageOff className="h-5 w-5" /></span>}
  </span>;
}

function BandLabel({ bandId }: { bandId: number }) {
  const t = useTranslations("bandori.player");
  const band = PLAYER_BANDS.find((band) => band.bandId === bandId);
  return band ? <AssetImage src={buildBandoriBandLogoUrl(bandId)} alt={band.label} className="h-7 w-20 max-w-full" /> : <span>{t("other")}</span>;
}

function BandStats({ children }: { children: ReactNode[] }) {
  return <div className="@container flex flex-wrap justify-center gap-x-2 gap-y-4 py-3">
    <dl className="flex gap-2">{children.slice(0, 4)}</dl>
    <dl className="flex gap-2">{children.slice(4)}</dl>
  </div>;
}

function BandStat({ bandId, children }: { bandId: number; children: ReactNode }) {
  return <div className="flex w-[min(5rem,calc((100cqw-1.5rem)/4))] shrink-0 flex-col items-center gap-1 text-center">
    <dt className="flex w-full justify-center"><BandLabel bandId={bandId} /></dt>
    <dd className="flex flex-col items-center gap-1 tabular-nums">{children}</dd>
  </div>;
}

function RatingDetails({ player }: { player: PlayerProfileView }) {
  const t = useTranslations("bandori.player");
  const common = useTranslations("common");
  const locale = useLocale();
  const server = getBandoriServerFromCode(player.server)!;
  const music = useBandoriMusicMaster();
  const assets = useBandoriMusicAssetIndex();
  const format = (value: number | null) => value === null ? t("noData") : value.toLocaleString(locale);
  const error = music.error ?? assets.error;
  if ((!music.music || !assets.value) && !error) return <LoadingIndicator label={common("states.loading")} className="min-h-40" />;
  return <>
    {error ? <p role="alert" className="mb-4 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{t("mediaFailed")} <button type="button" className="hhwx-text-link" onClick={() => { music.refresh(); assets.refresh(); }}>{common("actions.retry")}</button></p> : null}
    <dl><DetailRow label={t("total")} className="w-20 grid-cols-1 justify-items-center gap-1 sm:grid-cols-1 sm:gap-1"><span className="tabular-nums">{format(player.rating.value?.total ?? null)}</span></DetailRow></dl>
    <dl>{player.rating.value?.groups.map((group) => <DetailRow key={group.bandId} alignment="center" className="grid-cols-[5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4" label={<span className="flex w-20 flex-col items-center gap-1 text-center"><BandLabel bandId={group.bandId} /><span className="tabular-nums">{format(group.total)}</span></span>}>
      {group.songs?.length ? <div className="grid w-full min-w-0 grid-cols-3 gap-2 text-left sm:gap-3">{group.songs.map((song, index) => {
        const title = pickBandoriRegionalText(music.music?.[song.musicId]?.musicTitle, server, server) || `#${song.musicId}`;
        const href = `/bandori/songs/${song.musicId}?server=${player.server}`;
        const artworkUrl = buildBandoriPublicAssetUrl(assets.value?.songs[song.musicId]?.files.thumb);
        const artworkFallback = <ImageOff className="h-5 w-5" aria-label={common("states.imageUnavailable")} />;
        return <div key={`${song.musicId}:${song.difficulty}:${index}`} className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
          <Link href={href} aria-label={title} tabIndex={-1} prefetch={false} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)]">{artworkUrl ? <MusicArtwork src={artworkUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={artworkFallback} /> : artworkFallback}</Link>
          <div className="min-w-0 max-w-full">
            <Link href={href} title={title} prefetch={false} className="hhwx-text-link block truncate rounded-md text-xs sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--theme-color-focus-ring)]">{title}</Link>
            <span className="block text-[10px] text-[var(--theme-color-text-muted)] sm:text-xs">{song.difficulty.toUpperCase()}</span>
            <span className="block text-sm tabular-nums text-[var(--theme-color-text-default)]">{format(song.rating)}</span>
          </div>
        </div>;
      })}</div> : <p className="text-sm text-[var(--theme-color-text-muted)]">{t(group.songs ? "noRecords" : "noData")}</p>}
    </DetailRow>)}</dl>
  </>;
}

function PlayerResults({ player }: { player: PlayerProfileView }) {
  const t = useTranslations("bandori.player");
  const common = useTranslations("common");
  const terms = useTranslations("bandori.terms");
  const locale = useLocale();
  const server = getBandoriServerFromCode(player.server)!;
  const cards = useBandoriCardsMaster(server);
  const characters = useBandoriCharactersMaster();
  const skills = useBandoriSkillsMaster();
  const assets = useBandoriCardsAssetIndex();
  const degrees = useBandoriDegreeCatalog(player.degreeIds.length > 0);
  const format = (value: number | null | undefined) => value === null || value === undefined ? t("noData") : value.toLocaleString(locale);
  const error = cards.error ?? characters.error ?? skills.error ?? assets.error ?? degrees.error;
  if (!error && (cards.loading || characters.loading || skills.loading || assets.loading || degrees.loading)) return <LoadingIndicator label={common("states.loading")} className="min-h-64" />;
  const metadata = (id: number) => cards.data?.[id];
  const cardLabel = (id: number) => {
    const card = metadata(id);
    return [pickBandoriCharacterDisplayName(characters.data?.[String(card?.characterId)], server, server), pickBandoriRegionalText(card?.prefix, server, server)].filter(Boolean).join(" · ") || `#${id}`;
  };
  const portrait = player.portrait;
  const degreeMap = new Map(getBandoriDegreeCatalogItemsForRegion(degrees.catalog, player.server).map((degree) => [degree.id, degree]));
  const showCard = (card: PlayerProfileView["cards"][number]) => {
    const master = metadata(card.cardId);
    const tileCard = { cardId: card.cardId, level: card.level ?? 0, masterRank: card.masterRank ?? 0, skillLevel: card.skillLevel ?? 0, isTrained: card.isTrained, illustration: card.illust, bandId: resolveBandoriCardBandId(master, characters.data ?? {}) };
    const skill = resolveBandoriSkillLabel(skills.data?.[String(master?.skillId)] ?? undefined, card.skillLevel, 1, server, server, terms("unknownSkill"));
    return <BandoriCardTile interaction={{ kind: "information" }} card={tileCard} metadata={master ?? undefined} cardName={pickBandoriRegionalText(master?.prefix, server, server) || cardLabel(card.cardId)} server={server} characterName={pickBandoriCharacterDisplayName(characters.data?.[String(master?.characterId)], server, server)} skillEffectLabel={skill.label} skillEffectLanguageTag={skill.languageTag} size="compact" showLevel={false} showPower={false} leaderLabel={card.isLeader ? t("leader") : undefined} />;
  };
  return <>
    {error ? <p role="alert" className="mt-5 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{t("mediaFailed")} <button type="button" className="hhwx-text-link" onClick={() => { cards.refresh(); characters.refresh(); skills.refresh(); assets.refresh(); degrees.refresh(); }}>{common("actions.retry")}</button></p> : null}
    <Section title={t("profile")} icon={<UserRound className="h-5 w-5" />}>
      <div className="mx-auto grid max-w-[59rem] items-center gap-x-8 gap-y-4 @min-[52rem]:grid-cols-[minmax(0,1fr)_29rem]">
        <div className="mx-auto aspect-square w-full max-w-md">{portrait ? <BandoriCardArtImage cardId={portrait.cardId} resourceSetName={metadata(portrait.cardId)?.resourceSetName} trainType={portrait.illust} imageKind="trim" alt={cardLabel(portrait.cardId)} className="object-contain" /> : null}</div>
        <div className="min-w-0 border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-4 text-center sm:p-6">
          <Heading as="h3" visualRole="subsection" className="wrap-anywhere">{player.name || t("noData")}</Heading>
          <p className="mt-1 text-sm tabular-nums">{t("rank")} {format(player.rank)}</p>
          <div aria-label={t("degree")} className="mt-4 flex flex-wrap justify-center gap-2">{player.degreeIds.length ? player.degreeIds.map((id, index) => degreeMap.has(id) ? <BandoriDegreeView key={`${id}:${index}`} degree={degreeMap.get(id)!} active /> : <span key={`${id}:${index}`}>#{id}</span>) : t("noData")}</div>
          <p className="mt-4 whitespace-pre-wrap wrap-anywhere">{player.introduction || t("noIntroduction")}</p>
          <p className="mt-4 flex items-center justify-center gap-2" aria-label={t("uid")}><BandoriServerIcon server={server} size={20} /><span className="tabular-nums">{player.uid}</span></p>
          <div className="mt-4 border-t border-[var(--theme-color-border-subtle)] pt-4">
            <Heading as="h3" visualRole="subsection" className="text-sm">{t("mainBand")}</Heading>
            {player.cards.length ? <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:gap-2">{player.cards.map((card, index) => <div key={`${card.cardId}:${index}`}>{showCard(card)}</div>)}</div> : <p className="mt-3 text-[var(--theme-color-text-muted)]">{t("noData")}</p>}
          </div>
          <p className="mt-4 text-xs text-[var(--theme-color-text-muted)]">{t("fetchedAt")} {player.fetchedAt ? <time dateTime={player.fetchedAt}>{new Date(player.fetchedAt).toLocaleString(locale)}</time> : t("noData")}{player.cache ? ` · ${t("cached")}` : ""}</p>
        </div>
      </div>
    </Section>
    <Section title={t("bandRank")} icon={<Users className="h-5 w-5" />}>
      <Availability section={player.bandRanks}><BandStats>{PLAYER_BANDS.map((band) => <BandStat key={band.bandId} bandId={band.bandId}>{format(player.bandRanks.value?.[band.bandId])}</BandStat>)}</BandStats></Availability>
    </Section>
    <Section title={t("musicRecords")} icon={<Music className="h-5 w-5" />}>
      <table className="mx-auto w-full max-w-[40rem] table-fixed text-sm"><thead><tr className={rowClass}><th className="w-24 sm:w-40"><span className="sr-only">{t("musicRecords")}</span></th>{BANDORI_CHART_DIFFICULTIES.map((difficulty) => <th key={difficulty} scope="col" className="py-3 text-center text-[10px] font-semibold text-[var(--theme-color-text-muted)] sm:text-xs">{difficulty.toUpperCase()}</th>)}</tr></thead>
        <tbody>{PLAYER_CLEAR_ROWS.map(([, , key], index) => {
          const section = player.clears[index];
          return <tr key={key} className={rowClass}><th scope="row" className="py-3 pr-3 text-left text-xs font-semibold text-[var(--theme-color-text-muted)] sm:text-sm">{t(key)}</th>{section.public && section.value ? BANDORI_CHART_DIFFICULTIES.map((difficulty) => <td key={difficulty} className="py-3 text-center tabular-nums">{format(section.value?.[difficulty])}</td>) : <td colSpan={5} className="py-3 text-center text-[var(--theme-color-text-muted)]">{t(section.public ? "noData" : "private")}</td>}</tr>;
        })}</tbody>
      </table>
    </Section>
    <Section title={t("rating")} icon={<Trophy className="h-5 w-5" />}><Availability section={player.rating}>{player.rating.public && player.rating.value ? <RatingDetails player={player} /> : null}</Availability></Section>
    <Section title={t("stage")} icon={<Star className="h-5 w-5" />}><Availability section={player.stage}><BandStats>{PLAYER_STAGE_BANDS.map((band) => <BandStat key={band.bandId} bandId={band.bandId}><span className="inline-flex items-center gap-1"><AssetImage src={buildBandoriPlayerSpriteUrl("icon_stagechallenge")} alt="" className="h-4 w-4" />{format(player.stage.value?.[band.bandId])}</span></BandStat>)}</BandStats></Availability></Section>
    <Section title={t("deckRank")} icon={<Trophy className="h-5 w-5" />}><Availability section={player.deckRanks}><BandStats>{PLAYER_BANDS.map((band) => {
      const rank = player.deckRanks.value?.[band.bandId];
      return <BandStat key={band.bandId} bandId={band.bandId}>{rank ? <BandoriDeckRank rank={rank.rank} level={rank.level} /> : <span className="inline-flex h-7 items-center">{t("noData")}</span>}<span className="text-xs">{rank?.score == null ? t("noData") : rank.score.toLocaleString(locale, { useGrouping: false })}</span></BandStat>;
    })}</BandStats></Availability></Section>
    <Section title={t("characterRank")} icon={<Users className="h-5 w-5" />}><Availability section={player.characterRanks}><DetailColumns>{PLAYER_BANDS.map((band) => <DetailRow key={band.bandId} label={<BandLabel bandId={band.bandId} />} className="mx-auto w-full max-w-[21rem] grid-cols-[5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4"><div className="grid w-full max-w-60 grid-cols-5 gap-2">{band.characterIds.map((id) => {
      const name = pickBandoriCharacterDisplayName(characters.data?.[id], server, server, `#${id}`);
      return <div key={id} className="flex min-w-0 flex-col items-center gap-1"><AssetImage src={buildBandoriCharacterIconUrl(id)} alt={name} className="h-7 w-7 rounded-full" /><span className="tabular-nums">{format(player.characterRanks.value?.[id])}</span></div>;
    })}</div></DetailRow>)}</DetailColumns></Availability></Section>
  </>;
}

export default function PlayerSearchClient({ initialServer, initialUid }: { initialServer: BandoriServer; initialUid: string }) {
  const t = useTranslations("bandori.player");
  const common = useTranslations("common");
  const router = useRouter();
  const [server, setServer] = useState(initialServer);
  const [uid, setUid] = useState(initialUid);
  const [invalid, setInvalid] = useState(Boolean(initialUid && !PLAYER_UID_PATTERN.test(initialUid)));
  const code = getBandoriServerCode(initialServer);
  const url = PLAYER_UID_PATTERN.test(initialUid) ? `/api/bandori/player/${code}/${initialUid}` : null;
  const result = useCachedFetch(url, url, parseBandoriPlayerResponse, { refreshOnVisible: false });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUid = uid.trim();
    if (!PLAYER_UID_PATTERN.test(nextUid)) { setInvalid(true); return; }
    setInvalid(false);
    if (server === initialServer && nextUid === initialUid) result.refresh();
    else router.push(`/bandori/player/${getBandoriServerCode(server)}/${nextUid}`, { scroll: false });
  };
  return <BandoriPageShell contentClassName="max-w-6xl"><article className="hhwx-panel border p-4 sm:p-6">
    <Heading as="h1" visualRole="page">{t("title")}</Heading>
    <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-4">
      <div className="w-full sm:w-auto"><BandoriCardServerSwitcher selectedServer={server} label={t("server")} onChange={setServer} /></div>
      <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-bold sm:min-w-52">{t("uid")}<input name="uid" type="text" inputMode="numeric" autoComplete="off" maxLength={16} value={uid} aria-invalid={invalid} aria-describedby={invalid ? "player-id-error" : undefined} onChange={(event) => { setUid(event.target.value); setInvalid(false); }} className="hhwx-control h-11 w-full rounded-xl border px-3 font-normal tabular-nums" /></label>
      <button type="submit" className="hhwx-action-accent inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-bold disabled:opacity-50" disabled={(result.loading || result.refreshing) && server === initialServer && uid.trim() === initialUid}><Search className="h-4 w-4" />{t(result.loading || result.refreshing ? "searching" : "search")}</button>
    </form>
    {invalid ? <p id="player-id-error" role="alert" className="mt-3 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{t("invalidId")}</p> : null}
    {result.error ? <p role="alert" className="mt-5 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{t(result.data ? "refreshFailed" : result.error.message === "HTTP 404" ? "unavailable" : result.error.message === "HTTP 503" ? "busy" : "failed")} <button type="button" className="hhwx-text-link" onClick={result.refresh}>{common("actions.retry")}</button></p> : null}
    {result.loading ? <LoadingIndicator label={t("searching")} className="min-h-64" /> : result.data ? <PlayerResults player={result.data} /> : !result.error && !invalid ? <p className="py-12 text-center text-sm text-[var(--theme-color-text-muted)]">{t("prompt")}</p> : null}
  </article></BandoriPageShell>;
}

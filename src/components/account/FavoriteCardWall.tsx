"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { normalizeLocale } from "@/i18n/routing";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { favoritesRequest, setBandoriFavorite } from "@/hooks/useBandoriFavorites";
import { useActionFeedback } from "@/hooks/useActionFeedback";
import ActionFeedback from "@/components/ActionFeedback";
import LoadingError from "@/components/LoadingError";
import FavoriteCardArtwork from "./FavoriteCardArtwork";
import BandoriFavoriteButton from "@/components/bandori/BandoriFavoriteButton";
import FavoriteCardEditor, { type CardEditorProps } from "./FavoriteCardEditor";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import LoadingIndicator from "@/components/LoadingIndicator";
import { buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import { buildBandoriPublicAssetUrl, listBandoriCardAssetVariants, lookupBandoriCardImage } from "@/lib/bandori-public-asset-index";
import { parseFavoriteKey, type FavoriteItem } from "@/lib/bandori/favorites";
import { pickGameProfileCardName } from "@/lib/bandori/cards/game-profile-card";
import { pickBandoriCharacterDisplayName } from "@/lib/bandori/cards/master";
import { resolveBandoriCardForServer, resolveBandoriCardForServerWithRegionalFallback } from "@/lib/bandori/cards/regional-extensions";
import { getBandoriServerCode } from "@/lib/bandori-server";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import styles from "./ProfileFavorites.module.css";

type CardActions = {
  onArt: (target: string, normal: boolean) => void;
  onRemove: (target: string) => void;
};

function FavoriteCardActions({ item, editor, canFlip, onArt, onRemove, listControls }: CardActions & {
  item: FavoriteItem; editor: string; canFlip: boolean;
  listControls?: { disabled: boolean; setBusy: (value: boolean) => void };
}) {
  const t = useTranslations("account.favorites");
  const homepage = useTranslations("account.homepage");
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const { feedback, showFeedback } = useActionFeedback(editor + ":" + item.target);
  async function save(action: "flip" | "remove") {
    if (lock.current || listControls?.disabled) return;
    lock.current = true;
    setBusy(true);
    listControls?.setBusy(true);
    const key = "cards:" + item.target;
    try {
      if (action === "remove") {
        await setBandoriFavorite(editor, key, false, () => onRemove(item.target));
      } else {
        await favoritesRequest("/api/bandori/favorites/" + key + "?art=" + (item.normalArt ? "after_training" : "normal"), editor, { method: "PATCH" });
        onArt(item.target, !item.normalArt);
        showFeedback("success", homepage("saved"));
      }
    } catch {
      showFeedback("error", t(action === "remove" ? "removeFailed" : "artFailed"));
    } finally {
      lock.current = false;
      setBusy(false);
      listControls?.setBusy(false);
    }
  }
  const flipLabel = t(!canFlip ? "artUnavailable" : item.normalArt ? "trained" : "normal");
  const disabled = busy || listControls?.disabled;
  return <>
    <div className={listControls ? styles.editorActions : styles.cardActions}>
      <button type="button" title={t("remove")} aria-label={t("remove")} aria-disabled={disabled} onClick={() => void save("remove")}>
        <span><Star size={16} className="hhwx-saved-star" aria-hidden="true" /></span>
      </button>
      <button type="button" title={flipLabel} aria-label={flipLabel} disabled={!canFlip} aria-disabled={!canFlip || disabled} onClick={() => void save("flip")}>
        <span><ArrowLeftRight size={16} className={styles.flipIcon} aria-hidden="true" /></span>
      </button>
    </div>
    <ActionFeedback feedback={feedback} className={listControls ? "right-2 top-1/2 -translate-y-1/2" : "top-2 left-2"} />
  </>;
}

export default function FavoriteCardWall({ items, previewCount, editor, visitor, layoutEditor, footer, onArt, onRemove }: CardActions & {
  items: FavoriteItem[]; previewCount: number; editor: string | null; visitor: boolean; layoutEditor?: CardEditorProps; footer: React.ReactNode;
}) {
  const cards = useBandoriCardsMaster();
  const assets = useBandoriCardsAssetIndex();
  const characters = useBandoriCharactersMaster();
  const preferred = useBandoriPreferredServer();
  const locale = normalizeLocale(useLocale());
  const common = useTranslations("common");
  const [revealed, setRevealed] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [failedArt, setFailedArt] = useState<ReadonlySet<string>>(new Set());
  const touch = useRef(false);
  if (!cards.data || !assets.value || (layoutEditor && !characters.data)) {
    return cards.error || assets.error || (layoutEditor && characters.error)
      ? <LoadingError onRetry={() => { cards.refresh(); assets.refresh(); characters.refresh(); }} />
      : <LoadingIndicator label={common("states.loading")} />;
  }
  const listSaving = savingCard || Boolean(layoutEditor?.saving);
  const listControls = layoutEditor && { disabled: listSaving, setBusy: setSavingCard };
  const resolved = items.map(item => {
    const entity = parseFavoriteKey("cards:" + item.target)!;
    const raw = cards.data?.[entity.id];
    const card = raw && (entity.server === null ? resolveBandoriCardForServerWithRegionalFallback(raw, preferred) : resolveBandoriCardForServer(raw, entity.server));
    const server = entity.server ?? preferred;
    const art = buildBandoriPublicAssetUrl(lookupBandoriCardImage(assets.value, card?.resourceSetName, item.normalArt ? "normal" : "after_training", layoutEditor ? "thumb" : "full"));
    const title = pickGameProfileCardName(Number(entity.id), card ?? undefined, preferred, locale, server);
    const character = characters.data?.[String(card?.characterId)];
    const name = pickBandoriCharacterDisplayName(character, preferred, server) ?? "";
    const href = `/bandori/cards/${entity.id}?server=${getBandoriServerCode(server)}`;
    const actions = visitor ? <BandoriFavoriteButton kind="cards" id={entity.id} server={entity.server} overlayClassName={styles.cardActions} />
      : editor && <FavoriteCardActions item={item} editor={editor} onArt={onArt} onRemove={onRemove}
      canFlip={hasTrainedCardArt(card) && listBandoriCardAssetVariants(assets.value, card?.resourceSetName).length === 2} listControls={listControls} />;
    const band = character?.bandId != null ? buildBandoriCardBandIconUrl(character.bandId) : null;
    return { target: item.target, href, actions, title, name, band, art };
  });
  if (layoutEditor && editor) {
    return <><FavoriteCardEditor {...layoutEditor} saving={listSaving} cards={resolved} />{footer}</>;
  }
  const tiles = resolved.map(({ target, href, title, name, band, art, actions }, index) => {
    return <div key={target} className={styles.tile} data-card={target} data-collection-extra={index >= previewCount || undefined} data-revealed={revealed === target}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setRevealed(current => current === target ? "" : current); }}>
      <Link href={href} prefetch={false}
        aria-label={[title, name].filter(Boolean).join(" · ")} onPointerDown={e => { touch.current = e.pointerType === "touch" || e.pointerType === "pen"; }}
        onClick={e => { if (e.detail && touch.current && revealed !== target) { e.preventDefault(); setRevealed(target); } }}>
        {art && !failedArt.has(art) && <FavoriteCardArtwork key={art} src={art} loadingLabel={common("states.loading")}
          onError={() => setFailedArt(current => new Set(current).add(art))} />}
        <span className={styles.caption} data-visible={!art || failedArt.has(art)}><strong>{title}</strong><small>{band ? <Image unoptimized src={band} alt="" width={16} height={16} /> : null}{name}</small></span>
      </Link>
      {actions}
    </div>;
  });
  const groups = [tiles.slice(0, previewCount)];
  for (let i = previewCount; i < tiles.length; i += 6) groups.push(tiles.slice(i, i + 6));
  return <><div className={styles.wall}>{groups.map((group, i) =>
    <div key={i} className={styles.group} data-size={group.length}>{group}</div>)}</div>{footer}</>;
}

"use client";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Crosshair, ImageIcon, EyeOff, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import AccountAvatarCardControl from "@/app/[locale]/account/AccountAvatarCardControl";
import AccountDisplayDegreeControl from "@/components/account/AccountDisplayDegreeControl";
import BandoriDegreeView from "@/components/bandori/BandoriDegreeView";
import { BandoriCardPickerDialogContent } from "@/components/bandori/card-picker/BandoriCardPickerDialog";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { CommentPublicUid } from "@/components/comments/CommentPublicUid";
import LoadingImage from "@/components/LoadingImage";
import ActionFeedback from "@/components/ActionFeedback";
import { useActionFeedback, type ActionFeedbackState } from "@/hooks/useActionFeedback";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { buildBandoriPublicAssetUrl, lookupBandoriCardImage } from "@/lib/bandori-public-asset-index";
import type { BandoriDegreeCatalogItem } from "@/lib/bandori-degree-assets";
import type { AccountAvatarFields, AccountDegreeFields, AccountProfile } from "@/lib/account-profile-store";
import { fitProfileSignature, type ProfileCover, type ProfileHomepage, type ProfileHomepagePreferences } from "@/lib/profile-homepage";
import styles from "./PublicProfile.module.css";

const DEFAULT_COVER: ProfileCover = { cardId: 2087, entityServer: null, trainType: "after_training", x: 50, y: 33.111000870726784 };

export function ProfileInfo({ profile, mobile = false }: { profile: ProfileHomepage; mobile?: boolean }) {
  const t = useTranslations("account.homepage");
  const date = profile.createdAt?.slice(0, 10);
  return <div className={mobile ? styles.mobileInfo : styles.info}>
    <div className={styles.basic}><CommentPublicUid publicUid={profile.publicUid} />{date && <span className={styles.date}>{t("joined", { date })}</span>}</div>
    {profile.bindings.map(account => <div key={`${account.server}:${account.gameUid}`} className={styles.binding}>
      <BandoriServerIcon server={account.server} size={20} /><span>{account.gameUid}</span>
      {profile.isOwner && !account.public && <EyeOff size={13} aria-label={t("private")} />}
    </div>)}
  </div>;
}

function Signature({ text, owner, save }: { text: string; owner: boolean; save: (value: string) => Promise<void> }) {
  const t = useTranslations("account.homepage");
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { feedback, showFeedback, clearFeedback } = useActionFeedback("signature");
  const submittedWithEnter = useRef(false);
  const composing = useRef(false);
  if (!owner) return text ? <div className={styles.signature}><span className={styles.signatureText}>{text}</span></div> : null;
  function updateDraft(field: HTMLInputElement) {
    if (!composing.current && fitProfileSignature(field.value) !== field.value) {
      const end = field.selectionEnd ?? field.value.length;
      const suffix = field.value.slice(end);
      const prefix = fitProfileSignature(field.value.slice(0, end), suffix);
      field.value = prefix + suffix;
      field.setSelectionRange(prefix.length, prefix.length);
    }
    setDraft(field.value);
  }
  return <div className={styles.signature}>
    <input type="text" aria-label={t("signature")} placeholder={t("addSignature")} autoComplete="off"
      value={draft ?? text} readOnly={saving} onChange={e => updateDraft(e.currentTarget)}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={e => { composing.current = false; updateDraft(e.currentTarget); }}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing || saving) return;
        if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
        if (e.key === "Enter") { e.preventDefault(); submittedWithEnter.current = true; e.currentTarget.blur(); }
      }}
      onBlur={async e => {
        const field = e.currentTarget;
        const restoreOnFailure = submittedWithEnter.current;
        submittedWithEnter.current = false;
        const value = fitProfileSignature(field.value);
        if (saving) return;
        if (draft === null || value.trim() === text) {
          setDraft(null);
          return;
        }
        setSaving(true);
        clearFeedback();
        try {
          await save(value);
          setDraft(null);
          showFeedback("success", t("saved"));
        } catch {
          showFeedback("error", t("saveFailed"));
          if (restoreOnFailure && document.activeElement === document.body) field.focus({ preventScroll: true });
        } finally {
          setSaving(false);
        }
      }} />
    <ActionFeedback feedback={feedback} className="left-0 top-full mt-1" />
  </div>;
}

export default function ProfileHeader({ profile, ownProfile, degree, saving, onSave, onSaveSignature, onAccountChange, feedback }: {
  profile: ProfileHomepage; ownProfile: AccountProfile | null; degree: BandoriDegreeCatalogItem | null; saving: boolean;
  onSave: (patch: Pick<ProfileHomepagePreferences, "cover">) => Promise<boolean>;
  onSaveSignature: (value: string) => Promise<void>;
  onAccountChange: (fields: AccountAvatarFields | AccountDegreeFields) => void;
  feedback: ActionFeedbackState | null;
}) {
  const t = useTranslations("account.homepage");
  const commonT = useTranslations("common");
  const [draft, setDraft] = useState<ProfileCover | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<ProfileCover | null>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; focus: ProfileCover; rangeX: number; rangeY: number } | null>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const selected = draft ?? profile.cover ?? DEFAULT_COVER;
  const { data: cards, canonicalData } = useBandoriCardsMaster(selected.entityServer ?? undefined);
  const { value: assets } = useBandoriCardsAssetIndex();
  const selectedSrc = buildBandoriPublicAssetUrl(lookupBandoriCardImage(assets, cards?.[String(selected.cardId)]?.resourceSetName, selected.trainType, "full"));
  const useFallback = !draft && (!selectedSrc || failedImages.includes(selectedSrc));
  const cover = useFallback ? DEFAULT_COVER : selected;
  const source = useFallback
    ? buildBandoriPublicAssetUrl(lookupBandoriCardImage(assets, canonicalData?.[String(DEFAULT_COVER.cardId)]?.resourceSetName, DEFAULT_COVER.trainType, "full"))
    : selectedSrc;
  const src = source && !failedImages.includes(source) ? source : null;
  const editable = profile.isOwner && ownProfile?.emailVerified;
  const avatar = <AccountCardAvatar className={styles.avatarImage} username={profile.username} cardId={profile.avatar.cardId} entityServer={profile.avatar.entityServer} trainType={profile.avatar.trainType} />;
  const title = degree && <BandoriDegreeView degree={degree} degreeEffectId={profile.displayDegree.degreeEffectId} size="comment" active />;
  const focusCover = () => requestAnimationFrame(() => coverRef.current?.focus({ preventScroll: true }));
  const finishCover = () => { setDraft(null); requestAnimationFrame(() => menuRef.current?.querySelector("summary")?.focus({ preventScroll: true })); };
  return <header className={styles.header} data-editing={Boolean(draft)}>
    <div className={styles.backdrop} ref={imageRef}>
      {src && <LoadingImage src={src} loading="eager" draggable={false} alt={t("cover")} loadingLabel={commonT("states.loading")} onError={() => setFailedImages(previous => [...previous, src])} style={{ objectPosition: `${cover.x}% ${cover.y}%` }} />}
      {draft && src && <Crosshair size={24} className={styles.reticle} aria-hidden="true" />}
    </div>
    <div className={styles.coverWindow} ref={coverRef} tabIndex={draft ? 0 : undefined} role={draft ? "group" : undefined} aria-label={draft ? t("adjustCover") : undefined}
      onKeyDown={e => {
        if (!draft || saving) return;
        if (e.key === "Escape") { finishCover(); return; }
        const keys: Record<string, [number, number]> = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] };
        const delta = keys[e.key];
        if (delta) { e.preventDefault(); setDraft({ ...draft, x: Math.max(0, Math.min(100, draft.x + delta[0])), y: Math.max(0, Math.min(100, draft.y + delta[1])) }); }
      }}
      onPointerDown={e => {
        if (!draft || saving || !e.isPrimary || e.button !== 0) return;
        const image = imageRef.current?.querySelector("img");
        if (!image?.naturalWidth) return;
        e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
        const rect = image.getBoundingClientRect();
        const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, focus: draft, rangeX: image.naturalWidth * scale - rect.width, rangeY: image.naturalHeight * scale - rect.height };
      }}
      onPointerMove={e => {
        const start = drag.current;
        if (!start || start.id !== e.pointerId) return;
        setDraft({ ...start.focus,
          x: start.rangeX > 0 ? Math.max(0, Math.min(100, start.focus.x - (e.clientX - start.x) / start.rangeX * 100)) : start.focus.x,
          y: start.rangeY > 0 ? Math.max(0, Math.min(100, start.focus.y - (e.clientY - start.y) / start.rangeY * 100)) : start.focus.y });
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
    </div>
    {editable && <div className={styles.coverActions}>
      <ActionFeedback feedback={feedback} className="right-full top-0 mr-2" />
      {draft ? <><button type="button" disabled={saving || !src} onClick={async () => { if (await onSave({ cover: draft })) finishCover(); }}>{t("save")}</button><button type="button" disabled={saving} onClick={finishCover}>{t("cancel")}</button></> :
        <details ref={menuRef} className={styles.coverMenu} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false; }} onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label={t("coverOptions")} title={t("coverOptions")}><ImageIcon size={16} /></summary>
          <div className={styles.menu}>
            <button type="button" onClick={() => { menuRef.current!.open = false; setPickerValue(selected); setPickerOpen(true); }}>{t("chooseCover")}</button>
            <button type="button" disabled={!src || useFallback} onClick={() => { menuRef.current!.open = false; setDraft(cover); focusCover(); }}>{t("adjustCover")}</button>
          </div>
        </details>}
    </div>}
    <div className={styles.identity}>
      <div className={styles.avatar}>{editable && ownProfile ? <AccountAvatarCardControl profile={ownProfile} onProfileChange={onAccountChange} trigger={<button className={styles.editArt} type="button" aria-label={t("chooseAvatar")}>{avatar}<Pencil size={22} aria-hidden="true" /></button>} /> : avatar}</div>
      <h1>{profile.username}</h1>
      <div className={styles.displayDegree}>{title && editable && ownProfile && profile.bindings.length > 0 ? <AccountDisplayDegreeControl profile={ownProfile} onProfileChange={onAccountChange} trigger={<button className={styles.editArt} type="button" aria-label={t("chooseTitle")}>{title}<Pencil size={14} aria-hidden="true" /></button>} /> : title}</div>
      <Signature text={profile.signature} owner={Boolean(editable)} save={onSaveSignature} />
    </div>
    <ProfileInfo profile={profile} mobile />
    <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
      <BandoriCardPickerDialogContent title={t("chooseCover")} closeLabel={t("close")} value={pickerValue}
        onValueChange={value => setPickerValue(value ? { ...value, x: 50, y: 50 } : null)}
        onCloseAutoFocus={e => { e.preventDefault(); if (draft) focusCover(); else menuRef.current?.querySelector("summary")?.focus(); }}
        footer={<div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close asChild><button type="button" className="hhwx-control inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition">{t("cancel")}</button></Dialog.Close>
          <button type="button" disabled={!pickerValue} className="hhwx-action-accent inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition" onClick={() => { setDraft(pickerValue); setPickerOpen(false); focusCover(); }}><Check className="h-4 w-4" aria-hidden="true" />{t("useCover")}</button>
        </div>} />
    </Dialog.Root>
  </header>;
}

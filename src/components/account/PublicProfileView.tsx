"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EyeOff } from "lucide-react";
import ProfileHeader, { ProfileInfo } from "./ProfileHeader";
import ProfileFavorites from "./ProfileFavorites";
import ProfileSettings, { type BindingSettings, type ModuleSettings } from "./ProfileSettings";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import BandoriDegreeView from "@/components/bandori/BandoriDegreeView";
import LoadingIndicator from "@/components/LoadingIndicator";
import LoadingError from "@/components/LoadingError";
import { useProfileSectionSave as useSectionSave } from "@/hooks/useProfileSectionSave";
import { useBandoriDegreeCatalog } from "@/hooks/useBandoriDegrees";
import { getBandoriDegreeCatalogItemsForRegion } from "@/lib/bandori-degree-assets";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";
import { getSafeSession } from "@/lib/supabase";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { useGameStore } from "@/store/useGameStore";
import { useAccountProfile } from "@/app/[locale]/account/useAccountProfile";
import type { AccountAvatarFields, AccountDegreeFields } from "@/lib/account-profile-store";
import { groupProfileDegrees, projectProfileBindings, type ProfileHomepage, type ProfileHomepagePreferences } from "@/lib/profile-homepage";
import styles from "./PublicProfile.module.css";

function withPreferences(profile: ProfileHomepage | null, patch: Partial<ProfileHomepagePreferences>) {
  if (!profile?.preferences) return profile;
  const preferences = { ...profile.preferences, ...patch };
  return { ...profile, preferences, signature: preferences.signature, cover: preferences.cover,
    bindings: projectProfileBindings(profile.bindings, preferences, true) };
}

function ProfilePage({ publicUid, viewerId }: { publicUid: number; viewerId: string | null }) {
  const t = useTranslations("account.homepage");
  const commonT = useTranslations("common");
  const [confirmed, setProfile] = useState<ProfileHomepage | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("home");
  const mounted = useRef(true);
  const { profile: ownProfile, updateProfile, profileError: ownProfileError, loadProfile: retryOwnProfile } = useAccountProfile(undefined, confirmed?.isOwner === true);
  const { catalog, error: catalogError, refresh: refreshCatalog } = useBandoriDegreeCatalog(Boolean(confirmed));

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const session = viewerId ? await getSafeSession() : null;
        if (controller.signal.aborted) return;
        const response = await fetch(`/api/users/${publicUid}`, { signal: controller.signal, cache: "no-store",
          headers: session?.user.id === viewerId ? { Authorization: `Bearer ${session.access_token}` } : {} });
        if (!response.ok) throw new Error("load");
        const value = parseApiSuccessData<ProfileHomepage>(await response.json());
        if (!value || value.publicUid !== publicUid) throw new Error("load");
        if (!controller.signal.aborted) { setProfile(value); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    }
    void load();
    return () => controller.abort();
  }, [publicUid, viewerId, retry]);

  async function persist(patch: Partial<ProfileHomepagePreferences>) {
    const session = await getSafeSession();
    if (!viewerId || session?.user.id !== viewerId || useGameStore.getState().userId !== viewerId) throw new Error("session");
    const response = await fetch("/api/account/homepage", { method: "PATCH", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const persisted = parseApiSuccessData<Partial<ProfileHomepagePreferences>>(await response.json());
    if (!response.ok || !persisted || !mounted.current || useGameStore.getState().userId !== viewerId) throw new Error("save");
    return persisted;
  }

  async function saveSignature(value: string) {
    const { signature } = await persist({ signature: value });
    if (typeof signature !== "string") throw new Error("save");
    setProfile(current => withPreferences(current, { signature }));
  }

  async function saveSettings(values: ModuleSettings | BindingSettings) {
    await persist(values);
    setProfile(current => withPreferences(current, values));
  }
  const modules = useSectionSave<ModuleSettings>(saveSettings);
  const accounts = useSectionSave<BindingSettings>(saveSettings);
  const cover = useSectionSave(async (value: Pick<ProfileHomepagePreferences, "cover">) => {
    const { cover: savedCover } = await persist(value);
    if (savedCover === undefined) throw new Error("save");
    setProfile(current => withPreferences(current, { cover: savedCover }));
  });
  const profile = modules.pending || accounts.pending
    ? withPreferences(confirmed, { ...modules.pending, ...accounts.pending }) : confirmed;

  const degreesByServer = useMemo(() => new Map(([0, 1, 2, 3] as BandoriServer[]).map(server => [server,
    new Map(getBandoriDegreeCatalogItemsForRegion(catalog, getBandoriServerCode(server)).map(degree => [degree.id, degree]))])), [catalog]);
  const updateAccount = (fields: AccountAvatarFields | AccountDegreeFields) => {
    if (!mounted.current || useGameStore.getState().userId !== viewerId) return;
    updateProfile(fields);
    const change = "avatarCardId" in fields
      ? { avatar: { cardId: fields.avatarCardId, entityServer: fields.avatarCardServer, trainType: fields.avatarCardTrainType } }
      : { displayDegree: { server: fields.displayDegreeServer, degreeId: fields.displayDegreeId, degreeEffectId: fields.displayDegreeEffectId } };
    setProfile(current => current && { ...current, ...change });
  };
  if (!profile) return <main className={styles.loading}>{failed ? <LoadingError onRetry={() => { setFailed(false); setRetry(n => n + 1); }} /> : <LoadingIndicator label={commonT("states.loading")} />}</main>;
  const degree = degreesByServer.get(profile.displayDegree.server)?.get(profile.displayDegree.degreeId) ?? null;
  const tabs = ["home", ...(profile.bindings.length ? ["details"] : []), ...(profile.isOwner ? ["settings"] : [])];
  const selectedTab = tabs.includes(tab) ? tab : "home";
  const needsTitleCatalog = profile.bindings.some(account =>
    (profile.isOwner || account.titlesPublic) && account.ownedDegreeIds.length > 0);
  return <main className={styles.profile}>
    <ProfileHeader profile={profile} ownProfile={profile.isOwner ? ownProfile : null} degree={degree} onAccountChange={updateAccount} saving={Boolean(cover.pending)} onSave={value => cover.save(value, "cover")} onSaveSignature={saveSignature} feedback={cover.feedbackFor("cover")} />
    <div className={styles.columns}>
      <div className={styles.main}>
        <div role="tablist" aria-label={t("navigation")} className={styles.tabs}>
          {tabs.map((name, index) => <button key={name} type="button" role="tab" id={`profile-tab-${name}`} aria-selected={selectedTab === name} aria-controls={`profile-panel-${name}`} tabIndex={selectedTab === name ? 0 : -1}
            onClick={() => setTab(name)} onKeyDown={e => {
              const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
              if (next >= 0) { e.preventDefault(); setTab(tabs[next]); document.getElementById(`profile-tab-${tabs[next]}`)?.focus(); }
            }}>{t(name)}</button>)}
        </div>
        <div id="profile-panel-home" role="tabpanel" aria-labelledby="profile-tab-home" className={styles.panel} data-empty="true" hidden={selectedTab !== "home"}>
          <ProfileFavorites profile={profile} viewerId={viewerId} homeVisible={selectedTab === "home"} editable={Boolean(profile.isOwner && ownProfile?.emailVerified)} />
        </div>
        {tabs.includes("details") && <div id="profile-panel-details" role="tabpanel" aria-labelledby="profile-tab-details" className={styles.panel} hidden={selectedTab !== "details"}>
          {selectedTab === "details" && (needsTitleCatalog && !catalog
            ? (catalogError ? <LoadingError className="min-h-40" onRetry={refreshCatalog} /> : <LoadingIndicator label={commonT("states.loading")} className="min-h-40" />)
            : profile.bindings.map(account => {
            const groups = groupProfileDegrees(account, degreesByServer.get(account.server)!);
            return <section key={`${account.server}:${account.gameUid}`} className={styles.account}>
              <div className={styles.accountHeading}><BandoriServerIcon server={account.server} size={20} /><h2><span>{account.gameUid}</span>{account.playerName && <span>{account.playerName}</span>}</h2>
                {profile.isOwner && !account.public && <EyeOff size={13} aria-label={t("private")} />}</div>
              {(profile.isOwner || account.titlesPublic) && groups.some(group => group.length > 0) && <div className={styles.titles}>
                {profile.isOwner && account.public && !account.titlesPublic && <EyeOff size={13} aria-label={t("private")} />}
                {groups.map((variants, index) => variants.length ? <div key={index} className={styles.titleGroup} role="group" aria-label={t(`degreeGroup${index}`)}>
                  {variants.map(({ degree: item, degreeEffectId }) => <BandoriDegreeView key={`${item.id}:${degreeEffectId}`} degree={item} degreeEffectId={degreeEffectId} size="comment" />)}
                </div> : null)}
              </div>}
            </section>;
          }))}
        </div>}
        {profile.isOwner && <div id="profile-panel-settings" role="tabpanel" aria-labelledby="profile-tab-settings" className={styles.panel} hidden={selectedTab !== "settings"}>
          {selectedTab === "settings" && profile.preferences && (ownProfileError ? <LoadingError onRetry={() => { void retryOwnProfile(); }} /> : !ownProfile ? <LoadingIndicator label={commonT("states.loading")} /> :
            <ProfileSettings preferences={profile.preferences} readOnly={!ownProfile.emailVerified} modules={modules} accounts={accounts} />)}
        </div>}
      </div>
      <aside className={styles.sidebar}><h2>{t("personalInfo")}</h2><ProfileInfo profile={profile} /></aside>
    </div>
  </main>;
}

export default function PublicProfileView({ publicUid }: { publicUid: number }) {
  const userId = useGameStore(state => state.userId);
  const authReady = useGameStore(state => state.authReady);
  const t = useTranslations("common");
  if (!authReady) return <div className={styles.loading}><LoadingIndicator label={t("states.loading")} /></div>;
  // Changing viewer discards every private field and pending local edit before the next render.
  return <ProfilePage key={`${publicUid}:${userId}`} publicUid={publicUid} viewerId={userId} />;
}

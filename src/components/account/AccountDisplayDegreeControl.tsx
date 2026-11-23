"use client";
import LoadingError from "@/components/LoadingError";
import ActionFeedback from "@/components/ActionFeedback";
import { groupProfileDegrees } from "@/lib/profile-homepage";

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { BadgeCheck, Save, X } from "lucide-react";
import LoadingIndicator, { LoadingSpinner } from "@/components/LoadingIndicator";
import BandoriDegreeView from "@/components/bandori/BandoriDegreeView";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { useBandoriDegreeCatalog } from "@/hooks/useBandoriDegrees";
import {
  compareDisplayDegreeSelections,
  parseAccountDisplayDegreeOptions,
  parseDisplayDegreeRequest,
  type AccountDisplayDegreeBinding,
  type AccountDisplayDegreeOptions,
  type AccountDisplayDegreeSelection,
} from "@/lib/account-display-degree";
import { parseApiSuccessData, getApiErrorCode } from "@/lib/api-contracts";
import { getBandoriDegreeCatalogItemsForRegion, type BandoriDegreeCatalogItem } from "@/lib/bandori-degree-assets";
import { getBandoriServerCode } from "@/lib/bandori-server";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import { cn } from "@/lib/utils";
import type { AccountDegreeFields, AccountProfile } from "@/lib/account-profile-store";
import { getSafeSession } from "@/lib/supabase";

function toSelection(profile: AccountProfile): AccountDisplayDegreeSelection {
  return {
    server: profile.displayDegreeServer,
    degreeId: profile.displayDegreeId,
    degreeEffectId: profile.displayDegreeEffectId ?? null,
  };
}

function getAccountKey(account: AccountDisplayDegreeBinding): string {
  return `${account.server}:${account.gameUid}`;
}

function pickInitialAccount(
  options: AccountDisplayDegreeOptions,
): AccountDisplayDegreeBinding | null {
  return options.accounts.find((account) => (
    account.server === options.selected.server
    && account.ownedDegreeIds.includes(options.selected.degreeId)
    && (
      options.selected.degreeEffectId === null
      || account.ownedDegreeEffectIds.includes(options.selected.degreeEffectId)
    )
  )) ?? options.accounts.find((account) => account.ownedDegreeIds.length > 0)
    ?? options.accounts[0]
    ?? null;
}

function DegreeOption({
  degree,
  degreeEffectId,
  selected,
  onSelect,
}: {
  degree: BandoriDegreeCatalogItem;
  degreeEffectId: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const [interactive, setInteractive] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setInteractive(true); }}
      onPointerLeave={() => setInteractive(false)}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setInteractive(true); }}
      onBlur={() => setInteractive(false)}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 w-[127px] shrink-0 items-center justify-center rounded border bg-[var(--theme-color-control-background)] px-1.5 text-[var(--theme-color-text-muted)] outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)]",
        selected
          ? "border-[var(--theme-color-selection-subtle-ring)] ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)]"
          : "border-[var(--theme-color-border-subtle)] hover:border-[var(--theme-color-action-secondary-border)]",
      )}
    >
      <BandoriDegreeView
        degree={degree}
        degreeEffectId={degreeEffectId}
        active={selected || interactive}
      />
    </button>
  );
}

export default function AccountDisplayDegreeControl({
  profile,
  onProfileChange,
  trigger,
}: {
  trigger: ReactElement;
  profile: AccountProfile;
  onProfileChange: (fields: AccountDegreeFields) => void;
}) {
  const t = useTranslations("account.displayDegree");
  const errorT = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AccountDisplayDegreeOptions | null>(null);
  const [selectedAccountKey, setSelectedAccountKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountDisplayDegreeSelection>(() => toSelection(profile));
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const optionsRequestRef = useRef(0);
  const dialogSession = useRef(0);
  const { catalog, loading: loadingCatalog, error: catalogError, refresh: refreshCatalog } = useBandoriDegreeCatalog(true);

  const catalogByServer = useMemo(() => {
    const result = new Map<number, Map<number, BandoriDegreeCatalogItem>>();
    if (!catalog) return result;
    for (let server = 0; server < 4; server += 1) {
      result.set(server, new Map(
        getBandoriDegreeCatalogItemsForRegion(catalog, getBandoriServerCode(server as 0 | 1 | 2 | 3))
          .map((degree) => [degree.id, degree]),
      ));
    }
    return result;
  }, [catalog]);
  const selectedAccount = options?.accounts.find(
    (account) => getAccountKey(account) === selectedAccountKey,
  ) ?? null;
  const availableDegreeVariants = useMemo(() => {
    if (!selectedAccount) return [];
    return groupProfileDegrees(selectedAccount, catalogByServer.get(selectedAccount.server) ?? new Map()).filter(group => group.length);
  }, [catalogByServer, selectedAccount]);
  const hasChanges = !compareDisplayDegreeSelections(toSelection(profile), draft);

  const loadOptions = useCallback(async (settings?: { preserveDraft?: boolean }) => {
    const requestId = ++optionsRequestRef.current;
    setLoadingOptions(true);
    setMessage("");
    try {
      const session = await getSafeSession();
      const accessToken = session?.user.id === profile.userId ? session.access_token : null;
      if (requestId !== optionsRequestRef.current) return;
      if (!accessToken) {
        setMessage(t("notSignedIn"));
        return;
      }
      const response = await fetch("/api/account/display-degree", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== optionsRequestRef.current) return;
      if (!response.ok) {
        setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("loadFailed"));
        return;
      }
      const parsed = parseAccountDisplayDegreeOptions(
        parseApiSuccessData<unknown>(payload),
      );
      if (!parsed) {
        setMessage(t("invalidResponse"));
        return;
      }
      setOptions(parsed);
      if (!settings?.preserveDraft) {
        setDraft(parsed.selected);
      }
      const initialAccount = pickInitialAccount(parsed);
      setSelectedAccountKey(initialAccount ? getAccountKey(initialAccount) : null);
      if (!compareDisplayDegreeSelections(toSelection(profile), parsed.selected)) {
        onProfileChange({
          displayDegreeServer: parsed.selected.server,
          displayDegreeId: parsed.selected.degreeId,
          displayDegreeEffectId: parsed.selected.degreeEffectId,
        });
      }
    } catch {
      if (requestId !== optionsRequestRef.current) return;
      setMessage(t("loadFailed"));
    } finally {
      if (requestId === optionsRequestRef.current) setLoadingOptions(false);
    }
  }, [errorT, onProfileChange, profile, t]);

  useEffect(() => () => { optionsRequestRef.current += 1; }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    dialogSession.current += 1;
    optionsRequestRef.current += 1;
    setOpen(nextOpen);
    setDraft(toSelection(profile));
    setOptions(null);
    setSelectedAccountKey(null);
    setMessage("");
    setLoadingOptions(false);
    if (nextOpen) {
      void loadOptions();
    }
  };

  const saveDegree = async () => {
    const sessionId = dialogSession.current;
    const isCurrent = () => sessionId === dialogSession.current;
    setSaving(true);
    setMessage("");
    try {
      const session = await getSafeSession();
      const accessToken = session?.user.id === profile.userId ? session.access_token : null;
      if (!accessToken) {
        if (isCurrent()) setMessage(t("notSignedIn"));
        return;
      }
      const response = await fetch("/api/account/display-degree", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!isCurrent()) return;
        if (getApiErrorCode(payload) === "DISPLAY_DEGREE_NOT_OWNED") {
          await loadOptions({ preserveDraft: true });
          if (isCurrent()) setMessage(t("ownershipChanged"));
          return;
        }
        setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("saveFailed"));
        return;
      }
      const saved = parseDisplayDegreeSelection(payload);
      if (!saved) {
        if (isCurrent()) setMessage(t("invalidResponse"));
        return;
      }
      onProfileChange({
        displayDegreeServer: saved.server,
        displayDegreeId: saved.degreeId,
        displayDegreeEffectId: saved.degreeEffectId,
      });
      if (isCurrent()) handleOpenChange(false);
    } catch {
      if (isCurrent()) setMessage(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="hhwx-profile-overlay fixed inset-0 z-1000 bg-[var(--theme-color-overlay-background)]" />
        <Dialog.Content aria-describedby={undefined} className="hhwx-profile-dialog hhwx-floating-surface fixed left-1/2 top-1/2 z-1000 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl outline-hidden sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title asChild>
                  <h2 className="text-lg font-bold text-[var(--theme-color-text-default)]">{t("dialogTitle")}</h2>
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button type="button" title={t("close")} aria-label={t("close")} className="hhwx-control inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {loadingOptions ? (
                <LoadingIndicator label={t("loading")} className="min-h-48" />
              ) : options ? (
                <div className="space-y-4">
                  <section>
                    {options.accounts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {options.accounts.map((account) => {
                          const accountKey = getAccountKey(account);
                          const selected = selectedAccountKey === accountKey;
                          const empty = account.ownedDegreeIds.length === 0;
                          return (
                            <button
                              key={accountKey}
                              type="button"
                              onClick={() => setSelectedAccountKey(accountKey)}
                              aria-pressed={selected}
                              className={cn(
                                "inline-flex min-h-9 items-center gap-2 rounded border bg-[var(--theme-color-control-background)] px-2 py-1 text-left outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)]",
                                selected ? "border-[var(--theme-color-selection-subtle-ring)] ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)]" : "border-[var(--theme-color-border-subtle)] hover:border-[var(--theme-color-action-secondary-border)]",
                                empty && "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)]",
                              )}
                            >
                              <BandoriServerIcon server={account.server} size={20} />
                              <span className="min-w-0 flex-1">
                                <span className={cn("block text-sm font-semibold", empty ? "text-[var(--theme-color-text-muted)]" : "text-[var(--theme-color-text-default)]")}>{account.gameUid}</span>
                                {empty && <span className="mt-1 block text-xs font-medium text-[var(--theme-color-text-muted)]">{t("empty")}</span>}
                              </span>
                              {selected && <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--theme-color-selection-subtle-foreground)]" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">{t("empty")}</div>
                    )}
                  </section>

                  <section>
                    {catalogError ? <LoadingError className="min-h-32" onRetry={refreshCatalog} /> : loadingCatalog ? (
                      <LoadingIndicator label={t("loading")} className="min-h-32" />
                    ) : availableDegreeVariants.length > 0 ? (
                      <div className="space-y-5">
                        {availableDegreeVariants.map((group, index) => <div key={index} className="flex flex-wrap gap-2">{group.map(({ degree, degreeEffectId }) => (
                          <DegreeOption
                            key={`${degree.region}:${degree.id}:${degreeEffectId ?? "plain"}`}
                            degree={degree}
                            degreeEffectId={degreeEffectId}
                            selected={draft.server === selectedAccount?.server
                              && draft.degreeId === degree.id
                              && draft.degreeEffectId === degreeEffectId}
                            onSelect={() => setDraft({
                              server: selectedAccount?.server ?? profile.displayDegreeServer,
                              degreeId: degree.id,
                              degreeEffectId,
                            })}
                          />
                        ))}</div>)}
                      </div>
                    ) : !catalogError ? (
                      <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">{t("empty")}</div>
                    ) : null}
                  </section>
                </div>
              ) : (
                <LoadingError className="min-h-40" onRetry={() => void loadOptions()} />
              )}
            </div>

            <div className="relative flex shrink-0 justify-end border-t border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-3">
              <ActionFeedback feedback={options && message ? { type: "error", message } : null} className="right-4 bottom-full mb-1" />
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="hhwx-control inline-flex h-8 items-center rounded border px-3 text-sm font-semibold transition">{t("cancel")}</button>
                </Dialog.Close>
                <button type="button" disabled={saving || !hasChanges} onClick={saveDegree} className="hhwx-action-accent inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-semibold transition ">
                  {saving ? <LoadingSpinner className="text-current" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {saving ? t("saving") : t("save")}
                </button>
              </div>
            </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function parseDisplayDegreeSelection(payload: unknown): AccountDisplayDegreeSelection | null {
  return parseDisplayDegreeRequest(parseApiSuccessData<unknown>(payload));
}

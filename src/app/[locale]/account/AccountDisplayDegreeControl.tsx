"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { BadgeCheck, Save, X } from "lucide-react";
import LoadingIndicator, { LoadingSpinner } from "@/components/LoadingIndicator";
import BandoriDegreeView from "@/components/bandori/BandoriDegreeView";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { useBandoriDegreeCatalog } from "@/hooks/useBandoriDegrees";
import {
  compareDisplayDegreeSelections,
  getAccountDisplayDegreeVariants,
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
import { type AccountProfile, getAccessToken } from "./useAccountProfile";

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
        "flex min-h-14 w-full items-center justify-center rounded-2xl border bg-[var(--theme-color-control-background)] p-2 text-[var(--theme-color-text-muted)] shadow-xs outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]",
        selected
          ? "border-[var(--theme-color-selection-subtle-ring)] ring-2 ring-[var(--theme-color-selection-subtle-ring)]"
          : "border-[var(--theme-color-border-subtle)] hover:border-[var(--theme-color-action-secondary-border)] hover:shadow-md",
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
}: {
  profile: AccountProfile;
  onProfileChange: (profile: AccountProfile) => void;
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
  const currentDegree = catalogByServer.get(profile.displayDegreeServer)?.get(profile.displayDegreeId) ?? null;
  const selectedAccount = options?.accounts.find(
    (account) => getAccountKey(account) === selectedAccountKey,
  ) ?? null;
  const availableDegreeVariants = useMemo(() => {
    if (!selectedAccount) return [];
    return getAccountDisplayDegreeVariants(
      selectedAccount,
      catalogByServer.get(selectedAccount.server),
    );
  }, [catalogByServer, selectedAccount]);
  const hasChanges = !compareDisplayDegreeSelections(toSelection(profile), draft);

  const loadOptions = useCallback(async (settings?: { preserveDraft?: boolean }) => {
    setLoadingOptions(true);
    setMessage("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage(t("notSignedIn"));
        return;
      }
      const response = await fetch("/api/account/display-degree", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("httpLoadFailed", { status: response.status }));
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
          ...profile,
          displayDegreeServer: parsed.selected.server,
          displayDegreeId: parsed.selected.degreeId,
          displayDegreeEffectId: parsed.selected.degreeEffectId,
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setLoadingOptions(false);
    }
  }, [errorT, onProfileChange, profile, t]);

  useEffect(() => {
    if (!open) {
      setDraft(toSelection(profile));
      setOptions(null);
      setSelectedAccountKey(null);
      setMessage("");
      return;
    }
    void loadOptions();
  }, [loadOptions, open, profile]);

  const saveDegree = async () => {
    setSaving(true);
    setMessage("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage(t("notSignedIn"));
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
        if (getApiErrorCode(payload) === "DISPLAY_DEGREE_NOT_OWNED") {
          await loadOptions({ preserveDraft: true });
          setMessage(t("ownershipChanged"));
          return;
        }
        setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("httpSaveFailed", { status: response.status }));
        return;
      }
      const saved = parseDisplayDegreeSelection(payload);
      if (!saved) {
        setMessage(t("invalidResponse"));
        return;
      }
      onProfileChange({
        ...profile,
        displayDegreeServer: saved.server,
        displayDegreeId: saved.degreeId,
        displayDegreeEffectId: saved.degreeEffectId,
      });
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("chooseTitle")}
          className="mt-3 flex max-w-full rounded-lg text-[var(--theme-color-profile-banner-foreground)]/90 outline-hidden transition hover:bg-[var(--theme-color-profile-banner-foreground)]/8 focus-visible:ring-2 focus-visible:ring-[var(--theme-color-profile-banner-foreground)]/60"
        >
          {currentDegree ? (
            <BandoriDegreeView
              degree={currentDegree}
              degreeEffectId={profile.displayDegreeEffectId}
              active
              className="w-[115px]"
            />
          ) : (
            <span className="inline-flex h-[25px] w-[115px] max-w-full items-center justify-center rounded-lg border border-dashed border-[var(--theme-color-profile-banner-foreground)]/35 px-2 text-xs font-semibold">
              {loadingCatalog ? <LoadingSpinner /> : t("resourceUnavailable")}
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1000 bg-[var(--theme-color-overlay-background)]" />
        <Dialog.Content className="hhwx-floating-surface fixed left-1/2 top-1/2 z-1000 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl outline-hidden sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <Dialog.Title asChild>
                  <h2 className="text-lg font-bold text-[var(--theme-color-text-default)]">{t("dialogTitle")}</h2>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p className="mt-1 text-sm leading-6 text-[var(--theme-color-text-muted)]">{t("dialogDescription")}</p>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" title={t("close")} aria-label={t("close")} className="hhwx-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              {loadingOptions ? (
                <LoadingIndicator label={t("loading")} className="min-h-48" />
              ) : options ? (
                <div className="space-y-6">
                  <section>
                    <h3 className="mb-3 text-sm font-bold text-[var(--theme-color-text-default)]">{t("accountsLabel")}</h3>
                    {options.accounts.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
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
                                "flex min-h-20 items-center gap-3 rounded-2xl border bg-[var(--theme-color-control-background)] px-4 py-3 text-left shadow-xs outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]",
                                selected ? "border-[var(--theme-color-selection-subtle-ring)] ring-2 ring-[var(--theme-color-selection-subtle-ring)]" : "border-[var(--theme-color-border-subtle)] hover:border-[var(--theme-color-action-secondary-border)]",
                                empty && "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)]",
                              )}
                            >
                              <BandoriServerIcon server={account.server} size={22} />
                              <span className="min-w-0 flex-1">
                                <span className={cn("block truncate text-base font-bold", empty ? "text-[var(--theme-color-text-muted)]" : "text-[var(--theme-color-text-default)]")}>UID {account.gameUid}</span>
                                {empty && <span className="mt-1 block text-xs font-medium text-[var(--theme-color-text-muted)]">{t("empty")}</span>}
                              </span>
                              {selected && <BadgeCheck className="h-5 w-5 shrink-0 text-[var(--theme-color-selection-subtle-foreground)]" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">{t("empty")}</div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-bold text-[var(--theme-color-text-default)]">{t("degreesLabel")}</h3>
                    {catalogError ? (
                      <div role="alert" className="mb-3 flex flex-col items-center gap-3 py-6 text-center text-sm font-semibold text-[var(--theme-color-semantic-danger-foreground)]">
                        <span>{t("resourceUnavailable")}</span>
                        <button type="button" onClick={refreshCatalog} className="hhwx-control rounded-xl border px-4 py-2 transition">{t("retry")}</button>
                      </div>
                    ) : null}
                    {loadingCatalog ? (
                      <LoadingIndicator label={t("loading")} className="min-h-32" />
                    ) : availableDegreeVariants.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {availableDegreeVariants.map(({ degree, degreeEffectId }) => (
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
                        ))}
                      </div>
                    ) : !catalogError ? (
                      <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">{t("empty")}</div>
                    ) : null}
                  </section>
                </div>
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm font-semibold text-[var(--theme-color-semantic-danger-foreground)]">
                  <span>{message || t("loadFailed")}</span>
                  <button type="button" onClick={() => void loadOptions()} className="hhwx-control rounded-xl border px-4 py-2 transition">{t("retry")}</button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-h-5 text-sm font-semibold text-[var(--theme-color-semantic-danger-foreground)]">{options ? message : ""}</div>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="hhwx-control inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition">{t("cancel")}</button>
                </Dialog.Close>
                <button type="button" disabled={saving || !hasChanges} onClick={saveDegree} className="hhwx-action-accent inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ">
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

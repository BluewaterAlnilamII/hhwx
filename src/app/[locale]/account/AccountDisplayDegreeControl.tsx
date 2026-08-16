"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { BadgeCheck, Loader2, Save, X } from "lucide-react";
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
      onMouseEnter={() => setInteractive(true)}
      onMouseLeave={() => setInteractive(false)}
      onFocus={() => setInteractive(true)}
      onBlur={() => setInteractive(false)}
      aria-pressed={selected}
      className={cn(
        "flex min-h-14 w-full items-center justify-center rounded-2xl border bg-white p-2 text-slate-600 shadow-xs outline-hidden transition focus-visible:ring-2 focus-visible:ring-sky-400",
        selected
          ? "border-sky-400 ring-2 ring-sky-100"
          : "border-slate-200 hover:border-sky-200 hover:shadow-md",
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
  const { catalog, loading: loadingCatalog, error: catalogError } = useBandoriDegreeCatalog(true);

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
          className="mt-3 flex max-w-full rounded-lg text-white/90 outline-hidden transition hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {currentDegree ? (
            <BandoriDegreeView
              degree={currentDegree}
              degreeEffectId={profile.displayDegreeEffectId}
              active
              className="w-[115px]"
            />
          ) : (
            <span className="inline-flex h-[25px] w-[115px] max-w-full items-center justify-center rounded-lg border border-dashed border-white/35 px-2 text-xs font-semibold">
              {loadingCatalog ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t("resourceUnavailable")}
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1000 bg-slate-950/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-1000 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl outline-hidden sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <Dialog.Title asChild>
                  <h2 className="text-lg font-bold text-slate-900">{t("dialogTitle")}</h2>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{t("dialogDescription")}</p>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" title={t("close")} aria-label={t("close")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              {loadingOptions ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{t("loading")}</div>
              ) : options ? (
                <div className="space-y-6">
                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-700">{t("accountsLabel")}</h3>
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
                                "flex min-h-20 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-xs outline-hidden transition focus-visible:ring-2 focus-visible:ring-sky-400",
                                selected ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200 hover:border-sky-200",
                                empty && "bg-slate-100 text-slate-400",
                              )}
                            >
                              <BandoriServerIcon server={account.server} size={22} />
                              <span className="min-w-0 flex-1">
                                <span className={cn("block truncate text-base font-bold", empty ? "text-slate-500" : "text-slate-900")}>UID {account.gameUid}</span>
                                {empty && <span className="mt-1 block text-xs font-medium text-slate-400">{t("empty")}</span>}
                              </span>
                              {selected && <BadgeCheck className="h-5 w-5 shrink-0 text-sky-500" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-400">{t("empty")}</div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-700">{t("degreesLabel")}</h3>
                    {loadingCatalog ? (
                      <div className="flex min-h-32 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{t("loading")}</div>
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
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-400">{catalogError ? t("resourceUnavailable") : t("empty")}</div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm font-semibold text-rose-600">
                  <span>{message || t("loadFailed")}</span>
                  <button type="button" onClick={() => void loadOptions()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 transition hover:border-slate-300">{t("retry")}</button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-h-5 text-sm font-semibold text-rose-600">{options ? message : ""}</div>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300">{t("cancel")}</button>
                </Dialog.Close>
                <button type="button" disabled={saving || !hasChanges} onClick={saveDegree} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
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

"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Heading from "@/components/Heading";
import LoadingIndicator from "@/components/LoadingIndicator";
import { BANDORI_SERVER_CODES } from "@/lib/bandori-server";
import { formatLocalizedDateTime } from "@/lib/localized-format";
import { normalizeLocale } from "@/i18n/routing";
import {
  parseServiceStatusResponse,
  SERVICE_STATUS_SERVICES,
  type ServiceStatusSnapshot,
} from "@/lib/service-status";

export default function ServiceStatusPanel() {
  const t = useTranslations("serviceStatus");
  const locale = normalizeLocale(useLocale());
  const [snapshot, setSnapshot] = useState<ServiceStatusSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const commonT = useTranslations("common");

  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;

    async function refresh() {
      if (request) return;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("/api/status", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Service status unavailable");
        const next = parseServiceStatusResponse(await response.json());
        if (active) {
          setSnapshot(next);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
        request = null;
      }
    }

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      request?.abort();
    };
  }, [retry]);

  const checkedAt = snapshot?.meta.checkedAt;

  return (
    <section className="hhwx-panel border px-4 py-5 sm:p-6" aria-labelledby="service-status-title">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <Heading as="h1" visualRole="page" id="service-status-title">{t("title")}</Heading>
        <p role="status" className={`text-sm leading-6 ${failed
          ? "text-[var(--theme-color-semantic-danger-foreground)]"
          : "text-[var(--theme-color-text-muted)]"}`}>
          {!snapshot ? failed ? t("updateFailed") : null : (
            <>
              {t("lastUpdated")}{" "}
              {checkedAt ? (
                <time dateTime={checkedAt}>{formatLocalizedDateTime(checkedAt, locale, "")}</time>
              ) : t("pending")}
              {failed && <> · {t("updateFailed")}</>}
            </>
          )}
        </p>
        {failed ? <button type="button" className="hhwx-control rounded-lg border px-3 py-1 text-sm" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>{commonT("actions.retry")}</button> : null}
      </header>

      <section className="mt-5" aria-labelledby="backend-status-title">
        <Heading as="h2" visualRole="section" id="backend-status-title" className="mb-4 break-words">
          hhwx-bandori-backend
        </Heading>
        <div className="relative">
          {!snapshot && !failed ? <LoadingIndicator label={t("loading")} className="absolute inset-0 z-10 bg-[var(--theme-color-panel-background)]" /> : null}
          <div aria-hidden={!snapshot && !failed ? true : undefined}>
        <div aria-hidden="true" className="hidden grid-cols-[10rem_repeat(4,minmax(0,1fr))] gap-4 border-b border-[var(--theme-color-border-subtle)] pb-3 text-sm font-semibold text-[var(--theme-color-text-muted)] md:grid">
          <span>{t("service")}</span>
          {BANDORI_SERVER_CODES.map((server) => <span key={server}>{server.toUpperCase()}</span>)}
        </div>
        {SERVICE_STATUS_SERVICES.map((service) => (
          <section key={service} aria-labelledby={`service-${service}`} className="grid gap-3 border-b border-[var(--theme-color-border-subtle)] py-5 first-of-type:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-4 md:py-6 md:first-of-type:pt-6">
            <h3 id={`service-${service}`} className="text-base font-semibold">{t(`services.${service}`)}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
              {BANDORI_SERVER_CODES.map((server) => {
                const entry = snapshot?.data.hhwxBandoriBackend[service][server];
                const status = entry?.status ?? "pending";
                const label = status === "error" && entry?.reasonCode === "update_required" ? "updateRequired" : status;
                const color = status === "operational"
                  ? "text-[var(--theme-color-semantic-success-foreground)]"
                  : status === "error"
                    ? "text-[var(--theme-color-semantic-danger-foreground)]"
                    : "text-[var(--theme-color-semantic-neutral-foreground)]";
                return (
                  <div key={server}>
                    <dt className="mb-1 text-xs font-semibold text-[var(--theme-color-text-muted)] md:sr-only">{server.toUpperCase()}</dt>
                    <dd className={`flex items-baseline gap-2 text-sm leading-6 ${color}`}>
                      {!snapshot ? (
                        <span aria-label={failed ? t("updateFailed") : undefined}>—</span>
                      ) : (
                        <><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current" /><span>{t(`states.${label}`)}</span></>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
          </div>
        </div>
      </section>
    </section>
  );
}

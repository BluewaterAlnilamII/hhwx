"use client";

import { useTranslations } from "next-intl";
import PageShell from "@/components/PageShell";

export default function CardsError({ reset }: { reset: () => void }) {
  const t = useTranslations("ournotes.cards");
  return <PageShell contentClassName="max-w-6xl"><div role="alert" className="hhwx-panel flex flex-wrap items-center justify-center gap-3 border p-8 text-sm">
    {t("states.loadFailed")}<button type="button" className="hhwx-control rounded-xl border px-4 py-2 font-semibold" onClick={reset}>{t("actions.retry")}</button>
  </div></PageShell>;
}

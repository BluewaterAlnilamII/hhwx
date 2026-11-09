"use client";
import RetryButton from "@/components/RetryButton";

import { useTranslations } from "next-intl";
import PageShell from "@/components/PageShell";

export default function SongsError({ reset }: { reset: () => void }) {
  const t = useTranslations("ournotes.songs");
  return <PageShell contentClassName="max-w-6xl"><div role="alert" className="hhwx-panel flex flex-wrap items-center justify-center gap-3 border p-8 text-sm">
    {t("states.loadFailed")}<RetryButton onClick={reset} />
  </div></PageShell>;
}

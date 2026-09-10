import { useTranslations } from "next-intl";
import LoadingIndicator from "@/components/LoadingIndicator";
import BandoriPageShell from "./BandoriPageShell";

export default function BandoriLoading() {
  const t = useTranslations("common");
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-96 border p-4 sm:p-6" />
    </BandoriPageShell>
  );
}

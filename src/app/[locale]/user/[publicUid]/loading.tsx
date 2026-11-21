import { useTranslations } from "next-intl";
import LoadingIndicator from "@/components/LoadingIndicator";

export default function PublicProfileLoading() {
  const t = useTranslations("common");
  return (
    <main className="flex min-h-full items-center py-4 sm:py-10">
      <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-72 w-full border-y px-4 py-6 sm:border sm:p-8" />
    </main>
  );
}

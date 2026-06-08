import type { MetadataRoute } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { buildLocalizedPathname, routing, type AppLocale } from "@/i18n/routing";

type ManifestProps = {
  params: Promise<{ locale: string }>;
};

export default async function manifest({ params }: ManifestProps): Promise<MetadataRoute.Manifest> {
  const { locale: rawLocale } = await params;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "metadata.manifest" });

  return {
    name: t("name"),
    short_name: t("shortName"),
    description: t("description"),
    start_url: buildLocalizedPathname("/", locale as AppLocale),
    display: "standalone",
    background_color: "#FFEE22",
    theme_color: "#FFEE22",
    icons: [
      {
        src: "/favicon/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

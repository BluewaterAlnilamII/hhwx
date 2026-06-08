import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { buildLocalizedPathname, routing, type AppLocale } from "@/i18n/routing";

const MANIFEST_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

type ManifestRouteContext = {
  params: Promise<{ locale: string }>;
};

export async function GET(_request: NextRequest, { params }: ManifestRouteContext) {
  const { locale: rawLocale } = await params;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "metadata.manifest" });

  return NextResponse.json({
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
  }, {
    headers: {
      "Cache-Control": MANIFEST_CACHE_CONTROL,
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}

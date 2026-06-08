import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import "../globals.css";
import AppChrome from "@/components/AppChrome";
import { buildLocalizedPathname, routing, type AppLocale } from "@/i18n/routing";

// Next segment config must stay statically analyzable; do not replace this literal with an imported constant.
export const revalidate = 900;

type LocaleLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "metadata.root" });
  const manifestPath = buildLocalizedPathname("/manifest.webmanifest", locale as AppLocale);

  return {
    title: t("title"),
    applicationName: t("applicationName"),
    description: t("description"),
    manifest: manifestPath,
    icons: {
      icon: [
        { url: "/favicon/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/favicon/icon-512.png", sizes: "512x512", type: "image/png" },
        { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      ],
      shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen min-h-svh overflow-x-hidden text-slate-900">
        <NextIntlClientProvider messages={messages}>
          <AppChrome>{children}</AppChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { MESSAGE_NAMESPACES } from "@/i18n/message-namespaces";
import { routing, type AppLocale } from "@/i18n/routing";

async function loadNamespaceMessages(locale: AppLocale) {
  const entries = await Promise.all(
    MESSAGE_NAMESPACES.map(async (namespace) => {
      const messages = (await import(`../../messages/${locale}/${namespace}.json`)).default;
      return [namespace, messages] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadNamespaceMessages(locale),
  };
});

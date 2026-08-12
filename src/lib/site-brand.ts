export const SITE_BRAND = "HHWX";

export function formatSiteDocumentTitle(pageTitle: string): string {
  const normalizedTitle = pageTitle.trim();
  return normalizedTitle && normalizedTitle !== SITE_BRAND
    ? `${normalizedTitle} - ${SITE_BRAND}`
    : SITE_BRAND;
}

export function buildSiteMetadataTitle(pageTitle: string): { absolute: string } {
  return { absolute: formatSiteDocumentTitle(pageTitle) };
}

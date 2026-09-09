import Heading from "@/components/Heading";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
import { normalizePublicUid, readPublicProfile } from "@/lib/public-profile-server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type PublicProfilePageProps = {
  params: Promise<{ locale: string; publicUid: string }>;
};

function formatJoinedAt(value: string | null, locale: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { locale, publicUid: rawPublicUid } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.publicProfile" });
  const publicUid = normalizePublicUid(rawPublicUid);
  if (!publicUid) {
    return { title: buildSiteMetadataTitle(t("missingTitle")) };
  }

  const profile = await readPublicProfile(publicUid);
  if (!profile) {
    return { title: buildSiteMetadataTitle(t("missingTitle")) };
  }

  return {
    title: buildSiteMetadataTitle(t("title", { username: profile.username })),
    description: t("description", { publicUid: profile.publicUid }),
  };
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { locale, publicUid: rawPublicUid } = await params;
  const t = await getTranslations({ locale, namespace: "account.publicProfile" });
  const commonT = await getTranslations({ locale, namespace: "common" });
  const publicUid = normalizePublicUid(rawPublicUid);
  if (!publicUid) {
    notFound();
  }

  const profile = await readPublicProfile(publicUid);
  if (!profile) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl items-center px-0 py-4 sm:px-6 sm:py-10 lg:px-8">
      <section className="hhwx-panel w-full overflow-hidden border-y px-4 py-6 sm:border sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold shadow-lg sm:h-20 sm:w-20 sm:text-3xl bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)]">
              {getUsernameAvatarLabel(profile.username)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--theme-color-action-secondary-foreground)]">{t("eyebrow")}</p>
              <Heading as="h1" visualRole="page" className="mt-2 wrap-break-word">{profile.username}</Heading>
              <p className="mt-2 text-sm font-semibold text-[var(--theme-color-text-muted)]">UID {profile.publicUid}</p>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-5 py-2 text-sm font-semibold text-[var(--theme-color-text-default)] transition hover:border-[var(--theme-color-action-secondary-border)] hover:text-[var(--theme-color-action-secondary-foreground)] sm:w-auto"
          >
            {t("backHome")}
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-color-text-muted)]">UID</p>
            <p className="mt-2 text-lg font-bold text-[var(--theme-color-text-default)]">{profile.publicUid}</p>
          </div>
          <div className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-color-text-muted)]">{t("joinedAt")}</p>
            <p className="mt-2 text-lg font-bold text-[var(--theme-color-text-default)]">
              {formatJoinedAt(profile.createdAt, locale, commonT("states.unknown"))}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

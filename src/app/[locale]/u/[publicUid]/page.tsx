import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
import { normalizePublicUid, readPublicProfile } from "@/lib/public-profile-server";

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
    return { title: t("missingTitle") };
  }

  const profile = await readPublicProfile(publicUid);
  if (!profile) {
    return { title: t("missingTitle") };
  }

  return {
    title: t("title", { username: profile.username }),
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
      <section className="w-full overflow-hidden border-y border-white/55 bg-white/90 px-4 py-6 shadow-[0_12px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:rounded-[32px] sm:border sm:bg-white/80 sm:p-8 sm:shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-2xl font-bold text-white shadow-lg sm:h-20 sm:w-20 sm:text-3xl">
              {getUsernameAvatarLabel(profile.username)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-500">{t("eyebrow")}</p>
              <h1 className="mt-2 break-words text-2xl font-bold text-slate-900 sm:text-4xl">{profile.username}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">UID {profile.publicUid}</p>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600 sm:w-auto"
          >
            {t("backHome")}
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">UID</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{profile.publicUid}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t("joinedAt")}</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {formatJoinedAt(profile.createdAt, locale, commonT("states.unknown"))}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

import PublicProfileView from "@/components/account/PublicProfileView";
import { cache } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { normalizePublicUid, readPublicProfile } from "@/lib/public-profile-server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

const getPublicProfile = cache(readPublicProfile);

type PublicProfilePageProps = {
  params: Promise<{ locale: string; publicUid: string }>;
};

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { locale, publicUid: rawPublicUid } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.publicProfile" });
  const publicUid = normalizePublicUid(rawPublicUid);
  if (!publicUid) {
    return { title: buildSiteMetadataTitle(t("missingTitle")) };
  }

  const profile = await getPublicProfile(publicUid);
  if (!profile) {
    return { title: buildSiteMetadataTitle(t("missingTitle")) };
  }

  return {
    title: buildSiteMetadataTitle(t("title", { username: profile.username })),
    description: t("description", { publicUid: profile.publicUid }),
  };
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { publicUid: rawPublicUid } = await params;
  const publicUid = normalizePublicUid(rawPublicUid);
  if (!publicUid || !await getPublicProfile(publicUid)) notFound();
  return <PublicProfileView publicUid={publicUid} />;
}

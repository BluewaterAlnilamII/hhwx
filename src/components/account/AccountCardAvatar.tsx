"use client";

import { BandoriCardArtImage } from "@/components/bandori/BandoriCardArtImage";
import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import LoadingPlaceholder from "@/components/LoadingPlaceholder";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { type AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { type BandoriServer } from "@/lib/bandori-server";
import { pickGameProfileCardName } from "@/lib/bandori/cards/game-profile-card";
import { cn } from "@/lib/utils";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";

type AccountCardAvatarSize = "toolbar" | "comment" | "default" | "large";

const SIZE_CLASS_NAMES: Record<AccountCardAvatarSize, string> = {
  toolbar: "h-7 w-7 text-[11px]",
  comment: "h-11 w-11 text-sm",
  default: "h-14 w-14 text-xl",
  large: "h-20 w-20 text-2xl",
};

export type AccountCardAvatarProps = {
  username: string | null | undefined;
  cardId?: number | null;
  entityServer?: BandoriServer | null;
  trainType?: AccountAvatarCardTrainType | null;
  resourceSetName?: string | null;
  displayName?: string | null;
  size?: AccountCardAvatarSize;
  className?: string;
  pending?: boolean;
};

export default function AccountCardAvatar({
  username,
  cardId,
  entityServer = null,
  trainType = "normal",
  resourceSetName,
  displayName,
  size = "default",
  className,
  pending = false,
}: AccountCardAvatarProps) {
  const t = useTranslations("bandori.cards.common");
  const commonT = useTranslations("common");
  const preferredServer = useBandoriPreferredServer();
  const { data: cards, loading } = useBandoriCardsMaster(
    entityServer ?? undefined,
    Boolean(!pending && cardId && !resourceSetName),
  );
  const cardMetadata = cardId ? cards?.[String(cardId)] : null;
  const resolvedResourceSetName = resourceSetName ?? cardMetadata?.resourceSetName;
  const resolvedDisplayName = displayName ?? (
    cardId
      ? pickGameProfileCardName(cardId, cardMetadata ?? undefined, preferredServer)
      : null
  );
  const hasCardAvatar = Boolean(cardId && resolvedResourceSetName);
  const fallback = <UserRound className="h-1/2 w-1/2" aria-hidden="true" />;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-xs ring-2 ring-[var(--theme-color-border-subtle)]",
        SIZE_CLASS_NAMES[size],
        className,
      )}
    >
      {pending || (!hasCardAvatar && loading) ? (
        <LoadingPlaceholder label={t("imageLoading")} className="h-full w-full rounded-full" />
      ) : hasCardAvatar && cardId && resolvedResourceSetName ? (
        <BandoriCardArtImage
          cardId={cardId}
          resourceSetName={resolvedResourceSetName}
          trainType={trainType ?? "normal"}
          alt={resolvedDisplayName ?? username ?? "avatar"}
          className="rounded-full"
          loading={size === "toolbar" || size === "large" ? "eager" : "lazy"}
          fallback={fallback}
        />
      ) : (
        <div role="img" aria-label={commonT("states.imageUnavailable")} className="flex h-full w-full items-center justify-center">
          {fallback}
        </div>
      )}
    </div>
  );
}

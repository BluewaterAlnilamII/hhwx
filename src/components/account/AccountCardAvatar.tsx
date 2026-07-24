"use client";

import { BandoriCardArtImage } from "@/components/bandori/card-picker";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { type AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { type BandoriServer } from "@/lib/bandori-server";
import { pickGameProfileCardName } from "@/lib/bandori-game-profile-card";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
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
}: AccountCardAvatarProps) {
  const preferredServer = useBandoriPreferredServer();
  const { data: cards } = useBandoriCardsMaster(
    entityServer ?? undefined,
    Boolean(cardId && !resourceSetName),
  );
  const cardMetadata = cardId ? cards?.[String(cardId)] : null;
  const resolvedResourceSetName = resourceSetName ?? cardMetadata?.resourceSetName;
  const resolvedDisplayName = displayName ?? (
    cardId
      ? pickGameProfileCardName(cardId, cardMetadata ?? undefined, preferredServer)
      : null
  );
  const hasCardAvatar = Boolean(cardId && resolvedResourceSetName);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-sm ring-2 ring-white/35",
        SIZE_CLASS_NAMES[size],
        className,
      )}
    >
      {hasCardAvatar && cardId && resolvedResourceSetName ? (
        <BandoriCardArtImage
          cardId={cardId}
          resourceSetName={resolvedResourceSetName}
          trainType={trainType ?? "normal"}
          alt={resolvedDisplayName ?? username ?? "avatar"}
          className="rounded-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-bold">
          {getUsernameAvatarLabel(username, "?")}
        </div>
      )}
    </div>
  );
}

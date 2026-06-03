"use client";

import { BandoriCardArtImage } from "@/components/bandori/card-picker";
import { type AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
import { cn } from "@/lib/utils";

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
  trainType?: AccountAvatarCardTrainType | null;
  resourceSetName?: string | null;
  assetRegion?: BandoriAssetRegion | null;
  displayName?: string | null;
  size?: AccountCardAvatarSize;
  className?: string;
};

export default function AccountCardAvatar({
  username,
  cardId,
  trainType = "normal",
  resourceSetName,
  assetRegion,
  displayName,
  size = "default",
  className,
}: AccountCardAvatarProps) {
  const hasCardAvatar = Boolean(cardId && resourceSetName);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-sm ring-2 ring-white/35",
        SIZE_CLASS_NAMES[size],
        className,
      )}
    >
      {hasCardAvatar && cardId && resourceSetName ? (
        <BandoriCardArtImage
          cardId={cardId}
          resourceSetName={resourceSetName}
          trainType={trainType ?? "normal"}
          region={assetRegion ?? "cn"}
          alt={displayName ?? username ?? "avatar"}
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

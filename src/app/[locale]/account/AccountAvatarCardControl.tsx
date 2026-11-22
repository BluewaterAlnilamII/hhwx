"use client";

import { confirmTouchOnSuccess } from "@/lib/touch-feedback";
import { type ReactElement, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { Image as ImageIcon, Save } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { BandoriCardPickerDialogContent } from "@/components/bandori/card-picker/BandoriCardPickerDialog";
import ActionFeedback from "@/components/ActionFeedback";
import { type BandoriCardPickerValue } from "@/components/bandori/card-picker/types";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { parseApiSuccessData } from "@/lib/api-contracts";
import { pickGameProfileCardName } from "@/lib/bandori/cards/game-profile-card";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";
import {
  DEFAULT_ACCOUNT_AVATAR_CARD_ID,
  DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
} from "@/lib/account-avatar-defaults";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import type { AccountAvatarFields, AccountProfile } from "@/lib/account-profile-store";
import { getSafeSession } from "@/lib/supabase";

function profileToPickerValue(profile: AccountProfile): BandoriCardPickerValue | null {
  return {
    cardId: profile.avatarCardId,
    entityServer: profile.avatarCardServer,
    trainType: profile.avatarCardTrainType,
  };
}

export default function AccountAvatarCardControl({
  profile,
  onProfileChange,
  trigger,
  size = "default",
}: {
  trigger?: ReactElement;
  profile: AccountProfile;
  onProfileChange: (fields: AccountAvatarFields) => void;
  size?: "default" | "large";
}) {
  const t = useTranslations("account.avatar");
  const errorT = useTranslations("errors");
  const preferredServer = useBandoriPreferredServer();
  useBandoriCardsAssetIndex();
  const { data: cardMetadata } = useBandoriCardsMaster(profile.avatarCardServer ?? undefined);
  const selectedCardMetadata = cardMetadata?.[String(profile.avatarCardId)];
  const selectedCardDisplayName = pickGameProfileCardName(
    profile.avatarCardId,
    selectedCardMetadata ?? undefined,
    preferredServer,
  );
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState<BandoriCardPickerValue | null>(() => profileToPickerValue(profile));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dialogSession = useRef(0);

  const handleOpenChange = (nextOpen: boolean) => {
    dialogSession.current += 1;
    if (nextOpen) {
      setDraftValue(profileToPickerValue(profile));
      setMessage("");
    }
    setOpen(nextOpen);
  };

  const hasChanges = useMemo(() => {
    const current = profileToPickerValue(profile);
    return current?.cardId !== draftValue?.cardId
      || current?.entityServer !== draftValue?.entityServer
      || current?.trainType !== draftValue?.trainType;
  }, [draftValue, profile]);

  const saveAvatar = async () => {
    const confirm = confirmTouchOnSuccess();
    const sessionId = dialogSession.current;
    const isCurrent = () => sessionId === dialogSession.current;
    setSaving(true);
    setMessage("");

    try {
      const session = await getSafeSession();
      const accessToken = session?.user.id === profile.userId ? session.access_token : null;
      if (!accessToken) {
        if (isCurrent()) setMessage(t("notSignedIn"));
        return;
      }

      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          avatarCardId: draftValue?.cardId ?? DEFAULT_ACCOUNT_AVATAR_CARD_ID,
          avatarCardServer: draftValue?.entityServer ?? null,
          avatarCardTrainType: draftValue?.trainType ?? DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (isCurrent()) setMessage(getLocalizedApiErrorMessage(payload, errorT) || t("saveFailed"));
        return;
      }

      const updatedProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!updatedProfile || updatedProfile.userId !== profile.userId) {
        if (isCurrent()) setMessage(t("invalidResponse"));
        return;
      }

      const { avatarCardId, avatarCardServer, avatarCardTrainType } = updatedProfile;
      onProfileChange({ avatarCardId, avatarCardServer, avatarCardTrainType });
      if (isCurrent()) { confirm(); handleOpenChange(false); }
    } catch {
      if (isCurrent()) setMessage(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        {trigger ?? <button
          type="button"
          data-testid="account-avatar-card-trigger"
          className="group relative rounded-full outline-hidden transition focus-visible:ring-4 focus-visible:ring-white/40"
          title={t("chooseTitle")}
        >
          <AccountCardAvatar
            username={profile.username}
            cardId={profile.avatarCardId}
            entityServer={profile.avatarCardServer}
            trainType={profile.avatarCardTrainType}
            resourceSetName={selectedCardMetadata?.resourceSetName}
            displayName={selectedCardDisplayName}
            size={size}
          />
          <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-action-secondary-foreground)] shadow-xs transition group-hover:scale-105">
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>}
      </Dialog.Trigger>

      <BandoriCardPickerDialogContent testId="account-avatar-card-dialog" title={t("dialogTitle")} closeLabel={t("close")}
        value={draftValue} onValueChange={setDraftValue}
        footer={<div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraftValue({
              cardId: DEFAULT_ACCOUNT_AVATAR_CARD_ID,
              entityServer: null,
              trainType: DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
            })}
            className="hhwx-control inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition"
          >
            {t("useDefault")}
          </button>
          <Dialog.Close asChild>
            <button type="button" className="hhwx-control inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition">
              {t("cancel")}
            </button>
          </Dialog.Close>
          <div className="relative">
            <ActionFeedback feedback={message ? { type: "error", message } : null} className="bottom-full right-0 mb-2" />
            <button
              type="button"
              disabled={saving || !hasChanges}
              onClick={saveAvatar}
              className="hhwx-action-accent inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition"
            >
              {saving ? <LoadingSpinner className="text-current" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {t("save")}
            </button>
          </div>
        </div>} />
    </Dialog.Root>
  );
}

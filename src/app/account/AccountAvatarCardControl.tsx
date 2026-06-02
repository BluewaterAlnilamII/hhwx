"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Loader2, Save, X } from "lucide-react";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { BandoriCardPicker, type BandoriCardPickerValue } from "@/components/bandori/card-picker";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  DEFAULT_ACCOUNT_AVATAR_CARD_ID,
  DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
} from "@/lib/account-avatar-defaults";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { type AccountProfile, getAccessToken } from "./useAccountProfile";

type CardMetadataResponse = {
  cards?: Record<string, {
    displayName?: string | null;
    resourceSetName?: string;
    assetRegion?: BandoriAssetRegion;
  }>;
};

function transformCardMetadata(raw: unknown): CardMetadataResponse {
  return parseApiSuccessData<CardMetadataResponse>(raw) ?? {};
}

function profileToPickerValue(profile: AccountProfile): BandoriCardPickerValue | null {
  return {
    cardId: profile.avatarCardId,
    trainType: profile.avatarCardTrainType,
  };
}

export default function AccountAvatarCardControl({
  profile,
  onProfileChange,
  size = "default",
}: {
  profile: AccountProfile;
  onProfileChange: (profile: AccountProfile) => void;
  size?: "default" | "large";
}) {
  const cardMetadataUrl = `/api/bandori/cards?ids=${profile.avatarCardId}`;
  const { data: cardMetadata } = useCachedFetch(
    `account-avatar-card-v2-${profile.avatarCardId}`,
    cardMetadataUrl,
    transformCardMetadata,
    { staleTimeMs: 86400000 },
  );
  const selectedCardMetadata = cardMetadata?.cards?.[String(profile.avatarCardId)];
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState<BandoriCardPickerValue | null>(() => profileToPickerValue(profile));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setDraftValue(profileToPickerValue(profile));
      setMessage("");
    }
  }, [open, profile]);

  const hasChanges = useMemo(() => {
    const current = profileToPickerValue(profile);
    return current?.cardId !== draftValue?.cardId || current?.trainType !== draftValue?.trainType;
  }, [draftValue, profile]);

  const saveAvatar = async () => {
    setSaving(true);
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setMessage("请先登录");
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
          avatarCardTrainType: draftValue?.trainType ?? DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(getApiErrorMessage(payload) || `保存失败：HTTP ${response.status}`);
        return;
      }

      const updatedProfile = parseApiSuccessData<AccountProfile>(payload);
      if (!updatedProfile) {
        setMessage("账号资料返回格式无效");
        return;
      }

      onProfileChange(updatedProfile);
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="account-avatar-card-trigger"
        onClick={() => setOpen(true)}
        className="group relative rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-white/40"
        title="选择头像"
      >
        <AccountCardAvatar
          username={profile.username}
          cardId={profile.avatarCardId}
          trainType={profile.avatarCardTrainType}
          resourceSetName={selectedCardMetadata?.resourceSetName}
          displayName={selectedCardMetadata?.displayName}
          assetRegion={selectedCardMetadata?.assetRegion}
          size={size}
        />
        <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-white text-sky-700 shadow-sm transition group-hover:scale-105">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <div data-testid="account-avatar-card-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">选择头像卡面</h2>
                <p className="mt-1 text-sm text-slate-500">默认使用特训后卡面，可在选择后切换卡面版本。</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                title="关闭"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              <BandoriCardPicker value={draftValue} onValueChange={setDraftValue} />
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-h-5 text-sm font-semibold text-rose-600">
                {message}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraftValue({
                    cardId: DEFAULT_ACCOUNT_AVATAR_CARD_ID,
                    trainType: DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
                  })}
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                >
                  使用默认头像
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={saving || !hasChanges}
                  onClick={saveAvatar}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  保存头像
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

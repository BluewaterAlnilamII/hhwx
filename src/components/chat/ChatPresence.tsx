"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { CommentPublicUid } from "@/components/comments/CommentPublicUid";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import { resolveStoredAccountAvatarCardIdentity } from "@/lib/account-avatar-card";
import type { ChatMentionUser } from "@/lib/chat/chat-contract";
import { cn } from "@/lib/utils";

export function ChatPresenceIndicator({ online, size = "sm" }: { online: boolean | null; size?: "sm" | "md" }) {
  const t = useTranslations("chat");
  if (online === null) return null;
  // Align the colored dot with the avatar's outer ring, accounting for both 2px borders.
  return <span role="img" title={t(online ? "online" : "offline")} aria-label={t(online ? "online" : "offline")}
    className={cn("absolute -bottom-1 -right-1 rounded-full border-2 border-[var(--theme-color-panel-background)]",
      size === "md" ? "size-3.5" : "size-3",
      online ? "bg-[var(--theme-color-semantic-success-foreground)]" : "bg-[var(--theme-color-text-muted)]")} />;
}

export function ChatPresence({ users, failed, onRefresh }: { users: ChatMentionUser[] | null; failed: boolean; onRefresh(): void }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>
      <button type="button" data-chat-presence-trigger title={t("onlineMembers")}
        className="hhwx-control flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs">
        <Users size={15} aria-hidden="true" />{users ? t("onlineCount", { count: users.length }) : t("onlineUnknown")}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-1020 bg-[var(--theme-color-overlay-background)]" />
      <Dialog.Content data-chat-popover data-chat-members aria-describedby={undefined} className="hhwx-floating-surface fixed left-1/2 top-1/2 z-1020 flex max-h-[min(32rem,80dvh)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-[var(--theme-color-border-subtle)] p-4 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <Dialog.Title className="text-base font-semibold">{t("onlineMembers")}</Dialog.Title>
          <Dialog.Close className="chat-icon-button" aria-label={t("closeMembers")}><X size={20} aria-hidden="true" /></Dialog.Close>
        </div>
        {users ? <ul className="min-h-0 overflow-y-auto overscroll-contain">
          {users.map(user => {
            const avatar = resolveStoredAccountAvatarCardIdentity(user.avatarCardId, user.avatarCardServer);
            return <li key={user.userId} className="flex min-h-12 items-center gap-3 px-1 py-2">
              <span className="relative shrink-0"><AccountCardAvatar username={user.username} cardId={avatar.cardId} entityServer={avatar.entityServer} trainType={user.avatarCardTrainType} size="toolbar" /><ChatPresenceIndicator online /></span>
              <span className="min-w-0 truncate text-sm font-semibold">{user.username}</span>
              <CommentPublicUid publicUid={user.publicUid} />
            </li>;
          })}
          {!users.length && <li className="py-5 text-center text-sm text-[var(--theme-color-text-muted)]">{t("onlineEmpty")}</li>}
        </ul> : <div role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm text-[var(--theme-color-text-muted)]">
          {failed ? <button type="button" className="hhwx-control rounded-lg px-3 py-2" onClick={onRefresh}>{t("presenceFailed")}</button> : <><LoadingSpinner />{t("loading")}</>}
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

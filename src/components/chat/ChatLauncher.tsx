"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { resumeSoundEffectAudio } from "@/lib/sound-effect-audio";
import { toolbarIconButtonClassName, toolbarIconInnerClassName } from "@/components/toolbar/toolbar-styles";

import { useChatSession } from "@/hooks/useChatSession";

const ChatDialog = dynamic(() => import("./ChatDialog"), { ssr: false });

export default function ChatLauncher({ onOpen, userId }: { onOpen(): void; userId: string }) {
  const t = useTranslations("chat");
  const [opened, setOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const chat = useChatSession(userId, open);
  return <>
    <button ref={trigger} type="button" aria-label={chat.state.unread ? `${t("title")} — ${t("newMessages")}` : t("title")} aria-expanded={open} title={t("title")} aria-haspopup="dialog"
      className={`${toolbarIconButtonClassName} relative`} onClick={() => {
        void resumeSoundEffectAudio().catch(() => {});
        onOpen(); setOpened(true); setOpen(true);
      }}>
      <span className={toolbarIconInnerClassName}><MessageCircle className="h-4 w-4" aria-hidden="true" /></span>
      {chat.state.unread && <span data-chat-unread aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--theme-color-notification-badge-background)] ring-2 ring-[var(--theme-color-notification-badge-ring)]" />}
    </button>
    {opened && <ChatDialog open={open} onOpenChange={setOpen} trigger={trigger} userId={userId} {...chat} />}
  </>;
}

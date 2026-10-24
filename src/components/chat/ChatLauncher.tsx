"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { resumeSoundEffectAudio } from "@/lib/sound-effect-audio";
import { toolbarIconButtonClassName, toolbarIconInnerClassName } from "@/components/toolbar/toolbar-styles";

const ChatDialog = dynamic(() => import("./ChatDialog"), { ssr: false });

export default function ChatLauncher({ onOpen }: { onOpen(): void }) {
  const t = useTranslations("chat");
  const [opened, setOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" aria-label={t("title")} title={t("title")} aria-haspopup="dialog"
      className={toolbarIconButtonClassName} onClick={() => {
        void resumeSoundEffectAudio().catch(() => {});
        onOpen(); setOpened(true); setOpen(true);
      }}>
      <span className={toolbarIconInnerClassName}><MessageCircle className="h-4 w-4" aria-hidden="true" /></span>
    </button>
    {opened && <ChatDialog open={open} onOpenChange={setOpen} trigger={trigger} />}
  </>;
}

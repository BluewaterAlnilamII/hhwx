"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChatImageType } from "@/lib/chat/chat-image-contract";
import { saveChatImage } from "@/lib/chat/chat-image-download";

export function ChatSaveImageMenuItem({ source, contentType, className }: {
  source: string; contentType: ChatImageType; className: string;
}) {
  const t = useTranslations("chat");
  return <ContextMenu.Item className={className} onSelect={() => {
    void saveChatImage(source, contentType).catch(() => console.warn("Could not start chat image download"));
  }}><Download size={16} aria-hidden="true" />{t("saveImage")}</ContextMenu.Item>;
}

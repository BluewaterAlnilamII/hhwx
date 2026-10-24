"use client";

import { useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import { copyChatImage } from "@/lib/chat/chat-clipboard";

export function ChatCopyMenuItem({ content, imageSource, className, onCopied }: {
  content: string; imageSource?: string; className: string; onCopied(): void;
}) {
  const t = useTranslations("chat");
  const [state, setState] = useState<"idle" | "copying" | "failed">("idle");
  return <ContextMenu.Item className={className} disabled={state === "copying"} aria-live="polite" onSelect={(event) => {
    event.preventDefault();
    setState("copying");
    void (async () => {
      try {
        if (imageSource) await copyChatImage(imageSource);
        else await navigator.clipboard.writeText(content);
        onCopied();
      } catch { setState("failed"); }
    })();
  }}>
    {state === "copying" ? <LoadingSpinner className="size-4" /> : <Copy size={16} aria-hidden="true" />}
    {t(state === "failed" ? "copyFailed" : state === "copying" ? "copying" : "copy")}
  </ContextMenu.Item>;
}

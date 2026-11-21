"use client";

import { Repeat, Repeat1 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";
import { MUSIC_PLAYER_TRANSPORT_BUTTON_CLASS_NAME } from "./transport-control-styles";

const repeatLabels = { off: "repeatOff", all: "repeatAll", one: "repeatOne" } as const;

export default function MusicPlayerRepeatButton() {
  const t = useTranslations("navigation.toolbar.player");
  const repeatMode = useMusicPlayerStore(state => state.repeatMode);
  const cycleRepeatMode = useMusicPlayerStore(state => state.cycleRepeatMode);
  const label = t(repeatLabels[repeatMode]);

  return <button type="button" onClick={cycleRepeatMode} title={label} aria-label={label}
    aria-pressed={repeatMode !== "off"} data-repeat-mode={repeatMode}
    className={`relative ${MUSIC_PLAYER_TRANSPORT_BUTTON_CLASS_NAME} aria-pressed:bg-[var(--theme-color-control-background-pressed)] aria-pressed:text-[var(--theme-color-selection-subtle-foreground)]`}>
    {repeatMode === "one" ? <Repeat1 className="h-4 w-4" aria-hidden="true" /> : <Repeat className="h-4 w-4" aria-hidden="true" />}
    {repeatMode !== "off" && <span aria-hidden="true" className="pointer-events-none absolute top-[calc(50%+10px)] left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" />}
  </button>;
}

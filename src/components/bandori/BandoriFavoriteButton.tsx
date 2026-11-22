"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import useBandoriFavoriteAction from "@/hooks/useBandoriFavoriteAction";
import { favoriteKey } from "@/lib/bandori/favorites";
import type { ProfileModuleId } from "@/lib/profile-homepage";
import type { BandoriServer } from "@/lib/bandori-server";
import ActionFeedback from "@/components/ActionFeedback";
import { getTooltipPosition } from "@/lib/tooltip-position";
import styles from "./FavoriteButton.module.css";

function alignFeedback(badge: HTMLDivElement | null) {
  const anchor = badge?.previousElementSibling;
  if (!badge || !(anchor instanceof HTMLElement)) return;
  // Table scrollports and card previews can clip an ordinary positioned badge.
  badge.popover = "manual";
  badge.showPopover();
  const update = () => {
    const rect = anchor.getBoundingClientRect();
    const { width, height } = badge.getBoundingClientRect();
    const { left, top } = getTooltipPosition({
      anchorRect: rect, tooltipWidth: width, tooltipHeight: height,
      viewportWidth: document.documentElement.clientWidth, viewportHeight: window.innerHeight,
    });
    badge.style.left = `${left}px`;
    badge.style.top = `${top}px`;
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(badge);
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, true);
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", update);
    window.removeEventListener("scroll", update, true);
  };
}

export default function BandoriFavoriteButton({ kind, id, server, detail = false, compact = false, overlayClassName }: {
  kind: ProfileModuleId; id: number | string; server?: BandoriServer | null; detail?: boolean; compact?: boolean; overlayClassName?: string;
}) {
  const target = favoriteKey(kind, id, server);
  return <FavoriteControl key={target} target={target} detail={detail} compact={compact} overlayClassName={overlayClassName} />;
}

function FavoriteControl({ target, detail, compact, overlayClassName }: { target: string; detail: boolean; compact: boolean; overlayClassName?: string }) {
  const { selected, label, pending, activate, feedback } = useBandoriFavoriteAction(target);
  const [added, setAdded] = useState(false);
  const star = <Star size={overlayClassName ? 16 : 22} className={selected ? "hhwx-saved-star" : undefined} aria-hidden="true" onAnimationEnd={() => setAdded(false)} />;
  return <span className={overlayClassName ?? styles.control}>
    <button type="button" className={overlayClassName ? "hhwx-favorite-motion" : `${styles.star} hhwx-favorite-motion`} data-detail={detail} data-compact={compact || undefined} aria-pressed={selected}
      title={label} aria-label={label}
      aria-disabled={pending} aria-busy={pending} onClick={() => void activate(setAdded)}
      data-saved={added && feedback?.type === "success" && selected && !pending || undefined}>
      {overlayClassName ? <span>{star}</span> : star}
    </button>
    <ActionFeedback feedback={feedback} ref={alignFeedback} className="fixed inset-auto m-0 w-max" />
  </span>;
}

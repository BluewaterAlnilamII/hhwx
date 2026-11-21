"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useBandoriFavorite } from "@/hooks/useBandoriFavorites";
import { ApiRouteError } from "@/lib/api-contracts";
import { favoriteKey } from "@/lib/bandori/favorites";
import type { ProfileModuleId } from "@/lib/profile-homepage";
import type { BandoriServer } from "@/lib/bandori-server";
import ActionFeedback from "@/components/ActionFeedback";
import { useActionFeedback } from "@/hooks/useActionFeedback";
import { getTooltipPosition } from "@/lib/tooltip-position";
import styles from "./FavoriteButton.module.css";

function alignFeedback(badge: HTMLDivElement | null) {
  const anchor = badge?.parentElement;
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

export default function BandoriFavoriteButton({ kind, id, server, detail = false, compact = false }: {
  kind: ProfileModuleId; id: number | string; server?: BandoriServer | null; detail?: boolean; compact?: boolean;
}) {
  const target = favoriteKey(kind, id, server);
  return <FavoriteControl key={target} target={target} detail={detail} compact={compact} />;
}

function FavoriteControl({ target, detail, compact }: { target: string; detail: boolean; compact: boolean }) {
  const t = useTranslations("account.favorites");
  const router = useRouter();
  const state = useBandoriFavorite(target);
  const writing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const { feedback, showFeedback } = useActionFeedback(target + state.viewer);
  const label = state.failed ? t("retry") : state.viewer ? t(state.selected ? "remove" : "add") : t("login");
  const pending = busy || (!state.ready && !state.failed);
  async function click() {
    if (writing.current || pending) return;
    if (state.failed) { void state.retry(); return; }
    if (!state.viewer) { router.push("/auth?mode=login&next=" + encodeURIComponent(location.pathname + location.search + location.hash)); return; }
    writing.current = true;
    setBusy(true);
    try {
      await state.toggle();
      setAdded(!state.selected);
      showFeedback("success", t(state.selected ? "removed" : "added"));
    } catch (error) {
      showFeedback("error", t(error instanceof ApiRouteError && error.status === 403 ? "verify" : "failed"));
    } finally { writing.current = false; setBusy(false); }
  }
  return <span className={styles.control}>
    <button type="button" className={`${styles.star} hhwx-favorite-motion`} data-detail={detail} data-compact={compact || undefined} aria-pressed={state.selected}
      title={label} aria-label={label}
      aria-disabled={pending} aria-busy={pending} onClick={click}
      data-saved={added && feedback?.type === "success" && state.selected && !pending || undefined}>
      <Star className={state.selected ? "hhwx-saved-star" : undefined} aria-hidden="true" onAnimationEnd={() => setAdded(false)} />
    </button>
    <ActionFeedback feedback={feedback} ref={alignFeedback} className="fixed inset-auto m-0 w-max" />
  </span>;
}

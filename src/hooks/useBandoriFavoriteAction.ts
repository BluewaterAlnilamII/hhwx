"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ApiRouteError } from "@/lib/api-contracts";
import { useActionFeedback } from "./useActionFeedback";
import { useBandoriFavorite } from "./useBandoriFavorites";

export default function useBandoriFavoriteAction(target: string, addLabel: "add" | "addToFavorites" = "add") {
  const t = useTranslations("account.favorites");
  const router = useRouter();
  const state = useBandoriFavorite(target);
  const writing = useRef(false);
  const [busy, setBusy] = useState(false);
  const { feedback, showFeedback } = useActionFeedback(target + state.viewer);
  const label = state.failed ? t("retry") : state.viewer ? t(state.selected ? "remove" : addLabel) : t("login");
  const pending = busy || (!state.ready && !state.failed);
  async function activate(onSaved?: (selected: boolean, message: string) => void) {
    if (writing.current || pending) return;
    if (state.failed) { void state.retry(); return; }
    if (!state.viewer) {
      router.push("/auth?mode=login&next=" + encodeURIComponent(location.pathname + location.search + location.hash));
      return;
    }
    writing.current = true;
    setBusy(true);
    const message = t(state.selected ? "removed" : "added");
    try {
      await state.toggle(() => onSaved?.(!state.selected, message));
      showFeedback("success", message);
    } catch (error) {
      showFeedback("error", t(error instanceof ApiRouteError && error.status === 403 ? "verify" : state.selected ? "removeFailed" : "failed"));
    } finally { writing.current = false; setBusy(false); }
  }
  return { selected: state.selected, label, pending, activate, feedback };
}

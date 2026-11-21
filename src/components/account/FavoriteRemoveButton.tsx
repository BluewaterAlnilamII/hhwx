"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionFeedback from "@/components/ActionFeedback";
import { useActionFeedback } from "@/hooks/useActionFeedback";
import { setBandoriFavorite } from "@/hooks/useBandoriFavorites";
import styles from "./ProfileFavorites.module.css";

export default function FavoriteRemoveButton({ kind, editor, target, editing, onRemove }: {
  kind: "songs" | "events"; editor: string; target: string; editing: boolean; onRemove: (target: string) => void;
}) {
  const t = useTranslations("account.favorites");
  const [busy, setBusy] = useState(false);
  const { feedback, showFeedback } = useActionFeedback(editor + ":" + target);
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await setBandoriFavorite(editor, kind + ":" + target, false, () => onRemove(target));
    } catch {
      showFeedback("error", t("removeFailed"));
    } finally {
      setBusy(false);
    }
  }
  return <>
    <div className={editing ? styles.editorActions : styles.eventActions}>
      <button type="button" data-favorite-remove title={t("remove")} aria-label={t("remove")} aria-disabled={busy} onClick={remove}>
        <Star size={16} className="hhwx-saved-star" aria-hidden="true" />
      </button>
    </div>
    <ActionFeedback feedback={feedback} className={editing ? "right-2 top-1/2 -translate-y-1/2" : "top-0 left-0"} />
  </>;
}

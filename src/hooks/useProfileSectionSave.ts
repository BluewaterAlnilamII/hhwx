"use client";
import { confirmTouchOnSuccess } from "@/lib/touch-feedback";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useActionFeedback } from "./useActionFeedback";

export function useProfileSectionSave<T>(write: (values: T) => Promise<void>) {
  const t = useTranslations("account.homepage");
  const [pending, setPending] = useState<T | null>(null);
  const [target, setTarget] = useState("");
  const writing = useRef(false);
  const { feedback, clearFeedback, showFeedback } = useActionFeedback("save");
  async function save(values: T, control: string, source?: Event) {
    if (writing.current) return false;
    const confirm = confirmTouchOnSuccess(source);
    writing.current = true;
    setPending(values);
    setTarget(control);
    clearFeedback();
    try {
      await write(values);
      confirm();
      showFeedback("success", t("saved"));
      return true;
    } catch {
      showFeedback("error", t("saveFailed"));
      return false;
    } finally {
      writing.current = false;
      setPending(null);
    }
  }
  return { pending, save, feedbackFor: (control: string) => control === target ? feedback : null };
}

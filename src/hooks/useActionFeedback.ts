"use client";

import { useCallback, useEffect, useState } from "react";

export type ActionFeedbackState = { type: "success" | "error"; message: string };

export function useActionFeedback(scopeKey: string) {
  const [state, setState] = useState<{ scopeKey: string; feedback: ActionFeedbackState | null }>({ scopeKey, feedback: null });
  if (state.scopeKey !== scopeKey) setState({ scopeKey, feedback: null });
  const feedback = state.scopeKey === scopeKey ? state.feedback : null;
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setState(current => current.feedback === feedback ? { ...current, feedback: null } : current),
      feedback.type === "success" ? 2000 : 4000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const showFeedback = useCallback((type: ActionFeedbackState["type"], message: string) => {
    setState(current => current.scopeKey === scopeKey ? { scopeKey, feedback: { type, message } } : current);
  }, [scopeKey]);
  const clearFeedback = useCallback(() => {
    setState(current => current.scopeKey === scopeKey ? { ...current, feedback: null } : current);
  }, [scopeKey]);
  return { feedback, showFeedback, clearFeedback };
}

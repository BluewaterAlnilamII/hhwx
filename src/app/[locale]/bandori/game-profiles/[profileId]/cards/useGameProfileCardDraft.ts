"use client";

import { useCallback, useMemo, useReducer } from "react";
import { summarizeGameProfileCardChanges } from "@/lib/bandori/cards/profile-card-collection";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

export type GameProfileCardDraftState = {
  savedCards: UserGameProfileCardRecord[];
  draftCards: UserGameProfileCardRecord[];
};

export type GameProfileCardDraftAction =
  | { type: "reset"; cards: UserGameProfileCardRecord[] }
  | { type: "apply"; card: UserGameProfileCardRecord }
  | { type: "remove"; cardId: number }
  | { type: "discard" }
  | { type: "mark-saved"; cards: UserGameProfileCardRecord[] };

export function reduceGameProfileCardDraft(
  state: GameProfileCardDraftState,
  action: GameProfileCardDraftAction,
): GameProfileCardDraftState {
  if (action.type === "reset" || action.type === "mark-saved") {
    return { savedCards: action.cards, draftCards: action.cards };
  }
  if (action.type === "discard") {
    return { ...state, draftCards: state.savedCards };
  }
  if (action.type === "remove") {
    return {
      ...state,
      draftCards: state.draftCards.filter((card) => card.cardId !== action.cardId),
    };
  }

  const existingIndex = state.draftCards.findIndex((card) => card.cardId === action.card.cardId);
  if (existingIndex < 0) {
    return { ...state, draftCards: [...state.draftCards, action.card] };
  }
  if (state.draftCards[existingIndex] === action.card) return state;
  const draftCards = [...state.draftCards];
  draftCards[existingIndex] = action.card;
  return { ...state, draftCards };
}

export function useGameProfileCardDraft() {
  const [{ savedCards, draftCards }, dispatch] = useReducer(reduceGameProfileCardDraft, {
    savedCards: [],
    draftCards: [],
  });
  const pendingChanges = useMemo(
    () => summarizeGameProfileCardChanges(savedCards, draftCards),
    [draftCards, savedCards],
  );

  const resetCards = useCallback((cards: UserGameProfileCardRecord[]) => {
    dispatch({ type: "reset", cards });
  }, []);

  const applyCard = useCallback((nextCard: UserGameProfileCardRecord) => {
    dispatch({ type: "apply", card: nextCard });
  }, []);

  const removeCard = useCallback((cardId: number) => {
    dispatch({ type: "remove", cardId });
  }, []);

  const discardChanges = useCallback(() => {
    dispatch({ type: "discard" });
  }, []);

  const markCardsSaved = useCallback((cards: UserGameProfileCardRecord[]) => {
    dispatch({ type: "mark-saved", cards });
  }, []);

  return {
    savedCards,
    draftCards,
    pendingChanges,
    hasUnsavedChanges: pendingChanges.total > 0,
    resetCards,
    applyCard,
    removeCard,
    discardChanges,
    markCardsSaved,
  };
}

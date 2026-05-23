/*
 * Shared helpers for medley upper-bound model families.
 *
 * Keep model-neutral data preparation here so capacity assignment and context-bound models do
 * not import each other just to reuse card bucketing.
 */
import type { SearchCard } from "@/lib/bandori/team-builder/core";
import type { MedleyCapacityCardsByCharacter, MedleySlotSearch } from "../types";

export function buildMedleyCapacityCardsByCharacter(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyCapacityCardsByCharacter {
  const cardsByCharacter: MedleyCapacityCardsByCharacter = new Map();
  remainingSlotIndices.forEach((slotIndex, slotPosition) => {
    for (const card of slots[slotIndex].searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const cardsById = cardsByCharacter.get(card.characterId) ?? new Map<number, Array<SearchCard | undefined>>();
      const slotCards = cardsById.get(card.cardId) ?? new Array<SearchCard | undefined>(remainingSlotIndices.length);
      slotCards[slotPosition] = card;
      cardsById.set(card.cardId, slotCards);
      cardsByCharacter.set(card.characterId, cardsById);
    }
  });
  return cardsByCharacter;
}

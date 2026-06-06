export type CardIdentitySource = {
  cardId: number;
  cardInstanceKey?: string;
};

export function getCardInstanceKey(card: CardIdentitySource): string {
  return card.cardInstanceKey ?? `profile:${card.cardId}`;
}

export function compareCardInstanceKey(left: CardIdentitySource, right: CardIdentitySource): number {
  return getCardInstanceKey(left).localeCompare(getCardInstanceKey(right));
}

export function getCardInstanceKeys(cards: readonly CardIdentitySource[]): string[] {
  return cards.map(getCardInstanceKey);
}

export function getSortedCardInstanceKey(cards: readonly CardIdentitySource[]): string {
  return getCardInstanceKeys(cards).sort().join(",");
}

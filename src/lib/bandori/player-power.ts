import { parseApiSuccessData } from "@/lib/api-contracts";
import { getBandoriServerFromCode } from "@/lib/bandori-server";
import { selectedAreaItemPower } from "./medley-foundation/parameters";
import { playerRecord, type PlayerCard, type PlayerPowerInput, type PlayerProfileView } from "./player-profile";
import {
  calculateBandoriCard,
  type BestdoriAreaItemMaster,
  type BestdoriCardMaster,
  type BandoriCharacterMaster,
} from "./team-builder/core/calculator";

export type PlayerAreaItemMaster = BestdoriAreaItemMaster & {
  areaItemName?: Array<string | null>;
  description?: Record<string, Array<string | null>>;
  level?: Array<number | null>;
};
export type PlayerAreaItemMasters = Record<string, PlayerAreaItemMaster | undefined>;

export function parsePlayerAreaItemsMaster(raw: unknown): PlayerAreaItemMasters {
  const payload = playerRecord(parseApiSuccessData(raw)).payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid area item master");
  return payload as PlayerAreaItemMasters;
}

function calculatePlayerCardBase(card: PlayerCard, master: BestdoriCardMaster | null | undefined) {
  const maxLevel = Number(master?.levelLimit) + Number(master?.stat?.training?.levelLimit ?? 0);
  if (!master || card.level === null || card.level < 1 || card.level > maxLevel
    || !Number.isInteger(master.rarity) || Number(master.rarity) < 1 || Number(master.rarity) > 5
    || !["1", String(maxLevel)].every((level) => ["performance", "technique", "visual"].every((key) => {
      const value = playerRecord(master.stat?.[level])[key];
      return typeof value === "number" && Number.isFinite(value) && value > 0;
    }))) throw new Error("Incomplete card master for player power");
  return calculateBandoriCard({ cardId: card.cardId, level: card.level, isTrained: false, masterRank: 0, skillLevel: 1, episodeCount: 0 }, master, {});
}

/** Recover profile-style 0.1% units only when rounding permits one integer value. */
export function getPlayerCharacterBonusParameters(
  card: PlayerCard,
  master: BestdoriCardMaster | null | undefined,
  append: PlayerPowerInput["cards"][number],
) {
  const base = calculatePlayerCardBase(card, master).baseParam;
  function parameter(key: "performance" | "technique" | "visual", index: number, type: "potential" | "mission") {
    const total = base[index] + append.append[key];
    const points = append[type][key];
    // Mission values may combine separately floored training and collection bonuses.
    const min = Math.ceil(points * 1000 / total);
    const max = Math.ceil((points + (type === "mission" ? 2 : 1)) * 1000 / total) - 1;
    return min === max ? min : null;
  }
  return (["performance", "technique", "visual"] as const).map((key, index) => ({
    key, potential: parameter(key, index, "potential"), mission: parameter(key, index, "mission"),
  }));
}

/** Profile append values already include training, episodes and Master Rank bonuses. */
export function calculatePlayerPower(
  player: PlayerProfileView,
  masters: Record<string, BestdoriCardMaster | null | undefined>,
  characters: Record<string, BandoriCharacterMaster | null | undefined>,
  areaItems: PlayerAreaItemMasters,
): { totalPower: number; cardPowers: Record<string, number> } | null {
  if (!player.power.public || !player.power.value) return null;
  const input = player.power.value;
  if (player.cards.length !== 5 || new Set(player.cards.map((card) => card.cardId)).size !== 5) throw new Error("Incomplete main band");
  const keys = ["performance", "technique", "visual"] as const;
  const cards = player.cards.map((card) => {
    const master = masters[card.cardId];
    const character = characters[String(master?.characterId)];
    const append = input.cards.find((value) => value.cardId === card.cardId);
    if (!master || !character?.bandId || !append) throw new Error("Incomplete card master for player power");

    // Reuse the level curve with all independently reconstructed bonuses disabled.
    const base = calculatePlayerCardBase(card, master);
    const characterParameter = keys.map((key, index) => base.baseParam[index] + append.append[key] + append.potential[key] + append.mission[key]) as [number, number, number];
    return { ...base, bandId: character.bandId, characterParameter, totalPower: characterParameter.reduce((sum, value) => sum + value, 0) };
  });
  const server = getBandoriServerFromCode(player.server)!;
  const selected = input.areaItems.map((item) => {
    const master = areaItems[item.categoryId];
    if (!master || !Array.isArray(master.targetAttributes) || !Array.isArray(master.targetBandIds)
      || (item.level > 0 && !keys.every((key) => {
        const rates = master[key]?.[String(item.level)];
        return Array.isArray(rates) && typeof rates[server] === "number" && Number.isFinite(rates[server]);
      }))) throw new Error("Incomplete area item master for player power");
    return item.categoryId;
  });
  if (new Set(selected).size !== selected.length) throw new Error("Duplicate enabled area item category");
  const levels = new Map(input.areaItems.map((item) => [item.categoryId, { areaItemId: item.categoryId, level: item.level }]));
  const bonus = selectedAreaItemPower(cards, areaItems, levels, selected, server);
  return {
    totalPower: cards.reduce((sum, card) => sum + card.totalPower, 0) + bonus,
    cardPowers: Object.fromEntries(cards.map((card) => [card.cardId,
      card.totalPower + selectedAreaItemPower([card], areaItems, levels, selected, server),
    ])),
  };
}

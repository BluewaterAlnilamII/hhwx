import { parseApiSuccessData } from "@/lib/api-contracts";
import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import { parseBandoriCardsMasterResponse } from "@/lib/bandori-cards-api-client";
import { type BandoriCardMasterRecord } from "@/lib/bandori-cards-api-client";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  resolveBandoriSkillLabel,
  type BandoriSkillLabelMaster,
  type ResolvedBandoriSkillLabel,
} from "@/lib/bandori-skill-label";

type BandoriMasterResponse<T> = {
  payload?: Record<string, T | null | undefined>;
};

export type BandoriCharacterMaster = {
  bandId?: number | null;
  nickname?: Array<string | null> | string;
  characterName?: Array<string | null> | string;
  firstName?: Array<string | null> | string;
};

export type BandoriSkillMaster = BandoriSkillLabelMaster;
export type BandoriCardMaster = BandoriCardMasterRecord;

export function resolveBandoriCardBandId(
  metadata: Pick<BandoriCardMaster, "characterId"> | null | undefined,
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>,
): number | null {
  const characterId = Number(metadata?.characterId);
  if (!Number.isFinite(characterId) || characterId <= 0) {
    return null;
  }
  const bandId = Number(characters[String(Math.trunc(characterId))]?.bandId);
  return Number.isFinite(bandId) && bandId > 0 ? Math.trunc(bandId) : null;
}

export function resolveBandoriCardSkillId(
  card: { skillId?: unknown } | null | undefined,
  metadata: Pick<BandoriCardMaster, "skillId"> | null | undefined,
): number | null {
  const skillId = Number(card?.skillId ?? metadata?.skillId);
  return Number.isFinite(skillId) && skillId > 0 ? Math.trunc(skillId) : null;
}

export function resolveBandoriCardSkillLabel(
  card: { skillId?: unknown; skillLevel?: unknown } | null | undefined,
  metadata: Pick<BandoriCardMaster, "skillId"> | null | undefined,
  skills: Readonly<Record<string, BandoriSkillMaster | null | undefined>>,
  fallbackLevel = 5,
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  contextServer?: BandoriServer | null,
  fallbackLabel = "",
): ResolvedBandoriSkillLabel {
  const skillId = resolveBandoriCardSkillId(card, metadata);
  return resolveBandoriSkillLabel(
    skillId ? skills[String(skillId)] ?? undefined : undefined,
    card?.skillLevel,
    fallbackLevel,
    preferredServer,
    contextServer,
    fallbackLabel,
  );
}

function pickCharacterNameField(
  value: Array<string | null> | string | undefined,
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return pickBestdoriLocalizedName(value, preferredServer, contextServer);
}

export function pickBandoriCharacterDisplayName(
  character: BandoriCharacterMaster | null | undefined,
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  contextServer?: BandoriServer | null,
  fallback = "",
): string {
  return pickCharacterNameField(character?.nickname, preferredServer, contextServer)
    ?? pickCharacterNameField(character?.characterName, preferredServer, contextServer)
    ?? pickCharacterNameField(character?.firstName, preferredServer, contextServer)
    ?? fallback;
}

function transformCardsResponse(raw: unknown): Record<string, BandoriCardMaster | null | undefined> {
  return parseBandoriCardsMasterResponse(raw);
}

function transformCharactersResponse(raw: unknown): Record<string, BandoriCharacterMaster | null | undefined> {
  return parseApiSuccessData<BandoriMasterResponse<BandoriCharacterMaster>>(raw)?.payload ?? {};
}

function transformSkillsResponse(raw: unknown): Record<string, BandoriSkillMaster | null | undefined> {
  return parseApiSuccessData<BandoriMasterResponse<BandoriSkillMaster>>(raw)?.payload ?? {};
}

export const bandoriMasterTransforms = {
  cards: transformCardsResponse,
  characters: transformCharactersResponse,
  skills: transformSkillsResponse,
};

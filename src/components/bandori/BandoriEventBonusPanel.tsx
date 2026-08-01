"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import BandoriCardTile from "@/components/bandori/BandoriCardTile";
import {
  buildBandoriResIconPublicUrl,
} from "@/lib/bandori-asset-proxy";
import {
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";
import type {
  BandoriCardAttribute,
  BandoriEventBonus,
} from "@/lib/bandori-team-calculator";
import {
  normalizeBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import { cn } from "@/lib/utils";

export type BandoriEventBonusCharacter = {
  nickname?: string[] | string;
  firstName?: string[] | string;
  characterName?: string[] | string;
  bandId?: number | null;
};

export type BandoriEventBonusCardMetadata = {
  [key: string]: unknown;
  characterId?: number;
  rarity?: number;
  attribute?: string;
  skillId?: number;
  levelLimit?: number;
  resourceSetName?: string;
  prefix?: Array<string | null>;
  stat?: {
    training?: {
      levelLimit?: number;
    };
  };
};

type BandoriEventBonusPanelProps = {
  eventTypeLabel: string;
  eventBonus: BandoriEventBonus | null;
  characters: Record<string, BandoriEventBonusCharacter | undefined>;
  skills: Record<string, BandoriSkillLabelMaster | undefined>;
  cardMetadata: Record<string, BandoriEventBonusCardMetadata | null | undefined>;
  preferredServer: BandoriServer;
  loading?: boolean;
  error?: string;
  showMatch?: boolean;
  showParameter?: boolean;
  showMasterRank?: boolean;
  scoreFormulaLabel?: string;
  variant?: "card" | "embedded";
};

const ATTRIBUTE_SWATCH_CLASSES: Record<BandoriCardAttribute, string> = {
  powerful: "bg-rose-500",
  cool: "bg-sky-500",
  happy: "bg-amber-400",
  pure: "bg-emerald-500",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInteger(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function isKnownAttribute(value: unknown): value is BandoriCardAttribute {
  return typeof value === "string" && value in ATTRIBUTE_SWATCH_CLASSES;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  const rounded = Math.round(value * 10) / 10;
  return `+${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function formatPercentSequence(values: number[]): string {
  return values.map((value) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  }).join("/");
}

function pickCharacterDisplayName(
  character: BandoriEventBonusCharacter | undefined,
  preferredServer: BandoriServer,
  characterId: number,
): string {
  for (const value of [character?.nickname, character?.characterName, character?.firstName]) {
    if (typeof value === "string") {
      if (value.trim()) return value.trim();
      continue;
    }
    const localized = pickBandoriRegionalText(value, preferredServer, preferredServer);
    if (localized) {
      return localized;
    }
  }
  return `Character #${characterId}`;
}

function readAttributeBonusItems(eventBonus: BandoriEventBonus | null) {
  return (eventBonus?.attributes ?? []).flatMap((item) => {
    if (!isRecord(item) || !isKnownAttribute(item.attribute)) return [];
    const percent = toFiniteNumber(item.percent);
    return percent === null ? [] : [{ attribute: item.attribute, percent }];
  });
}

function readCharacterBonusItems(
  eventBonus: BandoriEventBonus | null,
  characters: Record<string, BandoriEventBonusCharacter | undefined>,
  preferredServer: BandoriServer,
) {
  return (eventBonus?.characters ?? []).flatMap((item) => {
    if (!isRecord(item)) return [];
    const characterId = toInteger(item.characterId);
    const percent = toFiniteNumber(item.percent);
    if (characterId === null || percent === null) return [];
    return [{
      characterId,
      label: pickCharacterDisplayName(characters[String(characterId)], preferredServer, characterId),
      percent,
    }];
  });
}

function readMemberBonusItems(
  eventBonus: BandoriEventBonus | null,
  cardMetadata: Record<string, BandoriEventBonusCardMetadata | null | undefined>,
) {
  return (eventBonus?.members ?? []).flatMap((item) => {
    if (!isRecord(item)) return [];
    const cardId = toInteger(item.situationId ?? item.id);
    const percent = toFiniteNumber(item.percent);
    return cardId === null || percent === null
      ? []
      : [{ cardId, metadata: cardMetadata[String(cardId)] ?? undefined, percent }];
  });
}

function readMasterRankBonusGroups(eventBonus: BandoriEventBonus | null) {
  const groups = new Map<number, number[]>();
  for (const item of eventBonus?.limitBreaks ?? []) {
    if (!isRecord(item)) continue;
    const rarity = toInteger(item.rarity);
    const rank = toInteger(item.rank);
    const percent = toFiniteNumber(item.percent);
    if (rarity === null || rank === null || percent === null) continue;
    const values = groups.get(rarity) ?? [];
    values[rank] = percent;
    groups.set(rarity, values);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rarity, values]) => ({
      rarity,
      values: Array.from({ length: 5 }, (_, rank) => values[rank] ?? 0),
    }));
}

function BonusChip({
  children,
  tone = "default",
  compact = false,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "muted";
  compact?: boolean;
}) {
  const toneClassName = tone === "accent"
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : tone === "muted"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : "border-slate-200 bg-white text-slate-700";
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border text-sm font-semibold shadow-xs",
      compact ? "min-h-8 gap-1.5 px-2.5 py-1" : "min-h-9 gap-2 px-3 py-1.5",
      toneClassName,
    )}>
      {children}
    </span>
  );
}

function AttributeIcon({ attribute }: { attribute: BandoriCardAttribute }) {
  const t = useTranslations("bandori.teamBuilder.excludedFilter.attributes");
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full",
        ATTRIBUTE_SWATCH_CLASSES[attribute],
      )}
      title={t(attribute)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildBandoriResIconPublicUrl(`${attribute}.svg`)}
        alt=""
        className="h-full w-full object-contain"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function CharacterIcon({ characterId, label }: { characterId: number; label: string }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200" title={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildBandoriResIconPublicUrl(`chara_icon_${characterId}.png`)}
        alt={label}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function CharacterBonusChip({ items, noneLabel }: {
  items: Array<{ characterId: number; label: string; percent: number }>;
  noneLabel: string;
}) {
  if (items.length === 0) {
    return <BonusChip tone="muted">{noneLabel}</BonusChip>;
  }
  const firstPercent = items[0]?.percent ?? 0;
  const allSamePercent = items.every((item) => item.percent === firstPercent);
  if (!allSamePercent) {
    return items.map((item) => (
      <BonusChip key={item.characterId} compact>
        <CharacterIcon characterId={item.characterId} label={item.label} />
        {formatPercent(item.percent)}
      </BonusChip>
    ));
  }
  return (
    <BonusChip compact>
      <span className="flex items-center -space-x-1">
        {items.map((item) => (
          <CharacterIcon key={item.characterId} characterId={item.characterId} label={item.label} />
        ))}
      </span>
      <span className="pl-1">{formatPercent(firstPercent)}</span>
    </BonusChip>
  );
}

function EventBonusInfoRow({
  label,
  children,
  variant,
  mobileLayout = "inline",
}: {
  label: string;
  children: React.ReactNode;
  variant: "card" | "embedded";
  mobileLayout?: "inline" | "stacked";
}) {
  const LabelElement = variant === "embedded" ? "dt" : "div";
  const ValueElement = variant === "embedded" ? "dd" : "div";

  return (
    <div className={cn(
      "grid gap-2",
      variant === "card" && "md:grid-cols-[7rem_1fr] md:items-start",
      variant === "embedded" && [
        "border-b border-slate-200/70 py-3 last:border-b-0 md:grid-cols-[7rem_1fr] md:items-start md:gap-5",
        mobileLayout === "inline"
          ? "grid-cols-[7rem_minmax(0,1fr)] items-start gap-3"
          : "grid-cols-1 gap-2",
      ],
    )}>
      <LabelElement className={cn(
        "pt-1 text-sm font-semibold",
        variant === "embedded"
          ? "text-slate-500 dark:text-slate-400"
          : "text-slate-600",
      )}>
        {label}
      </LabelElement>
      <ValueElement className={cn(
        "flex min-w-0 flex-wrap items-center gap-2",
        variant === "embedded" && "justify-end",
      )}>
        {children}
      </ValueElement>
    </div>
  );
}

function EventBonusCard({
  cardId,
  metadata,
  percent,
  bandId,
  characters,
  skills,
  preferredServer,
}: {
  cardId: number;
  metadata: BandoriEventBonusCardMetadata | undefined;
  percent: number;
  bandId: number | null;
  characters: Record<string, BandoriEventBonusCharacter | undefined>;
  skills: Record<string, BandoriSkillLabelMaster | undefined>;
  preferredServer: BandoriServer;
}) {
  const rarity = Math.min(5, Math.max(1, Math.trunc(Number(metadata?.rarity) || 1)));
  const trainedLevelFallback = rarity >= 4 ? 60 : rarity >= 3 ? 50 : rarity >= 2 ? 30 : 20;
  const baseLevelLimit = Math.trunc(Number(metadata?.levelLimit) || 0);
  const trainingLevelLimit = Math.trunc(Number(metadata?.stat?.training?.levelLimit) || 0);
  const level = Math.max(1, baseLevelLimit + trainingLevelLimit || trainedLevelFallback);
  const attribute = isKnownAttribute(metadata?.attribute) ? metadata.attribute : "powerful";
  const cardName = pickBandoriRegionalText(metadata?.prefix, preferredServer, preferredServer) ?? `Card #${cardId}`;
  const characterId = toInteger(metadata?.characterId);
  const characterName = characterId === null
    ? `Card #${cardId}`
    : pickCharacterDisplayName(characters[String(characterId)], preferredServer, characterId);
  const skillId = toInteger(metadata?.skillId);
  const skillEffectLabel = normalizeBandoriSkillLabel(
    skillId === null ? undefined : skills[String(skillId)],
    5,
    5,
    preferredServer,
    preferredServer,
  );
  return (
    <BandoriCardTile
      card={{
        cardId,
        level,
        masterRank: 0,
        skillLevel: 1,
        isTrained: rarity >= 3,
        bandId,
        totalPower: 0,
      }}
      metadata={{ ...metadata, rarity, attribute }}
      cardName={cardName}
      characterName={characterName}
      skillEffectLabel={skillEffectLabel}
      badge={formatPercent(percent)}
      showPower={false}
    />
  );
}

export default function BandoriEventBonusPanel({
  eventTypeLabel,
  eventBonus,
  characters,
  skills,
  cardMetadata,
  preferredServer,
  loading = false,
  error = "",
  showMatch = true,
  showParameter = true,
  showMasterRank = true,
  scoreFormulaLabel,
  variant = "card",
}: BandoriEventBonusPanelProps) {
  const labelsT = useTranslations("bandori.teamBuilder.labels");
  const statesT = useTranslations("bandori.teamBuilder.states");
  const attributeItems = readAttributeBonusItems(eventBonus);
  const characterItems = readCharacterBonusItems(eventBonus, characters, preferredServer);
  const memberItems = readMemberBonusItems(eventBonus, cardMetadata);
  const masterRankGroups = readMasterRankBonusGroups(eventBonus);
  const parameterItems = [
    { label: labelsT("performance"), percent: eventBonus?.performancePercent },
    { label: labelsT("technique"), percent: eventBonus?.techniquePercent },
    { label: labelsT("visual"), percent: eventBonus?.visualPercent },
  ].flatMap((item) => {
    const percent = toFiniteNumber(item.percent);
    return percent !== null && percent !== 0 ? [{ label: item.label, percent }] : [];
  });
  const pointPercent = eventBonus?.pointPercent ?? null;
  const parameterPercent = eventBonus?.parameterPercent ?? null;
  const matchBonusPercent = parameterPercent !== null && parameterPercent !== 0 ? parameterPercent : pointPercent;
  const RowsContainer = variant === "embedded" ? "dl" : "div";
  const attributeLabel = variant === "embedded" ? "加成属性" : labelsT("attribute");
  const characterLabel = variant === "embedded" ? "加成角色" : labelsT("character");
  const parameterLabel = variant === "embedded" ? "加成参数" : labelsT("parameter");
  const cardsLabel = variant === "embedded" ? "加成卡牌" : labelsT("cards");
  const memberCards = memberItems.map((item) => {
    const characterId = toInteger(item.metadata?.characterId);
    const bandId = characterId === null
      ? null
      : toInteger(characters[String(characterId)]?.bandId);
    return (
      <EventBonusCard
        key={item.cardId}
        cardId={item.cardId}
        metadata={item.metadata}
        percent={item.percent}
        bandId={bandId}
        characters={characters}
        skills={skills}
        preferredServer={preferredServer}
      />
    );
  });

  return (
    <section className={cn(
      variant === "card"
        ? "rounded-3xl border border-slate-200 bg-[#fffef4] p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)] sm:p-5"
        : "min-w-0",
    )}>
      {variant === "card" ? (
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-slate-900">{labelsT("eventBonus")}</h2>
          {loading ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {labelsT("loadBonus")}
            </span>
          ) : null}
        </div>
      ) : null}

      {variant === "embedded" && loading ? (
        <div className="inline-flex items-center gap-2 py-3 text-sm font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {labelsT("loadBonus")}
        </div>
      ) : null}
      {variant === "embedded" && !eventBonus && !loading ? (
        <div className="py-3 text-sm font-semibold text-slate-500">{statesT("noEventBonusData")}</div>
      ) : null}
      {variant === "embedded" && error ? <div className="py-3 text-sm font-semibold text-rose-600">{error}</div> : null}

      <RowsContainer className={cn(variant === "card" ? "mt-4 space-y-4" : "divide-y-0")}>
        {variant === "card" ? (
          <EventBonusInfoRow label={labelsT("type")} variant={variant}>
            <BonusChip tone="accent">{eventTypeLabel}</BonusChip>
            {!eventBonus && !loading ? <BonusChip tone="muted">{statesT("noEventBonusData")}</BonusChip> : null}
            {error ? <span className="text-sm font-semibold text-rose-600">{error}</span> : null}
          </EventBonusInfoRow>
        ) : null}

        <EventBonusInfoRow label={attributeLabel} variant={variant}>
          {attributeItems.length > 0 ? attributeItems.map((item) => (
            <BonusChip key={item.attribute} compact>
              <AttributeIcon attribute={item.attribute} />
              {formatPercent(item.percent)}
            </BonusChip>
          )) : <BonusChip tone="muted">{statesT("none")}</BonusChip>}
        </EventBonusInfoRow>

        <EventBonusInfoRow label={characterLabel} variant={variant}>
          <CharacterBonusChip items={characterItems} noneLabel={statesT("none")} />
        </EventBonusInfoRow>

        {showMatch ? (
          <EventBonusInfoRow label={labelsT("match")} variant={variant}>
            <BonusChip compact>{formatPercent(matchBonusPercent)}</BonusChip>
          </EventBonusInfoRow>
        ) : null}

        {showParameter && parameterItems.length > 0 ? (
          <EventBonusInfoRow label={parameterLabel} variant={variant}>
            {parameterItems.map((item) => (
              <BonusChip key={item.label} compact>{item.label} {formatPercent(item.percent)}</BonusChip>
            ))}
          </EventBonusInfoRow>
        ) : null}

        {showMasterRank ? (
          <EventBonusInfoRow label={labelsT("masterRank")} variant={variant}>
            {masterRankGroups.length > 0 ? masterRankGroups.map((group) => (
              <BonusChip key={group.rarity}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildBandoriResIconPublicUrl(`star_${Math.max(1, Math.min(5, Math.trunc(group.rarity)))}.png`)}
                  alt=""
                  className="h-5 w-5 shrink-0 object-contain"
                  loading="lazy"
                  decoding="async"
                />
                +{formatPercentSequence(group.values)}%
              </BonusChip>
            )) : <BonusChip tone="muted">{statesT("none")}</BonusChip>}
          </EventBonusInfoRow>
        ) : null}

        <EventBonusInfoRow
          label={cardsLabel}
          variant={variant}
          mobileLayout={variant === "embedded" ? "stacked" : "inline"}
        >
          {memberItems.length > 0 ? memberCards : <BonusChip tone="muted">{statesT("none")}</BonusChip>}
        </EventBonusInfoRow>

        {scoreFormulaLabel ? (
          <EventBonusInfoRow label={labelsT("scoreFormula")} variant={variant}>
            <BonusChip compact>{scoreFormulaLabel}</BonusChip>
          </EventBonusInfoRow>
        ) : null}
      </RowsContainer>
    </section>
  );
}

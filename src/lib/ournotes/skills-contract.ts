import {
  OURNOTES_LOCALES, OURNOTES_MAX_RECORDS, OURNOTES_SLOT_SOURCES,
  ourNotesId, ourNotesInteger, ourNotesLocales, ourNotesRecord, ourNotesString,
  ourNotesText, requireOurNotes, type OurNotesLocaleMap, type OurNotesText,
} from "./master-contract";

export const OURNOTES_SKILL_KINDS = ["leader", "live", "gekisou", "support", "gekisouSupport"] as const;
export type OurNotesSkillKind = typeof OURNOTES_SKILL_KINDS[number];
export type OurNotesLevelNumber = [number, number, number, number, number];
export type OurNotesSkillTarget = {
  skillTargetType: number;
  bandId?: number;
  cardType?: number;
  judgement?: number;
  liveMusicType?: number;
  gekisouMissionType?: number;
  liveSkillCategories?: number[];
};
export type OurNotesSkillConditionAtLevel = {
  conditionType: number;
  conditionValues: number[];
  conditionTargets: OurNotesSkillTarget[];
  isPositive: boolean;
};
export type OurNotesSkillCondition = Omit<OurNotesSkillConditionAtLevel, "conditionType" | "conditionValues"> & {
  conditionType: OurNotesLevelNumber;
  conditionValues: OurNotesLevelNumber[];
};
type ConditionGroup = OurNotesSkillCondition[][];
export type OurNotesSkillEffect = {
  skillEffectType: number;
  effectValue: OurNotesLevelNumber;
  effectExecuteLimitCount: OurNotesLevelNumber;
  effectExecuteLimitResetConditions: ConditionGroup;
  skillTargets: OurNotesSkillTarget[];
  skillConditions: ConditionGroup | Record<string, OurNotesSkillConditionAtLevel[][]>;
  skillCumulativeCondition: {
    skillCumulativeConditionType: OurNotesLevelNumber;
    conditionValues: OurNotesLevelNumber[];
    conditionTargets: OurNotesSkillTarget[];
    maxCumulativeCount: OurNotesLevelNumber;
  } | null;
  activationTimeSecond?: OurNotesLevelNumber;
  maxEffectValue?: OurNotesLevelNumber;
  effectLimitCount?: OurNotesLevelNumber;
  skillReleaseConditions?: ConditionGroup | Record<string, OurNotesSkillConditionAtLevel[][]>;
  skillTriggerType?: OurNotesLevelNumber;
  skillTriggerConditions?: ConditionGroup;
};
export type OurNotesSkillEffectAtLevel = {
  skillEffectType: number;
  effectValue: number;
  effectExecuteLimitCount: number;
  effectExecuteLimitResetConditions: OurNotesSkillConditionAtLevel[][];
  skillTargets: OurNotesSkillTarget[];
  skillConditions: OurNotesSkillConditionAtLevel[][];
  skillCumulativeCondition: {
    skillCumulativeConditionType: number;
    conditionValues: number[];
    conditionTargets: OurNotesSkillTarget[];
    maxCumulativeCount: number;
  } | null;
  activationTimeSecond?: number;
  maxEffectValue?: number;
  effectLimitCount?: number;
  skillReleaseConditions?: OurNotesSkillConditionAtLevel[][];
  skillTriggerType?: number;
  skillTriggerConditions?: OurNotesSkillConditionAtLevel[][];
};
export type OurNotesSkillEffectByLevel = Record<"1" | "2" | "3" | "4" | "5", OurNotesSkillEffectAtLevel | null>;
type SkillFields = {
  skillIconId: number;
  skillCategories?: number[];
  displaySkillCategories?: number[];
  gekisouMissionType?: number;
  gekisouSupportSkillExecTiming?: number;
  effects: (OurNotesSkillEffect | OurNotesSkillEffectByLevel)[];
};
export type OurNotesSkill = SkillFields & {
  skillName: OurNotesText;
  description: OurNotesText;
  descriptionParameters: string[][];
};
export type OurNotesSkills = Record<OurNotesSkillKind, Record<string, OurNotesSkill>>;
type LocalSkill = {
  fields: SkillFields;
  skillName: OurNotesLocaleMap;
  description: OurNotesLocaleMap;
  descriptionParameters: string[][];
};

function list(value: unknown): unknown[] {
  requireOurNotes(Array.isArray(value) && value.length <= OURNOTES_MAX_RECORDS);
  return value;
}
function number(value: unknown): number {
  requireOurNotes(typeof value === "number" && Number.isFinite(value));
  return value;
}
function levelNumber(value: unknown, parse = number): OurNotesLevelNumber {
  const values = list(value);
  requireOurNotes(values.length === 5);
  return values.map((value) => parse(value)) as OurNotesLevelNumber;
}
function categoryList(value: unknown): number[] {
  return list(value).map((id) => ourNotesInteger(id));
}
function targets(value: unknown): OurNotesSkillTarget[] {
  return list(value).map((value) => {
    const row = ourNotesRecord(value);
    const target: OurNotesSkillTarget = { skillTargetType: ourNotesInteger(row.skillTargetType) };
    requireOurNotes([3, 4, 5].includes(target.skillTargetType));
    for (const key of ["bandId", "cardType", "judgement", "liveMusicType", "gekisouMissionType"] as const)
      if (row[key] !== undefined) target[key] = ourNotesInteger(row[key]);
    if (row.liveSkillCategories !== undefined) target.liveSkillCategories = categoryList(row.liveSkillCategories);
    return target;
  });
}
function conditions(value: unknown): ConditionGroup;
function conditions(value: unknown, atLevel: true): OurNotesSkillConditionAtLevel[][];
function conditions(value: unknown, atLevel = false): ConditionGroup | OurNotesSkillConditionAtLevel[][] {
  return list(value).map((group) => list(group).map((value) => {
    const row = ourNotesRecord(value);
    requireOurNotes(typeof row.isPositive === "boolean");
    const fields = { conditionTargets: targets(row.conditionTargets), isPositive: row.isPositive };
    return atLevel ? {
      ...fields, conditionType: ourNotesInteger(row.conditionType), conditionValues: list(row.conditionValues).map(number),
    } : {
      ...fields, conditionType: levelNumber(row.conditionType, ourNotesInteger), conditionValues: list(row.conditionValues).map((v) => levelNumber(v)),
    };
  })) as ConditionGroup | OurNotesSkillConditionAtLevel[][];
}
function skillConditionGroups(value: unknown): OurNotesSkillEffect["skillConditions"] {
  if (Array.isArray(value)) return conditions(value);
  const row = ourNotesRecord(value);
  requireOurNotes(Object.keys(row).join(",") === "1,2,3,4,5");
  return Object.fromEntries(Object.entries(row).map(([level, value]) => [level, conditions(value, true)]));
}
function effect(value: unknown, kind: OurNotesSkillKind): OurNotesSkillEffect;
function effect(value: unknown, kind: OurNotesSkillKind, atLevel: true): OurNotesSkillEffectAtLevel;
function effect(value: unknown, kind: OurNotesSkillKind, atLevel = false): OurNotesSkillEffect | OurNotesSkillEffectAtLevel {
  const row = ourNotesRecord(value);
  const cumulative = row.skillCumulativeCondition === null ? null : ourNotesRecord(row.skillCumulativeCondition);
  const parseNumber = atLevel ? number : levelNumber;
  const parseInteger = atLevel ? ourNotesInteger : (value: unknown) => levelNumber(value, ourNotesInteger);
  const parseConditions = (value: unknown) => atLevel ? conditions(value, true) : conditions(value);
  const parseSkillConditions = (value: unknown) => atLevel ? conditions(value, true) : skillConditionGroups(value);
  return {
    skillEffectType: ourNotesInteger(row.skillEffectType),
    effectValue: parseNumber(row.effectValue),
    effectExecuteLimitCount: parseNumber(row.effectExecuteLimitCount),
    effectExecuteLimitResetConditions: parseConditions(row.effectExecuteLimitResetConditions),
    skillTargets: targets(row.skillTargets),
    skillConditions: parseSkillConditions(row.skillConditions),
    skillCumulativeCondition: cumulative === null ? null : {
      skillCumulativeConditionType: parseInteger(cumulative.skillCumulativeConditionType),
      conditionValues: list(cumulative.conditionValues).map((value) => parseNumber(value)),
      conditionTargets: targets(cumulative.conditionTargets),
      maxCumulativeCount: parseNumber(cumulative.maxCumulativeCount),
    },
    ...(kind !== "leader" ? {
      activationTimeSecond: parseNumber(row.activationTimeSecond),
      maxEffectValue: parseNumber(row.maxEffectValue),
      effectLimitCount: parseNumber(row.effectLimitCount),
      skillReleaseConditions: parseSkillConditions(row.skillReleaseConditions),
    } : {}),
    ...(kind !== "leader" && kind !== "live" ? {
      skillTriggerType: parseInteger(row.skillTriggerType),
      skillTriggerConditions: parseConditions(row.skillTriggerConditions),
    } : {}),
  } as OurNotesSkillEffect | OurNotesSkillEffectAtLevel;
}
function effectEntry(value: unknown, kind: OurNotesSkillKind): OurNotesSkillEffect | OurNotesSkillEffectByLevel {
  const row = ourNotesRecord(value);
  if (Object.hasOwn(row, "skillEffectType")) return effect(row, kind);
  requireOurNotes(Object.keys(row).join(",") === "1,2,3,4,5");
  const values = Object.values(row);
  requireOurNotes(values.some((value) => value === null) && values.some((value) => value !== null));
  return Object.fromEntries(Object.entries(row).map(([level, value]) => [
    level, value === null ? null : effect(value, kind, true),
  ])) as OurNotesSkillEffectByLevel;
}
function displayString(value: unknown): string {
  const text = ourNotesString(value);
  requireOurNotes(!/[{}<>]/u.test(text));
  return text;
}
function parseSkill(value: unknown, kind: OurNotesSkillKind): LocalSkill {
  const row = ourNotesRecord(value);
  const descriptionParameters = list(row.descriptionParameters).map((value) => {
    const values = list(value);
    requireOurNotes(values.length === 5);
    return values.map(displayString);
  });
  const description = ourNotesLocales(row.description);
  for (const text of Object.values(description)) {
    const literal = text.replace(/\{(\d+)\}/gu, (_, index: string) => {
      requireOurNotes(Number.isSafeInteger(Number(index)) && Number(index) < descriptionParameters.length);
      return "";
    });
    requireOurNotes(!/[{}<>]/u.test(literal));
  }
  const effects = list(row.effects).map((value) => effectEntry(value, kind));
  return {
    fields: {
      skillIconId: ourNotesInteger(row.skillIconId),
      ...(kind === "live" || kind === "gekisou" ? { skillCategories: categoryList(row.skillCategories) } : {}),
      ...(kind !== "leader" ? { displaySkillCategories: categoryList(row.displaySkillCategories) } : {}),
      ...(kind === "gekisou" || kind === "gekisouSupport" ? { gekisouMissionType: ourNotesInteger(row.gekisouMissionType) } : {}),
      ...(kind === "gekisouSupport" ? { gekisouSupportSkillExecTiming: ourNotesInteger(row.gekisouSupportSkillExecTiming) } : {}),
      effects,
    },
    skillName: ourNotesLocales(row.skillName), description, descriptionParameters,
  };
}

export function mergeOurNotesSkills(inputs: unknown[]): OurNotesSkills {
  requireOurNotes(inputs.length === 4);
  const roots = inputs.map(ourNotesRecord);
  return Object.fromEntries(OURNOTES_SKILL_KINDS.map((kind) => {
    const sources = roots.map((root) => {
      const entries = Object.entries(ourNotesRecord(root[kind]));
      requireOurNotes(entries.length > 0 && entries.length <= OURNOTES_MAX_RECORDS);
      return Object.fromEntries(entries.map(([id, row]) => {
        requireOurNotes(ourNotesId(id));
        return [id, parseSkill(row, kind)];
      }));
    });
    const records: Record<string, OurNotesSkill> = {};
    for (const id of new Set(sources.flatMap((source) => Object.keys(source)))) {
      const rows = sources.map((source) => source[id]);
      const { fields } = rows.find(Boolean)!;
      requireOurNotes(rows.every((row) => !row || JSON.stringify(fields) === JSON.stringify(row.fields)));
      const descriptionParameters: string[][] = [];
      const description = OURNOTES_LOCALES.map((locale, slot) => {
        const row = rows[OURNOTES_SLOT_SOURCES[slot]];
        return (row?.description[locale] ?? "").replace(/\{(\d+)\}/gu, (_, index: string) => {
          const values = row!.descriptionParameters[Number(index)];
          let outputIndex = descriptionParameters.findIndex((parameter) => parameter.every((value, i) => value === values[i]));
          if (outputIndex === -1) outputIndex = descriptionParameters.push(values) - 1;
          return `{${outputIndex}}`;
        });
      }) as OurNotesText;
      const { effects, ...headers } = fields;
      records[id] = { skillName: ourNotesText(rows.map((row) => row?.skillName)), description, descriptionParameters, effects, ...headers };
    }
    return [kind, records];
  })) as OurNotesSkills;
}

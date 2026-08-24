"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import SimulatorSettingsCard from "./SimulatorSettingsCard";
import type {
  BandoriNativeBackgroundSkin,
  BandoriNativeFieldSkin,
} from "./native-stage-contract";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
  BANDORI_NATIVE_NOTE_SKINS,
  type BandoriNativeDirectionalFlickSkin,
  type BandoriNativeNoteSkin,
} from "./native-note-assets";
import {
  BANDORI_NATIVE_TAP_SE_SKINS,
  type BandoriNativeTapSeSkin,
} from "@/lib/bandori/chart-simulator/native-note-sound-presentation";
import {
  BANDORI_LIMITED_PERFORMANCE_SKINS,
  type BandoriLimitedPerformanceSkin,
} from "./limited-performance-skins";
import {
  BANDORI_NATIVE_TAP_EFFECT_SKINS,
  type BandoriNativeTapEffectSkin,
} from "./native-tap-effect-assets";
import Switch from "@/components/Switch";
import type { BandoriNativeDirectionalEffectVariant } from "./native-live-settings";

type SimulatorSkinControlsProps = {
  backgroundSkin: BandoriNativeBackgroundSkin;
  backgroundSkins: readonly BandoriNativeBackgroundSkin[];
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  directionalEffectVariant: BandoriNativeDirectionalEffectVariant;
  fieldSkin: BandoriNativeFieldSkin;
  fieldSkins: readonly BandoriNativeFieldSkin[];
  limitedPerformanceSkin: BandoriLimitedPerformanceSkin | null;
  noteSkin: BandoriNativeNoteSkin;
  onBackgroundSkinChange: (skin: BandoriNativeBackgroundSkin) => void;
  onDirectionalFlickSkinChange: (skin: BandoriNativeDirectionalFlickSkin) => void;
  onDirectionalEffectVariantChange: (
    variant: BandoriNativeDirectionalEffectVariant,
  ) => void;
  onFieldSkinChange: (skin: BandoriNativeFieldSkin) => void;
  onLimitedPerformanceSkinChange: (
    skin: BandoriLimitedPerformanceSkin | null,
  ) => void;
  onNoteSkinChange: (skin: BandoriNativeNoteSkin) => void;
  onTapEffectSkinChange: (skin: BandoriNativeTapEffectSkin) => void;
  onTapSeSkinChange: (skin: BandoriNativeTapSeSkin) => void;
  tapEffectSkin: BandoriNativeTapEffectSkin;
  tapSeSkin: BandoriNativeTapSeSkin;
};

type SimulatorControlRowProps = {
  children: ReactNode;
  label: string;
};

export function SimulatorControlRow({
  children,
  label,
}: SimulatorControlRowProps) {
  return (
    <div className="grid items-start gap-2 py-4 first:pt-1 last:pb-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <div className="pt-2 text-sm font-semibold text-[var(--theme-color-text-muted)] sm:text-right">
        <span>{label}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

function choiceClassName(isSelected: boolean, isDisabled = false): string {
  return `inline-flex min-h-10 items-center justify-center rounded-full border px-3.5 py-2 text-sm font-semibold outline-hidden transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] ${
    isDisabled
      ? "cursor-not-allowed border-[var(--theme-color-control-border-disabled)] bg-[var(--theme-color-control-background-disabled)] text-[var(--theme-color-control-foreground-disabled)] opacity-60"
      : isSelected
        ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] shadow-[var(--theme-shadow-selection-subtle)] ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)]"
        : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] shadow-xs hover:border-[var(--theme-color-action-secondary-border)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)]"
  }`;
}

function getTypeLabel(id: number | string): string {
  if (typeof id !== "number") {
    throw new Error(`Ordinary skin Type requires a numeric ID: ${id}`);
  }
  return `TYPE${id + 1}`;
}

type SimulatorBooleanControlProps = {
  disabledLabel: string;
  enabledLabel: string;
  isEnabled: boolean;
  label: string;
  onChange: (isEnabled: boolean) => void;
};

export function SimulatorBooleanControl({
  disabledLabel,
  enabledLabel,
  isEnabled,
  label,
  onChange,
}: SimulatorBooleanControlProps) {
  return (
    <Switch
      checked={isEnabled}
      checkedLabel={enabledLabel}
      label={label}
      onCheckedChange={onChange}
      uncheckedLabel={disabledLabel}
    />
  );
}

/** Organizes only the statically verified JP skin choices admitted by the simulator contract. */
export default function SimulatorSkinControls({
  backgroundSkin,
  backgroundSkins,
  directionalEffectVariant,
  directionalFlickSkin,
  fieldSkin,
  fieldSkins,
  limitedPerformanceSkin,
  noteSkin,
  onBackgroundSkinChange,
  onDirectionalEffectVariantChange,
  onDirectionalFlickSkinChange,
  onFieldSkinChange,
  onLimitedPerformanceSkinChange,
  onNoteSkinChange,
  onTapEffectSkinChange,
  onTapSeSkinChange,
  tapEffectSkin,
  tapSeSkin,
}: SimulatorSkinControlsProps) {
  const t = useTranslations("bandori.songs.simulator.skinControls");
  const overrides = new Set(limitedPerformanceSkin?.coverage ?? []);

  return (
    <SimulatorSettingsCard title={t("ariaLabel")}>
        <SimulatorControlRow label={t("limitedPerformance.label")}>
          <button
            type="button"
            aria-pressed={limitedPerformanceSkin === null}
            className={choiceClassName(limitedPerformanceSkin === null)}
            onClick={() => onLimitedPerformanceSkinChange(null)}
          >
            {t("limitedPerformance.none")}
          </button>
          {BANDORI_LIMITED_PERFORMANCE_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={limitedPerformanceSkin?.id === skin.id}
              className={choiceClassName(limitedPerformanceSkin?.id === skin.id)}
              onClick={() => onLimitedPerformanceSkinChange(skin)}
            >
              {t(`limitedPerformance.skin.${skin.id}`)}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("backgroundStyle")}>
          {backgroundSkins.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={backgroundSkin.id === skin.id}
              className={choiceClassName(
                backgroundSkin.id === skin.id,
                overrides.has("background"),
              )}
              disabled={overrides.has("background")}
              onClick={() => onBackgroundSkinChange(skin)}
            >
              {skin.id === "off" ? t("off") : t(`backgroundSkin.${skin.id}`)}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("fieldStyle")}>
          {fieldSkins.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={fieldSkin.id === skin.id}
              className={choiceClassName(fieldSkin.id === skin.id, overrides.has("lane"))}
              disabled={overrides.has("lane")}
              onClick={() => onFieldSkinChange(skin)}
            >
              {t(`fieldSkin.${skin.id}`)}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("tapEffectStyle")}>
          {BANDORI_NATIVE_TAP_EFFECT_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={tapEffectSkin.id === skin.id}
              className={choiceClassName(
                tapEffectSkin.id === skin.id,
                overrides.has("tapEffect"),
              )}
              disabled={overrides.has("tapEffect")}
              onClick={() => onTapEffectSkinChange(skin)}
            >
              {skin.id === "off" ? t("off") : getTypeLabel(skin.id)}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("noteStyle")}>
          {BANDORI_NATIVE_NOTE_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={noteSkin.id === skin.id}
              className={choiceClassName(noteSkin.id === skin.id, overrides.has("notes"))}
              disabled={overrides.has("notes")}
              onClick={() => onNoteSkinChange(skin)}
            >
              TYPE{skin.id}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("tapSeStyle")}>
          {BANDORI_NATIVE_TAP_SE_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={tapSeSkin.id === skin.id}
              className={choiceClassName(
                tapSeSkin.id === skin.id,
                overrides.has("soundEffect"),
              )}
              disabled={overrides.has("soundEffect")}
              onClick={() => onTapSeSkinChange(skin)}
            >
              {getTypeLabel(skin.id)}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("directionalFlickStyle")}>
          {BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={directionalFlickSkin.id === skin.id}
              className={choiceClassName(
                directionalFlickSkin.id === skin.id,
                overrides.has("directionalFlick"),
              )}
              disabled={overrides.has("directionalFlick")}
              onClick={() => onDirectionalFlickSkinChange(skin)}
            >
              TYPE{skin.id}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow label={t("directionalEffectVariant.label")}>
          {(["normal", "light", "off"] as const).map((variant) => (
            <button
              key={variant}
              type="button"
              aria-pressed={directionalEffectVariant === variant}
              className={choiceClassName(directionalEffectVariant === variant)}
              onClick={() => onDirectionalEffectVariantChange(variant)}
            >
              {variant === "off" ? t("off") : t(`directionalEffectVariant.${variant}`)}
            </button>
          ))}
        </SimulatorControlRow>
    </SimulatorSettingsCard>
  );
}

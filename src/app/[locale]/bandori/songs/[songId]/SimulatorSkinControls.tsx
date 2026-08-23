"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
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

type SimulatorSkinControlsProps = {
  backgroundSkin: BandoriNativeBackgroundSkin;
  backgroundSkins: readonly BandoriNativeBackgroundSkin[];
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  fieldSkin: BandoriNativeFieldSkin;
  fieldSkins: readonly BandoriNativeFieldSkin[];
  limitedPerformanceSkin: BandoriLimitedPerformanceSkin | null;
  noteSkin: BandoriNativeNoteSkin;
  onBackgroundSkinChange: (skin: BandoriNativeBackgroundSkin) => void;
  onDirectionalFlickSkinChange: (skin: BandoriNativeDirectionalFlickSkin) => void;
  onFieldSkinChange: (skin: BandoriNativeFieldSkin) => void;
  onLimitedPerformanceSkinChange: (
    skin: BandoriLimitedPerformanceSkin | null,
  ) => void;
  onNoteSkinChange: (skin: BandoriNativeNoteSkin) => void;
  onTapSeSkinChange: (skin: BandoriNativeTapSeSkin) => void;
  tapSeSkin: BandoriNativeTapSeSkin;
};

type SimulatorControlRowProps = {
  children: ReactNode;
  label: string;
  overriddenLabel?: string;
};

export function SimulatorControlRow({
  children,
  label,
  overriddenLabel,
}: SimulatorControlRowProps) {
  return (
    <div className="grid items-start gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-3">
      <div className="pt-2 text-sm font-semibold text-[var(--theme-color-text-muted)] sm:text-right">
        <span>{label}</span>
        {overriddenLabel ? (
          <span className="mt-1 block text-xs font-medium text-[var(--theme-color-semantic-warning-foreground)]">
            {overriddenLabel}
          </span>
        ) : null}
      </div>
      <div
        aria-disabled={overriddenLabel ? "true" : undefined}
        className="flex min-w-0 flex-wrap gap-1.5"
      >
        {children}
      </div>
    </div>
  );
}

function choiceClassName(isSelected: boolean, isDisabled = false): string {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium outline-hidden transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${
    isDisabled
      ? "cursor-not-allowed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] opacity-60"
      : isSelected
        ? "border-[var(--theme-color-action-primary-border)] bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)] shadow-sm"
        : "border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)] hover:bg-[var(--theme-color-control-background-hover)]"
  }`;
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
    <>
      <button
        type="button"
        aria-label={`${label}: ${enabledLabel}`}
        aria-pressed={isEnabled}
        className={choiceClassName(isEnabled)}
        onClick={() => onChange(true)}
      >
        <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
        {enabledLabel}
      </button>
      <button
        type="button"
        aria-label={`${label}: ${disabledLabel}`}
        aria-pressed={!isEnabled}
        className={choiceClassName(!isEnabled)}
        onClick={() => onChange(false)}
      >
        <X className="h-4 w-4 text-rose-500" aria-hidden="true" />
        {disabledLabel}
      </button>
    </>
  );
}

/** Organizes only the statically verified JP skin choices admitted by the simulator contract. */
export default function SimulatorSkinControls({
  backgroundSkin,
  backgroundSkins,
  directionalFlickSkin,
  fieldSkin,
  fieldSkins,
  limitedPerformanceSkin,
  noteSkin,
  onBackgroundSkinChange,
  onDirectionalFlickSkinChange,
  onFieldSkinChange,
  onLimitedPerformanceSkinChange,
  onNoteSkinChange,
  onTapSeSkinChange,
  tapSeSkin,
}: SimulatorSkinControlsProps) {
  const t = useTranslations("bandori.songs.simulator.skinControls");
  const overrides = new Set(limitedPerformanceSkin?.coverage ?? []);
  const overriddenLabel = limitedPerformanceSkin
    ? t("limitedPerformance.overriddenBy", {
        skin: t(`limitedPerformance.skin.${limitedPerformanceSkin.id}`),
      })
    : undefined;

  return (
    <fieldset className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] px-4 pb-4 pt-2">
      <legend className="px-2 text-sm font-semibold text-[var(--theme-color-text-default)]">
        {t("ariaLabel")}
      </legend>
      <div className="space-y-3">
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
          {limitedPerformanceSkin ? (
            <span className="basis-full text-xs text-[var(--theme-color-text-muted)]">
              {t("limitedPerformance.coverage", {
                slots: limitedPerformanceSkin.coverage
                  .map((slot) => t(`limitedPerformance.slot.${slot}`))
                  .join(t("limitedPerformance.slotSeparator")),
              })}
            </span>
          ) : null}
        </SimulatorControlRow>

        <SimulatorControlRow
          label={t("backgroundStyle")}
          overriddenLabel={overrides.has("background") ? overriddenLabel : undefined}
        >
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
              {t(`backgroundSkin.${skin.id}`)}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow
          label={t("fieldStyle")}
          overriddenLabel={overrides.has("lane") ? overriddenLabel : undefined}
        >
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

        <SimulatorControlRow
          label={t("noteStyle")}
          overriddenLabel={overrides.has("notes") ? overriddenLabel : undefined}
        >
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

        <SimulatorControlRow
          label={t("tapSeStyle")}
          overriddenLabel={overrides.has("soundEffect") ? overriddenLabel : undefined}
        >
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
              SE skin0{skin.id}
            </button>
          ))}
        </SimulatorControlRow>

        <SimulatorControlRow
          label={t("directionalFlickStyle")}
          overriddenLabel={overrides.has("directionalFlick") ? overriddenLabel : undefined}
        >
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
      </div>
    </fieldset>
  );
}

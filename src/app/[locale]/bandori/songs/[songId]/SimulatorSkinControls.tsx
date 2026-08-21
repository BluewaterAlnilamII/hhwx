"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BandoriNativeFieldSkin } from "./native-stage-contract";
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

type SimulatorSkinControlsProps = {
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  fieldSkin: BandoriNativeFieldSkin;
  fieldSkins: readonly BandoriNativeFieldSkin[];
  isAllPerfectStatusEnabled: boolean;
  isLaneEffectEnabled: boolean;
  isRhythmSupportEnabled: boolean;
  isSyncLineEnabled: boolean;
  noteSkin: BandoriNativeNoteSkin;
  onDirectionalFlickSkinChange: (skin: BandoriNativeDirectionalFlickSkin) => void;
  onFieldSkinChange: (skin: BandoriNativeFieldSkin) => void;
  onAllPerfectStatusEnabledChange: (isEnabled: boolean) => void;
  onLaneEffectEnabledChange: (isEnabled: boolean) => void;
  onNoteSkinChange: (skin: BandoriNativeNoteSkin) => void;
  onRhythmSupportEnabledChange: (isEnabled: boolean) => void;
  onSyncLineEnabledChange: (isEnabled: boolean) => void;
  onTapSeSkinChange: (skin: BandoriNativeTapSeSkin) => void;
  tapSeSkin: BandoriNativeTapSeSkin;
};

type SkinControlRowProps = {
  children: ReactNode;
  label: string;
};

function SkinControlRow({ children, label }: SkinControlRowProps) {
  return (
    <div className="grid items-start gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-3">
      <div className="pt-2 text-sm font-semibold text-[var(--theme-color-text-muted)] sm:text-right">
        {label}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function choiceClassName(isSelected: boolean): string {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium outline-hidden transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${
    isSelected
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
  directionalFlickSkin,
  fieldSkin,
  fieldSkins,
  isAllPerfectStatusEnabled,
  isLaneEffectEnabled,
  isRhythmSupportEnabled,
  isSyncLineEnabled,
  noteSkin,
  onDirectionalFlickSkinChange,
  onFieldSkinChange,
  onAllPerfectStatusEnabledChange,
  onLaneEffectEnabledChange,
  onNoteSkinChange,
  onRhythmSupportEnabledChange,
  onSyncLineEnabledChange,
  onTapSeSkinChange,
  tapSeSkin,
}: SimulatorSkinControlsProps) {
  const t = useTranslations("bandori.songs.simulator.skinControls");

  return (
    <section
      aria-label={t("ariaLabel")}
      className="mt-5 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-4"
    >
      <div className="space-y-3">
        <SkinControlRow label={t("noteStyle")}>
          {BANDORI_NATIVE_NOTE_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={noteSkin.id === skin.id}
              className={choiceClassName(noteSkin.id === skin.id)}
              onClick={() => onNoteSkinChange(skin)}
            >
              TYPE{skin.id}
            </button>
          ))}
        </SkinControlRow>

        <SkinControlRow label={t("directionalFlickStyle")}>
          {BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={directionalFlickSkin.id === skin.id}
              className={choiceClassName(directionalFlickSkin.id === skin.id)}
              onClick={() => onDirectionalFlickSkinChange(skin)}
            >
              TYPE{skin.id}
            </button>
          ))}
        </SkinControlRow>

        <SkinControlRow label={t("fieldStyle")}>
          {fieldSkins.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={fieldSkin.id === skin.id}
              className={choiceClassName(fieldSkin.id === skin.id)}
              onClick={() => onFieldSkinChange(skin)}
            >
              {t(`fieldSkin.${skin.id}`)}
            </button>
          ))}
        </SkinControlRow>

        <SkinControlRow label={t("backgroundStyle")}>
          <button
            type="button"
            aria-pressed="true"
            className={choiceClassName(true)}
          >
            skin00
          </button>
        </SkinControlRow>

        <SkinControlRow label={t("syncLine")}>
          <SimulatorBooleanControl
            disabledLabel={t("off")}
            enabledLabel={t("on")}
            isEnabled={isSyncLineEnabled}
            label={t("syncLine")}
            onChange={onSyncLineEnabledChange}
          />
        </SkinControlRow>

        <SkinControlRow label={t("rhythmSupport")}>
          <SimulatorBooleanControl
            disabledLabel={t("off")}
            enabledLabel={t("on")}
            isEnabled={isRhythmSupportEnabled}
            label={t("rhythmSupport")}
            onChange={onRhythmSupportEnabledChange}
          />
        </SkinControlRow>

        <SkinControlRow label={t("laneEffect")}>
          <SimulatorBooleanControl
            disabledLabel={t("off")}
            enabledLabel={t("on")}
            isEnabled={isLaneEffectEnabled}
            label={t("laneEffect")}
            onChange={onLaneEffectEnabledChange}
          />
        </SkinControlRow>

        <SkinControlRow label={t("allPerfectStatus")}>
          <SimulatorBooleanControl
            disabledLabel={t("off")}
            enabledLabel={t("on")}
            isEnabled={isAllPerfectStatusEnabled}
            label={t("allPerfectStatus")}
            onChange={onAllPerfectStatusEnabledChange}
          />
        </SkinControlRow>

        <SkinControlRow label={t("tapSeStyle")}>
          {BANDORI_NATIVE_TAP_SE_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              aria-pressed={tapSeSkin.id === skin.id}
              className={choiceClassName(tapSeSkin.id === skin.id)}
              onClick={() => onTapSeSkinChange(skin)}
            >
              SE skin0{skin.id}
            </button>
          ))}
        </SkinControlRow>
      </div>
    </section>
  );
}

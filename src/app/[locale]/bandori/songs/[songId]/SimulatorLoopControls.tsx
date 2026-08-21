"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { SimulatorBooleanControl } from "./SimulatorSkinControls";
import type { CompiledBandoriChart } from "@/lib/bandori/chart-simulator/compiler";
import {
  createBandoriTimeLoopRange,
  resolveBandoriNoteLoopRange,
  type BandoriChartLoopRange,
  type BandoriChartNoteLoopRange,
} from "@/lib/bandori/chart-simulator/loop-range";

type SimulatorLoopMode = "time" | "notes";

type SimulatorLoopControlsProps = {
  compiled: CompiledBandoriChart;
  isEnabled: boolean;
  onEnabledChange: (isEnabled: boolean) => void;
  onRangeApply: (range: BandoriChartLoopRange) => void;
  range: BandoriChartLoopRange;
};

function formatLoopTime(timeSeconds: number): string {
  return timeSeconds.toFixed(3);
}

function modeButtonClassName(isSelected: boolean): string {
  return `inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${
    isSelected
      ? "border-[var(--theme-color-action-primary-border)] bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]"
      : "border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)] hover:bg-[var(--theme-color-control-background-hover)]"
  }`;
}

/** Owns editable loop drafts while the runtime owns only the applied media-time range. */
export default function SimulatorLoopControls({
  compiled,
  isEnabled,
  onEnabledChange,
  onRangeApply,
  range,
}: SimulatorLoopControlsProps) {
  const t = useTranslations("bandori.songs.simulator.loopControls");
  const [mode, setMode] = useState<SimulatorLoopMode>("time");
  const [startTimeDraft, setStartTimeDraft] = useState(String(range.startTimeSeconds));
  const [endTimeDraft, setEndTimeDraft] = useState(String(range.endTimeSeconds));
  const [startNoteDraft, setStartNoteDraft] = useState("1");
  const [endNoteDraft, setEndNoteDraft] = useState(String(compiled.maxCombo));
  const [noteResolution, setNoteResolution] = useState<BandoriChartNoteLoopRange | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const applyRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (mode === "time") {
        if (!startTimeDraft.trim() || !endTimeDraft.trim()) throw new RangeError();
        const nextRange = createBandoriTimeLoopRange(
          compiled.timelineDurationSeconds,
          Number(startTimeDraft),
          Number(endTimeDraft),
        );
        setNoteResolution(null);
        setValidationMessage(null);
        onRangeApply(nextRange);
        return;
      }

      if (!startNoteDraft.trim() || !endNoteDraft.trim()) throw new RangeError();
      const nextRange = resolveBandoriNoteLoopRange(
        compiled,
        Number(startNoteDraft),
        Number(endNoteDraft),
      );
      setStartTimeDraft(String(nextRange.startTimeSeconds));
      setEndTimeDraft(String(nextRange.endTimeSeconds));
      setNoteResolution(nextRange);
      setValidationMessage(null);
      onRangeApply(nextRange);
    } catch {
      setValidationMessage(t(mode === "time" ? "invalidTimeRange" : "invalidNoteRange"));
    }
  };

  return (
    <fieldset
      aria-label={t("ariaLabel")}
      className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] px-4 pb-4 pt-2"
    >
      <legend className="px-2 text-sm font-semibold text-[var(--theme-color-text-default)]">
        {t("title")}
      </legend>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          aria-pressed={mode === "time"}
          className={modeButtonClassName(mode === "time")}
          onClick={() => setMode("time")}
        >
          {t("timeMode")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "notes"}
          className={modeButtonClassName(mode === "notes")}
          onClick={() => setMode("notes")}
        >
          {t("noteMode")}
        </button>
      </div>

      <form className="mt-3 space-y-3" onSubmit={applyRange}>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "time" ? (
            <>
              <label className="grid gap-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
                {t("startTime")}
                <input
                  type="number"
                  min={0}
                  max={compiled.timelineDurationSeconds}
                  step="any"
                  value={startTimeDraft}
                  onChange={(event) => setStartTimeDraft(event.currentTarget.value)}
                  className="h-10 rounded-lg border border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
                {t("endTime")}
                <input
                  type="number"
                  min={0}
                  max={compiled.timelineDurationSeconds}
                  step="any"
                  value={endTimeDraft}
                  onChange={(event) => setEndTimeDraft(event.currentTarget.value)}
                  className="h-10 rounded-lg border border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
                />
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
                {t("startNote")}
                <input
                  type="number"
                  min={1}
                  max={compiled.maxCombo}
                  step={1}
                  value={startNoteDraft}
                  onChange={(event) => setStartNoteDraft(event.currentTarget.value)}
                  className="h-10 rounded-lg border border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
                {t("endNote")}
                <input
                  type="number"
                  min={1}
                  max={compiled.maxCombo}
                  step={1}
                  value={endNoteDraft}
                  onChange={(event) => setEndNoteDraft(event.currentTarget.value)}
                  className="h-10 rounded-lg border border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
                />
              </label>
            </>
          )}
        </div>
        <div className="flex justify-center">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--theme-color-action-primary-border)] bg-[var(--theme-color-action-primary-background)] px-5 text-sm font-semibold text-[var(--theme-color-action-primary-foreground)] outline-hidden transition hover:bg-[var(--theme-color-action-primary-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
          >
            {t("apply")}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm font-semibold text-[var(--theme-color-text-muted)]">
          {t("enabled")}
        </span>
        <SimulatorBooleanControl
          disabledLabel={t("off")}
          enabledLabel={t("on")}
          isEnabled={isEnabled}
          label={t("enabled")}
          onChange={onEnabledChange}
        />
      </div>

      <p
        aria-live="polite"
        className="mt-2 text-center text-xs tabular-nums text-[var(--theme-color-text-muted)]"
      >
        {t("appliedRange", {
          end: formatLoopTime(range.endTimeSeconds),
          start: formatLoopTime(range.startTimeSeconds),
        })}
      </p>
      {noteResolution ? (
        <p className="mt-1 text-center text-xs text-[var(--theme-color-text-muted)]">
          {t("normalizedNoteRange", {
            end: noteResolution.normalizedEndNoteNumber,
            start: noteResolution.normalizedStartNoteNumber,
          })}
        </p>
      ) : null}
      {validationMessage ? (
        <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-600 dark:text-red-400">
          {validationMessage}
        </p>
      ) : null}
    </fieldset>
  );
}

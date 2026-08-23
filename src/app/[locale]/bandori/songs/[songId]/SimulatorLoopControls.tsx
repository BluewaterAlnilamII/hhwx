"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import SimulatorSettingsCard from "./SimulatorSettingsCard";
import Switch from "@/components/Switch";
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
  return `inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${
    isSelected
      ? "bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] shadow-sm ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)]"
      : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)]"
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
  const [startTimeDraft, setStartTimeDraft] = useState(
    formatLoopTime(range.startTimeSeconds),
  );
  const [endTimeDraft, setEndTimeDraft] = useState(
    formatLoopTime(range.endTimeSeconds),
  );
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
        setStartTimeDraft(formatLoopTime(nextRange.startTimeSeconds));
        setEndTimeDraft(formatLoopTime(nextRange.endTimeSeconds));
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
      setStartTimeDraft(formatLoopTime(nextRange.startTimeSeconds));
      setEndTimeDraft(formatLoopTime(nextRange.endTimeSeconds));
      setNoteResolution(nextRange);
      setValidationMessage(null);
      onRangeApply(nextRange);
    } catch {
      setValidationMessage(t(mode === "time" ? "invalidTimeRange" : "invalidNoteRange"));
    }
  };

  const resetRange = () => {
    const nextRange = createBandoriTimeLoopRange(
      compiled.timelineDurationSeconds,
      0,
      compiled.timelineDurationSeconds,
    );
    setStartTimeDraft(formatLoopTime(nextRange.startTimeSeconds));
    setEndTimeDraft(formatLoopTime(nextRange.endTimeSeconds));
    setStartNoteDraft("1");
    setEndNoteDraft(String(compiled.maxCombo));
    setNoteResolution(null);
    setValidationMessage(null);
    onRangeApply(nextRange);
  };

  return (
    <SimulatorSettingsCard title={t("title")}>
      <div className="flex justify-start py-4 first:pt-1 sm:justify-center">
        <div className="inline-grid grid-cols-2 rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-1">
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
      </div>

      <form className="space-y-4 py-4 last:pb-1" onSubmit={applyRange}>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "time" ? (
            <>
              <label className="grid gap-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
                {t("startTime")}
                <input
                  type="number"
                  min={0}
                  max={compiled.timelineDurationSeconds}
                  step={0.001}
                  value={startTimeDraft}
                  onChange={(event) => setStartTimeDraft(event.currentTarget.value)}
                  className="h-11 rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden transition focus:border-[var(--theme-color-action-secondary-border)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
                {t("endTime")}
                <input
                  type="number"
                  min={0}
                  max={compiled.timelineDurationSeconds}
                  step={0.001}
                  value={endTimeDraft}
                  onChange={(event) => setEndTimeDraft(event.currentTarget.value)}
                  className="h-11 rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden transition focus:border-[var(--theme-color-action-secondary-border)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
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
                  className="h-11 rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden transition focus:border-[var(--theme-color-action-secondary-border)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
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
                  className="h-11 rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 font-normal tabular-nums text-[var(--theme-color-text-default)] outline-hidden transition focus:border-[var(--theme-color-action-secondary-border)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
                />
              </label>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-transparent bg-[var(--theme-color-action-primary-background)] px-5 text-sm font-semibold text-[var(--theme-color-action-primary-foreground)] shadow-[var(--theme-shadow-action-primary)] outline-hidden transition hover:bg-[var(--theme-color-action-primary-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
          >
            {t("apply")}
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] px-5 text-sm font-semibold text-[var(--theme-color-action-secondary-foreground)] shadow-xs outline-hidden transition hover:bg-[var(--theme-color-action-secondary-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
            onClick={resetRange}
          >
            {t("reset")}
          </button>
        </div>
        {validationMessage ? (
          <p role="alert" className="text-center text-xs font-semibold text-[var(--theme-color-semantic-danger-foreground)]">
            {validationMessage}
          </p>
        ) : null}
      </form>

      <div className="grid items-center gap-2 py-4 last:pb-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
        <span className="text-sm font-semibold text-[var(--theme-color-text-muted)] sm:text-right">
          {t("enabled")}
        </span>
        <Switch
          checked={isEnabled}
          checkedLabel={t("on")}
          label={t("enabled")}
          onCheckedChange={onEnabledChange}
          uncheckedLabel={t("off")}
        />
        <p aria-live="polite" className="sr-only">
          {t("appliedRange", {
            end: formatLoopTime(range.endTimeSeconds),
            start: formatLoopTime(range.startTimeSeconds),
          })}
          {noteResolution
            ? ` ${t("normalizedNoteRange", {
                end: noteResolution.normalizedEndNoteNumber,
                start: noteResolution.normalizedStartNoteNumber,
              })}`
            : ""}
        </p>
      </div>
    </SimulatorSettingsCard>
  );
}

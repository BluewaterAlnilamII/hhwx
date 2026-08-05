"use client";

import { memo, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2, X } from "lucide-react";

import {
  BESTDORI_PREDICTION_COLOR,
  COMPARISON_LINE_COLORS,
  MAX_COMPARISON_LINES,
} from "./constants";
import type {
  ComparisonAlignment,
  ComparisonConfig,
  ComparisonLine,
  ComparisonTargetType,
  TrackingMode,
} from "./types";

type ComparisonTargetOption = {
  id: number;
  label: string;
  isSameEventType?: boolean;
};

type ComparisonControlsProps = {
  bestdoriPrediction: {
    status: string;
  };
  canAddComparisonRow: boolean;
  comparisonAlignment: ComparisonAlignment;
  comparisonConfigs: ComparisonConfig[];
  comparisonLineById: Map<string, ComparisonLine>;
  comparisonTargetLabelMap: Map<number, string>;
  comparisonTargetOptions: ComparisonTargetOption[];
  comparisonTargetType: ComparisonTargetType;
  comparisonTierOptions: readonly number[];
  comparisonTierOptionsByConfigId: ReadonlyMap<string, readonly number[]>;
  onAddComparison: () => void;
  onAlignmentChange: (alignment: ComparisonAlignment) => void;
  onRemoveAllComparisons: () => void;
  onRemoveComparison: (id: string) => void;
  onToggleComparison: (id: string) => void;
  onUpdateComparison: (id: string, patch: Partial<ComparisonConfig>) => void;
  resolvedComparisonConfigs: ComparisonConfig[];
  setShowBestdoriPrediction: Dispatch<SetStateAction<boolean>>;
  setShowDayProjection: Dispatch<SetStateAction<boolean>>;
  setShowInstantProjection: Dispatch<SetStateAction<boolean>>;
  showBestdoriPrediction: boolean;
  showDayProjection: boolean;
  showInstantProjection: boolean;
  status: string;
  trackingMode: TrackingMode;
};

export const ComparisonControls = memo(function ComparisonControls({
  bestdoriPrediction,
  canAddComparisonRow,
  comparisonAlignment,
  comparisonConfigs,
  comparisonLineById,
  comparisonTargetLabelMap,
  comparisonTargetOptions,
  comparisonTargetType,
  comparisonTierOptions,
  comparisonTierOptionsByConfigId,
  onAddComparison,
  onAlignmentChange,
  onRemoveAllComparisons,
  onRemoveComparison,
  onToggleComparison,
  onUpdateComparison,
  resolvedComparisonConfigs,
  setShowBestdoriPrediction,
  setShowDayProjection,
  setShowInstantProjection,
  showBestdoriPrediction,
  showDayProjection,
  showInstantProjection,
  status,
  trackingMode,
}: ComparisonControlsProps) {
  if (trackingMode !== "event" && trackingMode !== "monthly") {
    return null;
  }

  return (
    <div className="border-t border-[var(--theme-color-border-subtle)] px-1 pt-4 dark:border-slate-800/80 sm:px-2">
      <div className="flex flex-col items-center gap-3">
        {status === "进行中" && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-[18px] bg-[var(--theme-color-surface-background)]/85 px-2 py-1.5 dark:bg-slate-900/55 sm:gap-3">
            <button
              type="button"
              aria-pressed={showInstantProjection}
              onClick={() => setShowInstantProjection((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                showInstantProjection
                  ? "border-red-300 bg-white text-red-600 shadow-xs dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                  : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${showInstantProjection ? "bg-red-500" : "bg-gray-300 dark:bg-gray-600"}`} />
              线性投影（瞬时）
            </button>

            <button
              type="button"
              aria-pressed={showDayProjection}
              onClick={() => setShowDayProjection((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                showDayProjection
                  ? "border-blue-300 bg-white text-blue-600 shadow-xs dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                  : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${showDayProjection ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`} />
              线性投影（24h）
            </button>

            {trackingMode === "event" && (
              <button
                type="button"
                aria-pressed={showBestdoriPrediction}
                onClick={() => setShowBestdoriPrediction((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                  showBestdoriPrediction
                    ? "border-slate-400 bg-white text-slate-900 shadow-xs dark:border-slate-400/50 dark:bg-slate-400/15 dark:text-slate-100"
                    : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
                }`}
                title={showBestdoriPrediction && bestdoriPrediction.status === "no-data" ? "Bestdori预测当前不可用" : "显示 Bestdori Prediction"}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${showBestdoriPrediction ? "" : "bg-gray-300 dark:bg-gray-600"}`}
                  style={showBestdoriPrediction ? { backgroundColor: BESTDORI_PREDICTION_COLOR } : undefined}
                />
                Bestdori预测
              </button>
            )}
          </div>
        )}

        {resolvedComparisonConfigs.length > 0 && (
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[18px] bg-[var(--theme-color-surface-background)]/85 px-2 py-1.5 dark:bg-slate-900/45 sm:gap-3">
            {resolvedComparisonConfigs.map((config) => {
              const line = comparisonLineById.get(config.id);
              const color = line?.color ?? COMPARISON_LINE_COLORS[(config.colorIndex ?? 0) % COMPARISON_LINE_COLORS.length];
              const targetLabel = config.targetId !== null
                ? config.targetType === "monthly"
                  ? comparisonTargetLabelMap.get(config.targetId) ?? `月度 ${config.targetId}`
                  : `${config.targetId}期`
                : "-";
              const label = line?.label ?? `${targetLabel} T${config.tier}`;

              return (
                <button
                  key={config.id}
                  type="button"
                  aria-pressed={config.enabled}
                  onClick={() => onToggleComparison(config.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                    config.enabled
                      ? "text-[var(--theme-color-text-default)] dark:text-gray-200"
                      : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-surface-background)] text-[var(--theme-color-text-muted)] opacity-60 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-500"
                  }`}
                  style={config.enabled ? {
                    borderColor: `${color}66`,
                    backgroundColor: `${color}14`,
                  } : undefined}
                  title={label}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${config.enabled ? "" : "opacity-35"}`}
                    style={{ backgroundColor: color }}
                  />
                  <span>{label}</span>
                </button>
              );
            })}

            <div className="inline-flex overflow-hidden rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-xs font-semibold shadow-xs dark:border-gray-700 dark:bg-[#131A2B] sm:text-sm">
              <button
                type="button"
                aria-pressed={comparisonAlignment === "start"}
                onClick={() => onAlignmentChange("start")}
                className={`px-3 py-1.5 outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] ${
                  comparisonAlignment === "start"
                    ? "bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] ring-2 ring-inset ring-[var(--theme-color-selection-strong-ring)]"
                    : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:text-gray-400 dark:hover:bg-blue-500/10"
                }`}
              >
                左对齐
              </button>
              <button
                type="button"
                aria-pressed={comparisonAlignment === "end"}
                onClick={() => onAlignmentChange("end")}
                className={`px-3 py-1.5 outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] ${
                  comparisonAlignment === "end"
                    ? "bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] ring-2 ring-inset ring-[var(--theme-color-selection-strong-ring)]"
                    : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:text-gray-400 dark:hover:bg-blue-500/10"
                }`}
              >
                右对齐
              </button>
            </div>
          </div>
        )}

        <div className="flex w-full flex-col items-center gap-2 border-t border-[var(--theme-color-border-subtle)] pt-3 pb-3 dark:border-slate-800/80 sm:pb-4">
          {comparisonConfigs.map((config) => {
            const rowTierOptions = comparisonTierOptionsByConfigId.get(config.id) ?? comparisonTierOptions;

            return (
              <div key={config.id} className="flex w-full max-w-184 flex-wrap items-center justify-center gap-2">
              <select
                className={`h-8 max-w-full rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 text-xs font-semibold text-[var(--theme-color-text-muted)] outline-hidden transition-colors hover:border-[var(--theme-color-action-secondary-border)] focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300 sm:h-9 sm:text-sm ${
                  comparisonTargetType === "monthly" ? "w-30" : "min-w-52"
                }`}
                value={config.targetId ?? ""}
                onChange={(event) => {
                  const nextTargetId = event.target.value ? Number(event.target.value) : null;
                  onUpdateComparison(config.id, { targetId: nextTargetId });
                }}
              >
                {comparisonTargetOptions.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className={option.isSameEventType ? "font-semibold text-red-600 dark:text-red-300" : undefined}
                    style={option.isSameEventType ? { color: "#dc2626", fontWeight: 600 } : undefined}
                  >
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="h-8 rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 text-xs font-semibold text-[var(--theme-color-text-muted)] outline-hidden transition-colors hover:border-[var(--theme-color-action-secondary-border)] focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300 sm:h-9 sm:text-sm"
                value={config.tier ?? ""}
                onChange={(event) => {
                  const nextTier = event.target.value ? Number(event.target.value) : null;
                  onUpdateComparison(config.id, { tier: nextTier });
                }}
              >
                {rowTierOptions.map((tier) => (
                  <option key={tier} value={tier}>
                    T{tier}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onRemoveComparison(config.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 text-xs font-semibold text-[var(--theme-color-text-muted)] transition-colors hover:border-[var(--theme-color-feedback-error-border)] hover:bg-[var(--theme-color-feedback-error-background)] hover:text-[var(--theme-color-feedback-error-foreground)] dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400 dark:hover:text-red-300 sm:h-9 sm:text-sm"
                aria-label="移除对比行"
              >
                <X size={13} />
                移除
              </button>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onAddComparison}
              disabled={!canAddComparisonRow}
              title={comparisonConfigs.length >= MAX_COMPARISON_LINES ? "最多添加 5 条对比线" : "添加一条空白对比线"}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--theme-color-feedback-success-border)] bg-[var(--theme-color-feedback-success-background)] px-3 text-xs font-semibold text-[var(--theme-color-feedback-success-foreground)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:border-[var(--theme-color-border-subtle)] disabled:bg-[var(--theme-color-control-background)] disabled:text-[var(--theme-color-text-muted)] disabled:opacity-50 dark:text-[var(--theme-color-semantic-success-foreground-on-dark)] dark:disabled:border-gray-700 dark:disabled:bg-[#131A2B] dark:disabled:text-gray-500 sm:h-9 sm:text-sm"
            >
              <Plus size={15} />
              添加对比
            </button>
            {comparisonConfigs.length > 0 && (
              <button
                type="button"
                onClick={onRemoveAllComparisons}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--theme-color-feedback-error-border)] bg-[var(--theme-color-feedback-error-background)] px-3 text-xs font-semibold text-[var(--theme-color-feedback-error-foreground)] transition-colors hover:brightness-95 dark:text-red-300 sm:h-9 sm:text-sm"
                aria-label="移除全部对比线"
                title="移除全部对比线"
              >
                <Trash2 size={14} />
                移除全部
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

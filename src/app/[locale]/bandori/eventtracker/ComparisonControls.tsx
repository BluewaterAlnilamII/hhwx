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
    <div className="border-t border-slate-200/75 px-1 pt-4 dark:border-slate-800/80 sm:px-2">
      <div className="flex flex-col items-center gap-3">
        {status === "进行中" && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-[18px] bg-[#fffef4]/85 px-2 py-1.5 dark:bg-slate-900/55 sm:gap-3">
            <button
              type="button"
              aria-pressed={showInstantProjection}
              onClick={() => setShowInstantProjection((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                showInstantProjection
                  ? "border-red-300 bg-white text-red-600 shadow-sm dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                  : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
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
                  ? "border-blue-300 bg-white text-blue-600 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                  : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
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
                    ? "border-slate-400 bg-white text-slate-900 shadow-sm dark:border-slate-400/50 dark:bg-slate-400/15 dark:text-slate-100"
                    : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
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
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[18px] bg-[#fffef4]/85 px-2 py-1.5 dark:bg-slate-900/45 sm:gap-3">
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
                      ? "text-gray-700 dark:text-gray-200"
                      : "border-gray-200 bg-[#fffef4] text-gray-400 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-500"
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

            <div className="inline-flex overflow-hidden rounded-full border border-gray-200 bg-[#fffef4] text-xs font-semibold shadow-sm dark:border-gray-700 dark:bg-[#131A2B] sm:text-sm">
              <button
                type="button"
                aria-pressed={comparisonAlignment === "start"}
                onClick={() => onAlignmentChange("start")}
                className={`px-3 py-1.5 transition-colors ${
                  comparisonAlignment === "start"
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-500/10"
                }`}
              >
                左对齐
              </button>
              <button
                type="button"
                aria-pressed={comparisonAlignment === "end"}
                onClick={() => onAlignmentChange("end")}
                className={`px-3 py-1.5 transition-colors ${
                  comparisonAlignment === "end"
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-500/10"
                }`}
              >
                右对齐
              </button>
            </div>
          </div>
        )}

        <div className="flex w-full flex-col items-center gap-2 border-t border-slate-200/70 pt-3 pb-3 dark:border-slate-800/80 sm:pb-4">
          {comparisonConfigs.map((config) => {
            const rowTierOptions = comparisonTierOptionsByConfigId.get(config.id) ?? comparisonTierOptions;

            return (
              <div key={config.id} className="flex w-full max-w-[46rem] flex-wrap items-center justify-center gap-2">
              <select
                className={`h-8 max-w-full rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 outline-none transition-colors hover:border-blue-300 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300 sm:h-9 sm:text-sm ${
                  comparisonTargetType === "monthly" ? "w-[7.5rem]" : "min-w-[13rem]"
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
                className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 outline-none transition-colors hover:border-blue-300 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300 sm:h-9 sm:text-sm"
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
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300 sm:h-9 sm:text-sm"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-white disabled:text-gray-300 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:disabled:border-gray-700 dark:disabled:bg-[#131A2B] dark:disabled:text-gray-500 sm:h-9 sm:text-sm"
            >
              <Plus size={15} />
              添加对比
            </button>
            {comparisonConfigs.length > 0 && (
              <button
                type="button"
                onClick={onRemoveAllComparisons}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:border-red-400/50 dark:hover:bg-red-500/15 sm:h-9 sm:text-sm"
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

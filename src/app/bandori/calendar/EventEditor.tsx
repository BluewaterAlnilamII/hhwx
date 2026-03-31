"use client";

import { useState, useCallback } from "react";
import { BAND_COLORS, GbpEvent, useCalendarEditor } from "./useCalendarData";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface EventEditorProps {
  allEvents: GbpEvent[];
  onSaved: () => void;
}

/** 编辑中的活动数据 */
interface EditableEvent {
  event_id: number;
  title: string;
  band_type: string;
  predicted_start: string; // "YYYY-MM-DD"
  predicted_end: string;
  duration_days: number;
  has_rest_day: boolean;
  sort_order: number;
  is_skipped: boolean;
}

/** 从数据库记录中提取可编辑的活动（仅国服尚未开始的） */
function toEditableEvents(events: GbpEvent[]): EditableEvent[] {
  const now = Date.now();

  return events
    .filter(ev => {
      if (ev.cn_start_at && ev.cn_start_at <= now) return false;
      if (!ev.cn_start_at) return true;
      return ev.cn_start_at > now;
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(ev => ({
      event_id: ev.event_id,
      title: ev.event_name_cn || ev.event_name_jp || `活动 #${ev.event_id}`,
      band_type: ev.band_type,
      predicted_start: ev.predicted_start ?? "",
      predicted_end: ev.predicted_end ?? "",
      duration_days: ev.duration_days,
      has_rest_day: ev.has_rest_day,
      sort_order: ev.sort_order,
      is_skipped: ev.is_skipped,
    }));
}

function getLockedUntilDate(events: GbpEvent[]): string | null {
  const now = Date.now();
  const ongoingEvents = events
    .filter((event) => event.cn_start_at && event.cn_end_at && event.cn_start_at <= now && event.cn_end_at >= now)
    .sort((left, right) => Number(right.cn_end_at) - Number(left.cn_end_at));

  if (ongoingEvents.length > 0) {
    return formatDate(new Date(Number(ongoingEvents[0].cn_end_at)));
  }

  const finishedEvents = events
    .filter((event) => event.cn_end_at && event.cn_end_at <= now)
    .sort((left, right) => Number(right.cn_end_at) - Number(left.cn_end_at));

  return finishedEvents.length > 0 ? formatDate(new Date(Number(finishedEvents[0].cn_end_at))) : null;
}

function addDays(dateText: string, days: number): string {
  const date = new Date(dateText + "T00:00:00+08:00");
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/**
 * 级联更新：从指定索引开始，根据 has_rest_day 和 duration_days 重新计算后续活动的日期。
 * 这样可以在拖拽排序、修改开始日期或切换无邦日后，保持后续活动时间链条连续。
 */
function recalculateFrom(events: EditableEvent[], fromIndex: number, lockedUntilDate: string | null): EditableEvent[] {
  const result = [...events];
  for (let i = fromIndex; i < result.length; i++) {
    if (result[i].is_skipped) continue;

    let anchorEndText: string | null = null;
    if (i === 0) {
      anchorEndText = lockedUntilDate;
    } else {
      let prevIdx = i - 1;
      while (prevIdx >= 0 && result[prevIdx].is_skipped) prevIdx--;
      if (prevIdx >= 0 && result[prevIdx].predicted_end) {
        anchorEndText = result[prevIdx].predicted_end;
      }
    }

    if (!anchorEndText) continue;

    const prevEnd = new Date(anchorEndText + "T00:00:00+08:00");
    const restDays = result[i].has_rest_day ? 2 : 1;
    const newStart = new Date(prevEnd);
    newStart.setDate(newStart.getDate() + restDays);

    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + result[i].duration_days - 1);

    result[i] = {
      ...result[i],
      predicted_start: formatDate(newStart),
      predicted_end: formatDate(newEnd),
    };
  }
  return result;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── 可排序行组件 ───

function SortableRow({
  item,
  draggable,
  minDate,
  onChangeStart,
  onChangeEnd,
  onChangeDuration,
  onToggleRestDay,
}: {
  item: EditableEvent;
  draggable: boolean;
  minDate?: string;
  onChangeStart: (id: number, val: string) => void;
  onChangeEnd: (id: number, val: string) => void;
  onChangeDuration: (id: number, val: string) => void;
  onToggleRestDay: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.event_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const stopDragPropagation = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => event.stopPropagation(),
    onMouseDown: (event: React.MouseEvent<HTMLElement>) => event.stopPropagation(),
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => event.stopPropagation(),
  };
  const bandColor = BAND_COLORS[item.band_type as keyof typeof BAND_COLORS] ?? BAND_COLORS.mix;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 py-2 px-2 rounded-lg bg-white/50 backdrop-blur-sm mb-1.5 ${
        item.is_skipped ? "opacity-40" : ""
      }`}
    >
      {draggable ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 text-sm flex-shrink-0 touch-none"
          type="button"
        >
          ☰
        </button>
      ) : (
        <span className="text-gray-300 text-sm flex-shrink-0" aria-hidden="true">
          ☰
        </span>
      )}

      <span
        className="w-1.5 h-8 rounded-full flex-shrink-0"
        style={{ backgroundColor: bandColor }}
        aria-hidden="true"
      />

      <span className="w-[52px] flex-shrink-0 text-xs font-semibold text-gray-600 text-center">
        {item.event_id}
      </span>

      {/* 活动名称 */}
      <span
        className="text-sm truncate min-w-[240px] w-[240px] md:min-w-[280px] md:w-[280px] flex-shrink-0 font-medium text-gray-900"
        title={item.title}
      >
        {item.title}
      </span>

      <div className="ml-auto flex items-center justify-end gap-1.5">
        <input
          {...stopDragPropagation}
          type="date"
          value={item.predicted_start}
          onChange={(e) => onChangeStart(item.event_id, e.target.value)}
          min={minDate}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white/70 w-[110px] flex-shrink-0"
          disabled={item.is_skipped}
        />

        <input
          {...stopDragPropagation}
          type="date"
          value={item.predicted_end}
          onChange={(e) => onChangeEnd(item.event_id, e.target.value)}
          min={item.predicted_start || minDate}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white/70 w-[110px] flex-shrink-0"
          disabled={item.is_skipped}
        />

        <div className="flex items-center gap-1 w-[64px] flex-shrink-0 justify-end">
          <input
            {...stopDragPropagation}
            type="number"
            min={1}
            step={1}
            value={item.duration_days}
            onChange={(e) => onChangeDuration(item.event_id, e.target.value)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white/70 w-[42px] text-center"
            disabled={item.is_skipped}
          />
          <span className="text-xs text-gray-500">天</span>
        </div>

        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer w-[72px] justify-end">
          <input
            {...stopDragPropagation}
            type="checkbox"
            checked={item.has_rest_day}
            onChange={() => onToggleRestDay(item.event_id)}
            className="accent-blue-500"
            disabled={item.is_skipped}
          />
          <span className="text-xs text-gray-500">无邦日</span>
        </label>
      </div>
    </div>
  );
}

// ─── 主编辑器组件 ───

export default function EventEditor({ allEvents, onSaved }: EventEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editableEvents, setEditableEvents] = useState<EditableEvent[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { saveEvents, saving, error } = useCalendarEditor(onSaved);
  const lockedUntilDate = getLockedUntilDate(allEvents);
  const earliestSelectableDate = lockedUntilDate ? addDays(lockedUntilDate, 1) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const openEditor = useCallback(() => {
    setEditableEvents(toEditableEvents(allEvents));
    setSuccessMessage(null);
    setIsOpen(true);
  }, [allEvents]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setEditableEvents(prev => {
      const oldIdx = prev.findIndex(e => e.event_id === active.id);
      const newIdx = prev.findIndex(e => e.event_id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx).map((e, i) => ({
        ...e,
        sort_order: i,
      }));
      // 从移动目标位置开始级联更新
      return recalculateFrom(reordered, Math.min(oldIdx, newIdx), lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleChangeStart = useCallback((id: number, val: string) => {
    setEditableEvents(prev => {
      const idx = prev.findIndex(e => e.event_id === id);
      if (idx === -1 || !val) return prev;

      const updated = [...prev];
      const normalizedValue = earliestSelectableDate && val < earliestSelectableDate ? earliestSelectableDate : val;
      const startDate = new Date(normalizedValue + "T00:00:00+08:00");
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + updated[idx].duration_days - 1);

      updated[idx] = {
        ...updated[idx],
        predicted_start: normalizedValue,
        predicted_end: formatDate(endDate),
      };

      // 同步重算当前活动前是否存在无邦日。
      if (idx > 0) {
        let prevIdx = idx - 1;
        while (prevIdx >= 0 && updated[prevIdx].is_skipped) prevIdx--;
        if (prevIdx >= 0 && updated[prevIdx].predicted_end) {
          const prevEnd = new Date(updated[prevIdx].predicted_end + "T00:00:00+08:00");
          const diffDays = Math.round((startDate.getTime() - prevEnd.getTime()) / 86400000);
          updated[idx] = {
            ...updated[idx],
            has_rest_day: diffDays >= 2,
          };
        }
      } else if (lockedUntilDate) {
        const lockedEnd = new Date(lockedUntilDate + "T00:00:00+08:00");
        const diffDays = Math.round((startDate.getTime() - lockedEnd.getTime()) / 86400000);
        updated[idx] = {
          ...updated[idx],
          has_rest_day: diffDays >= 2,
        };
      }

      // 若新的开始日期越过了后续活动，则重新排序以维持时间顺序。
      const sorted = [...updated].sort((a, b) => {
        if (a.is_skipped !== b.is_skipped) return a.is_skipped ? 1 : -1;
        return (a.predicted_start || "9").localeCompare(b.predicted_start || "9");
      }).map((e, i) => ({ ...e, sort_order: i }));

      const newIdx = sorted.findIndex(e => e.event_id === id);
      return recalculateFrom(sorted, newIdx + 1, lockedUntilDate);
    });
  }, [earliestSelectableDate, lockedUntilDate]);

  const handleChangeEnd = useCallback((id: number, val: string) => {
    setEditableEvents(prev => {
      const idx = prev.findIndex(e => e.event_id === id);
      if (idx === -1 || !val) return prev;

      const updated = [...prev];
      const startDate = new Date(updated[idx].predicted_start + "T00:00:00+08:00");
      const endDate = new Date(val + "T00:00:00+08:00");
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

      if (diffDays < 1) return prev;

      updated[idx] = {
        ...updated[idx],
        predicted_end: val,
        duration_days: diffDays,
      };

      return recalculateFrom(updated, idx + 1, lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleChangeDuration = useCallback((id: number, val: string) => {
    setEditableEvents(prev => {
      const idx = prev.findIndex(e => e.event_id === id);
      const durationDays = parseInt(val, 10);
      if (idx === -1 || Number.isNaN(durationDays) || durationDays < 1) return prev;

      const updated = [...prev];
      const startDate = new Date(updated[idx].predicted_start + "T00:00:00+08:00");
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays - 1);

      updated[idx] = {
        ...updated[idx],
        duration_days: durationDays,
        predicted_end: formatDate(endDate),
      };

      return recalculateFrom(updated, idx + 1, lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleToggleRestDay = useCallback((id: number) => {
    setEditableEvents(prev => {
      const idx = prev.findIndex(e => e.event_id === id);
      if (idx === -1) return prev;

      const updated = [...prev];
      updated[idx] = { ...updated[idx], has_rest_day: !updated[idx].has_rest_day };
      return recalculateFrom(updated, idx, lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleSave = useCallback(() => {
    setSuccessMessage(null);
    if (editableEvents.length === 0) {
      setSuccessMessage("没有需要提交的变更");
      return;
    }

    void saveEvents(
      editableEvents.map(e => ({
        event_id: e.event_id,
        predicted_start: e.predicted_start || null,
        predicted_end: e.predicted_end || null,
        duration_days: e.duration_days,
        has_rest_day: e.has_rest_day,
        sort_order: e.sort_order,
        is_skipped: e.is_skipped,
      }))
    ).then((success) => {
      setSuccessMessage(success ? "提交成功！" : null);
    });
  }, [editableEvents, saveEvents]);

  if (!isOpen) {
    return (
      <div className="mt-4 text-center">
        <button
          onClick={openEditor}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors text-sm"
        >
          编辑活动日程
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">编辑活动日程</h3>
        </div>
        <div className="flex items-center gap-2">
          {successMessage && (
            <span className="text-green-600 text-sm font-medium">{successMessage}</span>
          )}
          {error && (
            <span className="text-red-500 text-sm">{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 disabled:opacity-50 transition-colors text-sm"
          >
            {saving ? "提交中..." : "提交"}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-gray-400 text-white font-medium hover:bg-gray-500 transition-colors text-sm"
          >
            取消
          </button>
        </div>
      </div>

      {/* 列头 */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[900px]">
          <div className="flex items-center gap-1.5 py-1.5 px-2 text-xs text-gray-500 font-medium">
            <span className="w-[16px]" />
            <span className="w-1.5" />
            <span className="w-[52px] text-center">ID</span>
            <span className="w-[240px] md:w-[280px]">活动名</span>
            <div className="ml-auto flex items-center justify-end gap-1.5 text-right">
              <span className="w-[110px] text-center">开始日期</span>
              <span className="w-[110px] text-center">结束日期</span>
              <span className="w-[64px] text-center">天数</span>
              <span className="w-[72px] text-center">无邦日</span>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={editableEvents.map(e => e.event_id)}
              strategy={verticalListSortingStrategy}
            >
            <div className="max-h-[400px] overflow-y-auto pr-1">
              {editableEvents.map(item => (
                <SortableRow
                  key={item.event_id}
                  item={item}
                  draggable
                  minDate={earliestSelectableDate}
                  onChangeStart={handleChangeStart}
                  onChangeEnd={handleChangeEnd}
                  onChangeDuration={handleChangeDuration}
                  onToggleRestDay={handleToggleRestDay}
                />
              ))}
            </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

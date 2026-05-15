"use client";

import { useState, useCallback } from "react";
import { BAND_COLORS, BandoriCalendarRecord, useCalendarEditor } from "./useCalendarData";
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
  allEvents: BandoriCalendarRecord[];
  onSaved: () => void;
}

interface EditableEvent {
  eventId: number;
  title: string;
  band: string;
  predictedStart: string;
  predictedEnd: string;
  durationDays: number;
  hasRestDay: boolean;
  sortOrder: number;
  hasScheduleSupplement: boolean;
}

function toEditableEvents(events: BandoriCalendarRecord[]): EditableEvent[] {
  const now = Date.now();

  return events
    .filter((event) => {
      if (event.cnStartAt && event.cnStartAt <= now) {
        return false;
      }

      if (event.cnStartAt && !event.hasScheduleSupplement) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((event) => ({
      eventId: event.eventId,
      title: event.eventNameCn || event.eventNameJp || `活动 #${event.eventId}`,
      band: event.band,
      predictedStart: event.predictedStart ?? "",
      predictedEnd: event.predictedEnd ?? "",
      durationDays: event.durationDays,
      hasRestDay: event.hasRestDay,
      sortOrder: event.sortOrder,
      hasScheduleSupplement: event.hasScheduleSupplement,
    }));
}

function getLockedUntilDate(events: BandoriCalendarRecord[]): string | null {
  const now = Date.now();
  const ongoingEvents = events
    .filter((event) => event.cnStartAt && event.cnEndAt && event.cnStartAt <= now && event.cnEndAt >= now)
    .sort((left, right) => Number(right.cnEndAt) - Number(left.cnEndAt));

  if (ongoingEvents.length > 0) {
    return formatDate(new Date(Number(ongoingEvents[0].cnEndAt)));
  }

  const finishedEvents = events
    .filter((event) => event.cnEndAt && event.cnEndAt <= now)
    .sort((left, right) => Number(right.cnEndAt) - Number(left.cnEndAt));

  return finishedEvents.length > 0 ? formatDate(new Date(Number(finishedEvents[0].cnEndAt))) : null;
}

function addDays(dateText: string, days: number): string {
  const date = new Date(dateText + "T00:00:00+08:00");
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function recalculateFrom(events: EditableEvent[], fromIndex: number, lockedUntilDate: string | null): EditableEvent[] {
  const result = [...events];

  for (let index = fromIndex; index < result.length; index += 1) {
    let anchorEndText: string | null = null;
    if (index === 0) {
      anchorEndText = lockedUntilDate;
    } else if (result[index - 1].predictedEnd) {
      anchorEndText = result[index - 1].predictedEnd;
    }

    if (!anchorEndText) {
      continue;
    }

    const previousEnd = new Date(anchorEndText + "T00:00:00+08:00");
    const restDays = result[index].hasRestDay ? 2 : 1;
    const newStart = new Date(previousEnd);
    newStart.setDate(newStart.getDate() + restDays);

    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + result[index].durationDays - 1);

    result[index] = {
      ...result[index],
      predictedStart: formatDate(newStart),
      predictedEnd: formatDate(newEnd),
    };
  }

  return result;
}

function renumberEvents(events: EditableEvent[]): EditableEvent[] {
  return events.map((event, index) => ({
    ...event,
    sortOrder: index,
  }));
}

function renumberAndRecalculateFrom(
  events: EditableEvent[],
  fromIndex: number,
  lockedUntilDate: string | null,
): EditableEvent[] {
  return recalculateFrom(renumberEvents(events), Math.max(0, fromIndex), lockedUntilDate);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function SortableRow({
  item,
  draggable,
  minDate,
  onChangeStart,
  onChangeEnd,
  onChangeDuration,
  onToggleRestDay,
  onClearSchedule,
}: {
  item: EditableEvent;
  draggable: boolean;
  minDate?: string;
  onChangeStart: (id: number, value: string) => void;
  onChangeEnd: (id: number, value: string) => void;
  onChangeDuration: (id: number, value: string) => void;
  onToggleRestDay: (id: number) => void;
  onClearSchedule: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.eventId });

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
  const bandColor = BAND_COLORS[item.band as keyof typeof BAND_COLORS] ?? BAND_COLORS.mix;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 py-2 px-2 rounded-lg bg-white/50 backdrop-blur-sm mb-1.5"
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
        {item.eventId}
      </span>

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
          value={item.predictedStart}
          onChange={(event) => onChangeStart(item.eventId, event.target.value)}
          min={minDate}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white/70 w-[110px] flex-shrink-0"
        />

        <input
          {...stopDragPropagation}
          type="date"
          value={item.predictedEnd}
          onChange={(event) => onChangeEnd(item.eventId, event.target.value)}
          min={item.predictedStart || minDate}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white/70 w-[110px] flex-shrink-0"
        />

        <div className="flex items-center gap-1 w-[64px] flex-shrink-0 justify-end">
          <input
            {...stopDragPropagation}
            type="number"
            min={1}
            step={1}
            value={item.durationDays}
            onChange={(event) => onChangeDuration(item.eventId, event.target.value)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white/70 w-[42px] text-center"
          />
          <span className="text-xs text-gray-500">天</span>
        </div>

        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer w-[72px] justify-end">
          <input
            {...stopDragPropagation}
            type="checkbox"
            checked={item.hasRestDay}
            onChange={() => onToggleRestDay(item.eventId)}
            className="accent-blue-500"
          />
          <span className="text-xs text-gray-500">无邦日</span>
        </label>

        <button
          {...stopDragPropagation}
          type="button"
          onClick={() => onClearSchedule(item.eventId)}
          className="text-xs text-gray-500 hover:text-red-500 transition-colors w-[44px] flex-shrink-0 text-right"
        >
          清空
        </button>
      </div>
    </div>
  );
}

export default function EventEditor({ allEvents, onSaved }: EventEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editableEvents, setEditableEvents] = useState<EditableEvent[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { saveEvents, saving, error } = useCalendarEditor(onSaved);
  const lockedUntilDate = getLockedUntilDate(allEvents);
  const earliestSelectableDate = lockedUntilDate ? addDays(lockedUntilDate, 1) : undefined;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openEditor = useCallback(() => {
    setEditableEvents(toEditableEvents(allEvents));
    setSuccessMessage(null);
    setIsOpen(true);
  }, [allEvents]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setEditableEvents((previous) => {
      const oldIndex = previous.findIndex((item) => item.eventId === active.id);
      const newIndex = previous.findIndex((item) => item.eventId === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return previous;
      }

      const reordered = arrayMove(previous, oldIndex, newIndex);
      return renumberAndRecalculateFrom(reordered, Math.min(oldIndex, newIndex), lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleChangeStart = useCallback((id: number, value: string) => {
    setEditableEvents((previous) => {
      const index = previous.findIndex((item) => item.eventId === id);
      if (index === -1 || !value) {
        return previous;
      }

      const updated = [...previous];
      const normalizedValue = earliestSelectableDate && value < earliestSelectableDate ? earliestSelectableDate : value;
      const startDate = new Date(normalizedValue + "T00:00:00+08:00");
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + updated[index].durationDays - 1);

      updated[index] = {
        ...updated[index],
        predictedStart: normalizedValue,
        predictedEnd: formatDate(endDate),
      };

      if (index > 0 && updated[index - 1].predictedEnd) {
        const previousEnd = new Date(updated[index - 1].predictedEnd + "T00:00:00+08:00");
        const diffDays = Math.round((startDate.getTime() - previousEnd.getTime()) / 86400000);
        updated[index] = {
          ...updated[index],
          hasRestDay: diffDays >= 2,
        };
      } else if (lockedUntilDate) {
        const lockedEnd = new Date(lockedUntilDate + "T00:00:00+08:00");
        const diffDays = Math.round((startDate.getTime() - lockedEnd.getTime()) / 86400000);
        updated[index] = {
          ...updated[index],
          hasRestDay: diffDays >= 2,
        };
      }

      const sorted = [...updated]
        .sort((left, right) => (left.predictedStart || "9").localeCompare(right.predictedStart || "9"))
        .map((item, sortIndex) => ({ ...item, sortOrder: sortIndex }));

      const newIndex = sorted.findIndex((item) => item.eventId === id);
      return renumberAndRecalculateFrom(sorted, newIndex + 1, lockedUntilDate);
    });
  }, [earliestSelectableDate, lockedUntilDate]);

  const handleChangeEnd = useCallback((id: number, value: string) => {
    setEditableEvents((previous) => {
      const index = previous.findIndex((item) => item.eventId === id);
      if (index === -1 || !value || !previous[index].predictedStart) {
        return previous;
      }

      const updated = [...previous];
      const startDate = new Date(updated[index].predictedStart + "T00:00:00+08:00");
      const endDate = new Date(value + "T00:00:00+08:00");
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      if (diffDays < 1) {
        return previous;
      }

      updated[index] = {
        ...updated[index],
        predictedEnd: value,
        durationDays: diffDays,
      };

      return renumberAndRecalculateFrom(updated, index + 1, lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleChangeDuration = useCallback((id: number, value: string) => {
    setEditableEvents((previous) => {
      const index = previous.findIndex((item) => item.eventId === id);
      const durationDays = parseInt(value, 10);
      if (index === -1 || Number.isNaN(durationDays) || durationDays < 1 || !previous[index].predictedStart) {
        return previous;
      }

      const updated = [...previous];
      const startDate = new Date(updated[index].predictedStart + "T00:00:00+08:00");
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays - 1);

      updated[index] = {
        ...updated[index],
        durationDays,
        predictedEnd: formatDate(endDate),
      };

      return renumberAndRecalculateFrom(updated, index + 1, lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleToggleRestDay = useCallback((id: number) => {
    setEditableEvents((previous) => {
      const index = previous.findIndex((item) => item.eventId === id);
      if (index === -1) {
        return previous;
      }

      const updated = [...previous];
      updated[index] = { ...updated[index], hasRestDay: !updated[index].hasRestDay };
      return renumberAndRecalculateFrom(updated, index, lockedUntilDate);
    });
  }, [lockedUntilDate]);

  const handleClearSchedule = useCallback((id: number) => {
    setEditableEvents((previous) => previous.map((item) => {
      if (item.eventId !== id) {
        return item;
      }

      return {
        ...item,
        predictedStart: "",
        predictedEnd: "",
      };
    }));
  }, []);

  const handleSave = useCallback(() => {
    setSuccessMessage(null);

    const payload = editableEvents
      .filter((event) => event.hasScheduleSupplement || event.predictedStart || event.predictedEnd)
      .map((event) => ({
        eventId: event.eventId,
        predictedStart: event.predictedStart || null,
        predictedEnd: event.predictedEnd || null,
        durationDays: event.durationDays,
        hasRestDay: event.hasRestDay,
        sortOrder: event.sortOrder,
      }));

    if (payload.length === 0) {
      setSuccessMessage("没有需要提交的变更");
      return;
    }

    void saveEvents(payload).then((success) => {
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
          {successMessage && <span className="text-green-600 text-sm font-medium">{successMessage}</span>}
          {error && <span className="text-red-500 text-sm">{error}</span>}
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
              items={editableEvents.map((event) => event.eventId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="max-h-[400px] overflow-y-auto pr-1">
                {editableEvents.map((item) => (
                  <SortableRow
                    key={item.eventId}
                    item={item}
                    draggable
                    minDate={earliestSelectableDate}
                    onChangeStart={handleChangeStart}
                    onChangeEnd={handleChangeEnd}
                    onChangeDuration={handleChangeDuration}
                    onToggleRestDay={handleToggleRestDay}
                    onClearSchedule={handleClearSchedule}
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

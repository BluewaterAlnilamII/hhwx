"use client";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type CollisionDetection, type Modifiers } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";

export default function ProfileSortList({ ids, onOrder, children, collisionDetection = closestCenter, modifiers, touchHold = false }: {
  ids: string[]; onOrder: (ids: string[], movedId: string) => void; children: ReactNode; collisionDetection?: CollisionDetection;
  modifiers?: Modifiers; touchHold?: boolean;
}) {
  const id = useId();
  const linkDrag = useRef<AbortController | null>(null);
  useEffect(() => () => linkDrag.current?.abort(), []);
  const t = useTranslations("account.homepage");
  const holdSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), touchHold ? holdSensor : null,
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return <DndContext id={id} sensors={sensors} modifiers={modifiers} collisionDetection={collisionDetection} accessibility={{
    screenReaderInstructions: { draggable: t("reorderInstructions") },
    announcements: {
      onDragStart: () => t("reorderPicked"),
      onDragOver: ({ over }) => over ? t("reorderPosition", { position: ids.indexOf(String(over.id)) + 1 }) : undefined,
      onDragEnd: ({ over }) => over ? t("reorderPlaced", { position: ids.indexOf(String(over.id)) + 1 }) : t("reorderCanceled"),
      onDragCancel: () => t("reorderCanceled"),
    },
  }} onDragStart={({ activatorEvent }) => {
    if (!(activatorEvent.target instanceof Element) || !activatorEvent.target.closest("a[href]")) return;
    // dnd-kit stops click propagation after a drop, but the browser still follows a native link.
    linkDrag.current?.abort();
    const guard = new AbortController();
    linkDrag.current = guard;
    const options = { capture: true, signal: guard.signal };
    window.addEventListener("click", event => {
      if (event.detail) { event.preventDefault(); event.stopPropagation(); }
      guard.abort();
    }, options);
    window.addEventListener("pointerdown", () => guard.abort(), options);
  }} onDragEnd={({ active, over }) => {
    if (over && active.id !== over.id) onOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))), String(active.id));
  }}><SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext></DndContext>;
}

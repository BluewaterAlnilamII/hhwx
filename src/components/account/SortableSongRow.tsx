"use client";

import type { CSSProperties, ReactNode, RefCallback } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./FavoriteSongList.module.css";

export type SongSortControls = {
  rowRef: RefCallback<HTMLElement>; style: CSSProperties; dragging: boolean; handle: ReactNode; listeners: DraggableSyntheticListeners;
};

export default function SortableSongRow({ id, title, editing, disabled, children }: {
  id: string; title: string; editing: boolean; disabled: boolean; children: (controls: SongSortControls) => ReactNode;
}) {
  const t = useTranslations("account.homepage");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const label = t("reorder", { name: title });
  return children({ rowRef: setNodeRef, listeners, style: { transform: CSS.Transform.toString(transform && { ...transform, x: 0 }), transition },
    dragging: isDragging, handle: editing && <button type="button" className={styles.handle} ref={setActivatorNodeRef}
      {...attributes} onPointerDown={e => listeners?.onPointerDown?.(e)} onKeyDown={e => listeners?.onKeyDown?.(e)}
      aria-disabled={disabled} aria-label={label} title={label}><GripVertical size={17} /></button> });
}

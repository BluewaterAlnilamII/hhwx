"use client";

import { closestCenter, type CollisionDetection, type Modifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImageIcon, Triangle } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef } from "react";
import ActionFeedback from "@/components/ActionFeedback";
import { Link } from "@/i18n/navigation";
import type { ActionFeedbackState } from "@/hooks/useActionFeedback";
import { CARD_PREVIEW_DIVIDER, CARD_PREVIEW_MAX, favoriteCardDrop, type FavoriteCardLayout } from "@/lib/bandori/favorites";
import ProfileSortList from "./ProfileSortList";
import styles from "./ProfileFavorites.module.css";

export type CardEditorProps = {
  previewCount: number;
  saving: boolean;
  onLayout: (layout: FavoriteCardLayout, moved: string) => void;
  feedbackFor: (target: string) => ActionFeedbackState | null;
};

function EditorRow({ id, label, disabled, divider, extra, feedback, children }: {
  id: string; label: string; disabled: boolean; divider?: boolean; extra?: boolean; feedback: ActionFeedbackState | null; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = <button type="button" ref={setActivatorNodeRef} {...attributes} aria-disabled={disabled}
    onPointerDown={e => listeners?.onPointerDown?.(e)} onKeyDown={e => listeners?.onKeyDown?.(e)}
    aria-label={label} title={label} className={divider ? styles.dividerHandle : styles.dragHandle}>
    {divider ? children : <GripVertical size={17} aria-hidden="true" />}
  </button>;
  const rowContent = (target: EventTarget) => target instanceof Element && !target.closest("button");
  return <div ref={setNodeRef} data-sort-id={id} data-card={divider ? undefined : id} data-collection-extra={extra || undefined}
    data-draggable={!divider && !disabled || undefined} data-dragging={isDragging} className={styles.editorRow}
    onPointerDown={e => { if (e.pointerType !== "touch" && rowContent(e.target)) listeners?.onPointerDown?.(e); }}
    onTouchStart={e => { if (rowContent(e.target)) listeners?.onTouchStart?.(e); }}
    onContextMenu={e => { if (isDragging) e.preventDefault(); }}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    {handle}{!divider && children}
    <ActionFeedback feedback={feedback} className="right-2 top-1/2 -translate-y-1/2" />
  </div>;
}

type EditorCard = { target: string; href: string; title: string; name: string; band: string | null; art: string | null; actions: ReactNode };

export default function FavoriteCardEditor({ cards, previewCount, saving, onLayout, feedbackFor }: CardEditorProps & { cards: EditorCard[] }) {
  const t = useTranslations("account.homepage");
  const action = useTranslations("account.favorites");
  const visible = Math.min(previewCount, cards.length);
  const list = useRef<HTMLDivElement>(null);
  const targets = cards.map(card => card.target);
  const ids = [...targets];
  ids.splice(visible, 0, CARD_PREVIEW_DIVIDER);
  const legalStops = new Set(ids.slice(1, Math.min(cards.length, CARD_PREVIEW_MAX) + 1));
  const collision: CollisionDetection = args => closestCenter(args.active.id === CARD_PREVIEW_DIVIDER
    ? { ...args, droppableContainers: args.droppableContainers.filter(row => legalStops.has(String(row.id))) } : args);
  const restrictDrag: Modifier = ({ active, draggingNodeRect, transform }) => {
    const vertical = { ...transform, x: 0 };
    if (active?.id !== CARD_PREVIEW_DIVIDER || !draggingNodeRect || !list.current) return vertical;
    const rows = list.current.children;
    let firstHeight = 0, totalHeight = 0, count = 0;
    for (let i = 0; i < rows.length && count < CARD_PREVIEW_MAX; i++) {
      const row = rows[i] as HTMLElement;
      if (!row.dataset.sortId || row.dataset.sortId === CARD_PREVIEW_DIVIDER) continue;
      totalHeight += row.offsetHeight;
      if (++count === 1) firstHeight = totalHeight;
    }
    const top = list.current.getBoundingClientRect().top - draggingNodeRect.top;
    return { ...vertical, y: Math.max(top + firstHeight, Math.min(top + totalHeight, transform.y)) };
  };
  const rows = cards.map(({ target, href, title, name, band, art, actions }, index) =>
    <EditorRow key={target} id={target} label={t("reorder", { name: [name, title].filter(Boolean).join(" - ") })}
      extra={index >= visible} disabled={saving || cards.length === 1} feedback={feedbackFor(target)}>
      <Link href={href} prefetch={false} draggable={false} className={styles.editorLink} aria-label={[name, title].filter(Boolean).join(" - ")}>
        {art
          ? <Image unoptimized draggable={false} src={art} width={40} height={40} alt="" className={styles.editorThumb} />
          : <span className={styles.editorThumb}><ImageIcon size={16} aria-hidden="true" /></span>}
        <div className={styles.editorNames}>
          {name && <span className={styles.editorCharacter}>{band && <Image unoptimized draggable={false} src={band} alt="" width={16} height={16} />}<span>{name}</span></span>}
          <span className={styles.editorTitle}>{title}</span>
        </div>
      </Link>
      {actions}
    </EditorRow>);
  rows.splice(visible, 0,
    <EditorRow key={CARD_PREVIEW_DIVIDER} id={CARD_PREVIEW_DIVIDER} label={action("previewDivider", { count: visible })}
      divider disabled={saving || cards.length === 1} feedback={feedbackFor(CARD_PREVIEW_DIVIDER)}>
      <span className={styles.dividerMark} aria-hidden="true"><Triangle size={9} fill="currentColor" />
        <span className={styles.dividerTicks}>{Array.from({ length: CARD_PREVIEW_MAX }, (_, i) =>
          <i key={i} data-filled={i < visible} />)}</span>
      </span>
    </EditorRow>);
  return <div ref={list}><ProfileSortList touchHold ids={ids} collisionDetection={collision} modifiers={[restrictDrag]} onOrder={(sorted, moved) => {
      const layout = favoriteCardDrop(sorted, moved);
      if (layout.previewCount !== previewCount || layout.targets.some((target, i) => target !== targets[i])) onLayout(layout, moved);
  }}>{rows}</ProfileSortList></div>;
}

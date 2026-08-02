"use client";

import { type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import BandoriCardPicker from "@/components/bandori/card-picker/BandoriCardPicker";
import { type BandoriCardPickerValue } from "@/components/bandori/card-picker/types";
import { type BandoriCardsMissingCardFallback } from "@/hooks/useBandoriCardsMaster";
import { type BandoriCardServer } from "@/lib/bandori-card-server-extensions";
import { type BandoriCharacterMaster, type BandoriSkillMaster } from "@/lib/bandori-card-master";
import { type BandoriCardsMasterMap } from "@/lib/bandori-cards-api-client";

export type BandoriCardPickerDialogProps = {
  isOpen: boolean;
  title: string;
  closeLabel: string;
  value: BandoriCardPickerValue | null;
  server: BandoriCardServer;
  missingCardFallback: BandoriCardsMissingCardFallback;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  cardMetadata?: BandoriCardsMasterMap;
  characters?: Record<string, BandoriCharacterMaster | null | undefined>;
  skills?: Record<string, BandoriSkillMaster | null | undefined>;
  mutedCardIds?: ReadonlySet<number>;
  onValueChange: (value: BandoriCardPickerValue | null) => void;
  onClose: () => void;
};

export default function BandoriCardPickerDialog({
  isOpen,
  title,
  closeLabel,
  value,
  server,
  missingCardFallback,
  scrollElementRef,
  cardMetadata,
  characters,
  skills,
  mutedCardIds,
  onValueChange,
  onClose,
}: BandoriCardPickerDialogProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1000 bg-slate-950/55" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-1000 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl focus:outline-hidden sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
            <Dialog.Title className="min-w-0 text-lg font-bold text-slate-900">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                title={closeLabel}
                aria-label={closeLabel}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div ref={scrollElementRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
            <BandoriCardPicker
              value={value}
              onValueChange={onValueChange}
              server={server}
              missingCardFallback={missingCardFallback}
              showArtToggle={false}
              scrollElementRef={scrollElementRef}
              cardMetadata={cardMetadata}
              characters={characters}
              skills={skills}
              mutedCardIds={mutedCardIds}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronUp, History, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getBandoriServerTimeZone, type BandoriServer } from "@/lib/bandori-server";
import { cn } from "@/lib/utils";
import { CALCULATOR_FIELD_DEFAULTS, CP_COSTS, FLAME_COSTS, getPlayDurationParts, type CalculatorDraft, type EventPtResult } from "./event-pt-calculator";

export const CALCULATOR_DESKTOP_QUERY = "(min-width: 1280px)";
export const CALCULATOR_COLLAPSED_RATIO = 0.57;
function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(CALCULATOR_DESKTOP_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const desktopSnapshot = () => window.matchMedia(CALCULATOR_DESKTOP_QUERY).matches;
const serverSnapshot = () => false;
const controlClass = "event-calculator-control hhwx-control min-w-0 w-full rounded-lg border tabular-nums";
const iconClass = "hhwx-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border xl:h-8 xl:w-8 xl:[&>svg]:size-4";
const formatIntegerInput = (value: string) => /^\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : value;

type Props = {
  open: boolean;
  visible: boolean;
  autoFocus: boolean;
  draft: CalculatorDraft;
  baselineAt: number;
  endAt: number;
  naturalFlames: number;
  result: EventPtResult | null;
  eventType: string;
  server: BandoriServer;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onChange: (field: keyof CalculatorDraft, value: string) => void;
  onRefresh: () => void;
  onClose: () => void;
};

export function EventPtCalculator({ open, visible, autoFocus, draft, baselineAt, endAt, naturalFlames, result, eventType, server, triggerRef, onChange, onRefresh, onClose }: Props) {
  const t = useTranslations("bandori.events.calculator");
  const teamT = useTranslations("bandori.teamBuilder");
  const locale = useLocale();
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const [expanded, setExpanded] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const fields = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const id = useId();
  const challenge = eventType === "challenge";
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const time = new Intl.DateTimeFormat(locale, { timeZone: getBandoriServerTimeZone(server), month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(baselineAt);
  const drinkFields = [draft.smallDrinks, draft.largeDrinks];
  const validDrinks = drinkFields.every(value => Number.isSafeInteger(Number(value)) && Number(value) >= 0);
  const drinkFlames = Number(draft.smallDrinks) + 10 * Number(draft.largeDrinks);
  const plan = result?.target ?? result?.budget;
  const games = plan ? challenge ? t("challengeGames", { normal: number(plan.normalGames), challenge: number(plan.challengeGames) }) : t("normalGames", { count: number(plan.normalGames) }) : "";
  const duration = plan ? getPlayDurationParts(plan.minutes).map(({ unit, count }) => t(unit, { count: number(count) })).join(locale.startsWith("zh") ? "" : " ") : "";

  useLayoutEffect(() => {
    if (!open) { wasOpen.current = false; return; }
    const opening = !wasOpen.current;
    const keepFocusedFieldVisible = () => {
      const active = document.activeElement;
      const body = fields.current;
      if (!(active instanceof HTMLElement) || !body?.contains(active)) return;
      const inputRect = active.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      body.scrollTop += Math.max(0, inputRect.bottom - bodyRect.bottom + 8)
        + Math.min(0, inputRect.top - bodyRect.top - 8);
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(keepFocusedFieldVisible); };
    const observer = new ResizeObserver(schedule);
    let body: HTMLDivElement | null = null;
    let entry: Animation | undefined;
    // The mobile Dialog.Portal attaches its content after the parent's layout effect.
    const mountFrame = requestAnimationFrame(() => {
      wasOpen.current = true;
      // Restoring a hidden tab must not replay an opening or take focus from its tab button.
      if (opening && visible && autoFocus) {
        panel.current?.focus({ preventScroll: true });
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          entry = panel.current?.animate(desktop
            ? [{ transform: "translateX(1rem)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }]
            : [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
          { duration: desktop ? 240 : 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
        }
      }
      body = fields.current;
      if (body) observer.observe(body);
      body?.addEventListener("focusin", schedule);
      schedule();
    });
    return () => {
      cancelAnimationFrame(mountFrame);
      cancelAnimationFrame(frame);
      entry?.cancel();
      observer.disconnect();
      body?.removeEventListener("focusin", schedule);
    };
  }, [desktop, open, visible, autoFocus]);

  function field(key: keyof CalculatorDraft, label: string, options: { unit?: string; min?: number; step?: number; hideLabel?: boolean; placeholder?: string } = {}) {
    const value = draft[key];
    const integer = options.step === undefined;
    const invalid = value !== "" && (!Number.isFinite(Number(value)) || Number(value) < (options.min ?? 0) || (options.step === undefined && !Number.isSafeInteger(Number(value))));
    return <div className="event-calculator-field grid min-w-0 text-[var(--theme-color-text-muted)]">
      <label htmlFor={`${id}-${key}`} id={`${id}-${key}-label`} className={options.hideLabel ? "sr-only" : undefined}>{label}</label>
      <span className="event-calculator-input-row">
        <span className="event-calculator-control-wrap">
        <input id={`${id}-${key}`} name={key} type={integer ? "text" : "number"} inputMode={integer ? "numeric" : "decimal"}
          className={controlClass} value={integer ? formatIntegerInput(value) : value} min={options.min ?? 0} step={options.step ?? 1}
          placeholder={options.placeholder ?? CALCULATOR_FIELD_DEFAULTS[key]}
          aria-describedby={invalid ? `${id}-${key}-error` : undefined}
          aria-labelledby={`${id}-${key}-label`} aria-invalid={invalid || undefined}
          onKeyDown={event => {
            if (!integer || event.altKey || event.ctrlKey || event.metaKey) return;
            const input = event.currentTarget;
            const start = input.selectionStart;
            if (start === null || start !== input.selectionEnd) return;
            if (event.key === "Backspace" && input.value[start - 1] === ",") input.setSelectionRange(start - 1, start - 1);
            if (event.key === "Delete" && input.value[start] === ",") input.setSelectionRange(start + 1, start + 1);
          }}
          onChange={event => {
            const input = event.currentTarget;
            if (!integer) { onChange(key, input.value); return; }
            const raw = input.value.replace(/,/g, "");
            let remaining = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/,/g, "").length;
            const formatted = formatIntegerInput(raw);
            let cursor = 0;
            while (remaining > 0 && cursor < formatted.length) {
              if (formatted[cursor] !== ",") remaining--;
              cursor++;
            }
            input.value = formatted;
            input.setSelectionRange(cursor, cursor);
            onChange(key, raw);
          }} />
        </span>
        {options.unit ? <span className="event-calculator-unit shrink-0 font-normal">{options.unit}</span> : null}
      </span>
      {invalid ? <span id={`${id}-${key}-error`} className="text-xs font-normal text-[var(--theme-color-semantic-danger-foreground)]">{t("invalidValue", { min: options.min ?? 0 })}</span> : null}
    </div>;
  }
  function costSelect(key: keyof CalculatorDraft, label: string, costs: readonly number[], unit: "flames" | "cp", hideLabel = false) {
    return <div className="event-calculator-field grid min-w-0 text-[var(--theme-color-text-muted)]">
      <label htmlFor={`${id}-${key}`} id={`${id}-${key}-label`} className={hideLabel ? "sr-only" : undefined}>{label}</label>
      <span className="event-calculator-control-wrap">
      <select id={`${id}-${key}`} name={key} aria-labelledby={`${id}-${key}-label`} className={controlClass} value={draft[key]} onChange={event => onChange(key, event.target.value)}>
        {costs.map(cost => <option key={cost} value={cost}>{t(unit, { count: cost })}</option>)}
      </select>
      </span>
    </div>;
  }
  const content = <Dialog.Content ref={panel} id="event-pt-calculator" aria-describedby={undefined} tabIndex={-1}
    data-view-active={visible} inert={!desktop && !visible}
    onInteractOutside={event => event.preventDefault()}
    onOpenAutoFocus={event => event.preventDefault()}
    onCloseAutoFocus={event => { event.preventDefault(); if (!open) { setExpanded(false); triggerRef.current?.focus({ preventScroll: true }); } }}
    onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "height") delete event.currentTarget.dataset.sizeMotion; }}
    style={{ "--calculator-height-ratio": expanded ? 0.88 : CALCULATOR_COLLAPSED_RATIO } as CSSProperties}
    className={cn("event-pt-calculator hhwx-floating-surface flex min-h-0 flex-col overflow-hidden border outline-hidden",
      desktop ? "event-pt-calculator-sidebar sticky top-20 z-10 w-90 justify-self-end rounded-2xl" : "event-pt-calculator-sheet fixed inset-x-0 z-[100] rounded-t-2xl pb-2")}>
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--theme-color-border-subtle)] px-4 py-2 xl:pt-3">
      <Dialog.Title className="mr-auto text-base font-bold">{t("title")}</Dialog.Title>
      {!desktop ? <button type="button" className={iconClass} aria-expanded={expanded} aria-label={t(expanded ? "collapse" : "expand")} title={t(expanded ? "collapse" : "expand")} onClick={() => {
        if (panel.current) panel.current.dataset.sizeMotion = expanded ? "collapse" : "expand";
        setExpanded(value => !value);
      }}>
        <ChevronUp size={18} aria-hidden className={cn("motion-safe:transition-transform motion-safe:duration-200", expanded && "rotate-180")} />
      </button> : null}
      <Dialog.Close className={iconClass} aria-label={t("close")} title={t("close")}><X size={18} aria-hidden /></Dialog.Close>
    </header>
    <div ref={fields} className="event-pt-calculator-fields min-h-0 flex-1 overflow-y-auto overscroll-contain styling-scrollbar xl:[scrollbar-gutter:stable]">
      <section aria-labelledby={`${id}-activity`} className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${id}-activity`} className="text-sm font-bold text-[var(--theme-color-semantic-info-foreground)]">{t("activity")}</h3>
          <div className="flex items-center gap-1 text-xs tabular-nums text-[var(--theme-color-text-muted)]">
            <time dateTime={new Date(baselineAt).toISOString()}>{time}</time>
            <button type="button" className={iconClass} aria-label={t("refreshTime")} title={t("refreshTime")} onClick={onRefresh}><History size={17} aria-hidden /></button>
          </div>
        </div>
        <dl className="event-calculator-overview grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div><dt className="text-[var(--theme-color-text-muted)]">{t("eventType")}</dt><dd className="mt-1 font-semibold">{teamT.has(`eventTypes.${eventType}`) ? teamT(`eventTypes.${eventType}`) : eventType}</dd></div>
          <div><dt className="text-[var(--theme-color-text-muted)]">{t("remainingTime")}</dt><dd className="mt-1 font-semibold">{t("hours", { count: number(Math.max(0, endAt - baselineAt) / 3_600_000) })}</dd></div>
          <div><dt className="text-[var(--theme-color-text-muted)]">{t("naturalFlames")}</dt><dd className="mt-1 font-semibold">{t("flames", { count: number(naturalFlames) })}</dd></div>
          <div><dt className="sr-only">{t("wastedFlames")}</dt><dd>{field("wastedFlames", t("wastedFlames"))}</dd></div>
        </dl>
        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-semibold text-[var(--theme-color-text-muted)]">{t("flameEfficiency")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {costSelect("measuredFlames", t("measuredFlames"), [0, ...FLAME_COSTS], "flames", true)}
            {field("flamePt", t("flamePt"), { min: 1, unit: t("pointUnit"), hideLabel: true, placeholder: t("enterValue") })}
          </div>
        </fieldset>
        {challenge ? <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-semibold text-[var(--theme-color-text-muted)]">{t("cpEfficiency")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {costSelect("measuredCp", t("measuredCp"), CP_COSTS, "cp", true)}
            {field("cpPt", t("cpPt"), { min: 1, unit: t("pointUnit"), hideLabel: true, placeholder: t("enterValue") })}
          </div>
        </fieldset> : null}
      </section>
      <section aria-labelledby={`${id}-stock`} className="space-y-2.5 border-t border-[var(--theme-color-border-subtle)] pt-3">
        <h3 id={`${id}-stock`} className="text-sm font-bold text-[var(--theme-color-semantic-info-foreground)]">{t("stock")}</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("currentPt", t("currentPt"))}
          {challenge ? field("currentCp", t("currentCp")) : null}
          <div className={challenge ? "col-span-2" : undefined}>{field("storedFlames", t("storedFlames"))}</div>
          {field("smallDrinks", t("smallDrinks"))}
          {field("largeDrinks", t("largeDrinks"))}
        </div>
        <output className="block text-right text-xs font-semibold text-[var(--theme-color-semantic-info-foreground)]">{t("equivalentFlames", { count: validDrinks && Number.isSafeInteger(drinkFlames) ? number(drinkFlames) : "—" })}</output>
      </section>
      <section aria-labelledby={`${id}-play`} className="space-y-2.5 border-t border-[var(--theme-color-border-subtle)] pt-3">
        <h3 id={`${id}-play`} className="text-sm font-bold text-[var(--theme-color-semantic-info-foreground)]">{t("play")}</h3>
        <div className="grid grid-cols-2 gap-3">
          {costSelect("flameCost", t("flameCost"), FLAME_COSTS, "flames")}
          {challenge ? costSelect("cpCost", t("cpCost"), CP_COSTS, "cp") : null}
          {field("minutesPerGame", t("minutesPerGame"), { min: 0.01, step: 0.01, unit: t("minuteUnit") })}
        </div>
      </section>
      <section className="border-t border-[var(--theme-color-border-subtle)] pt-3">
        {field("targetPt", t("targetPt"))}
      </section>
    </div>
    <footer className="event-calculator-results shrink-0 space-y-1.5 border-t border-[var(--theme-color-border-subtle)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm tabular-nums" aria-live="polite" aria-atomic="true" data-testid="event-pt-results">
      {plan && result ? <>
        <div className="flex flex-wrap justify-between gap-x-2 gap-y-1"><span>{t("reachablePt")}</span><strong className="text-base text-[var(--theme-color-semantic-info-foreground)]">{number(result.budget.finalPt)} {t("pointUnit")}</strong></div>
        {result?.target && plan.totalGames === 0 ? <div className="font-bold">{t("goalReached")}</div> : null}
        <div className="font-semibold">{result.target ? t("requiredGames", { target: number(Number(draft.targetPt)), games }) : games}</div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><span>{t(result.target ? "requiredFlames" : "spentFlames", { count: number(plan.spentFlames) })}</span><span className={result.timeExceeded ? "text-[var(--theme-color-semantic-danger-foreground)]" : undefined}>{t("duration", { value: duration })}</span></div>
        {plan.spentDrinkFlames > 0 ? <div className="text-xs text-[var(--theme-color-text-muted)]">{t("spentDrinkFlames", { count: number(plan.spentDrinkFlames) })}</div> : null}
        {result.target ? <div className={cn("border-t border-[var(--theme-color-border-subtle)] pt-2 font-bold",
          result.timeExceeded ? "text-[var(--theme-color-semantic-danger-foreground)]" : "text-[var(--theme-color-semantic-info-foreground)]")}>
          {result.timeExceeded ? t("targetLimit", { count: number(result.limitPt) }) : plan.missingFlames > 0 ? <>{t("missingFlames", { count: number(plan.missingFlames) })} <span className="inline-block font-normal">{t("missingStars", { count: number(plan.missingFlames * 10) })}</span></> : challenge
            ? t("remainingResources", { flames: number(plan.remainingDrinkFlames), cp: number(plan.remainingCp), usage: plan.spentDrinkFlames === 0 ? "unused" : "used" })
            : t("remainingDrinkFlames", { count: number(plan.remainingDrinkFlames), usage: plan.spentDrinkFlames === 0 ? "unused" : "used" })}
        </div> : null}
      </> : <div className="space-y-1"><div className="font-semibold">{t("result")}</div><p className="text-xs leading-5 text-[var(--theme-color-text-muted)]">{t(!draft.flamePt || (challenge && !draft.cpPt) ? "missingEfficiency" : "checkInputs")}</p></div>}
    </footer>
  </Dialog.Content>;
  return <Dialog.Root open={open} modal={false} onOpenChange={open => { if (!open) onClose(); }}>
    {desktop ? content : <Dialog.Portal>{content}</Dialog.Portal>}
  </Dialog.Root>;
}

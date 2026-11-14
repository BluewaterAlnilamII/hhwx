"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export const CHART_ZOOM_LEVELS = [1, 2, 4, 8, 16, 32] as const;
export type ChartWindow = { start: number; end: number };
const FULL_WINDOW: ChartWindow = { start: 0, end: 1 };

export function zoomChartWindow(scale: number, anchor: number, position: number): ChartWindow {
  const span = 1 / Math.max(1, Math.min(32, scale));
  const start = Math.max(0, Math.min(1 - span, anchor - position * span));
  return { start, end: start + span };
}

export function nextChartZoom(scale: number, direction: -1 | 1): number {
  return direction > 0
    ? CHART_ZOOM_LEVELS.find(level => level > scale + 0.001) ?? 32
    : CHART_ZOOM_LEVELS.findLast(level => level < scale - 0.001) ?? 1;
}

export function chartZoomTicks(start: number, end: number, midnight: number, width: number, labelWidth: number): Array<{ time: number; labeled: boolean }> {
  if (width <= 0 || labelWidth <= 0 || end <= start) return [];
  const hour = 3600000;
  const span = end - start;
  const dateOnly = span >= 72 * hour;
  const steps = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 24, 48, 96, 168].map(hours => hours * hour);
  const gridStep = steps.find(step => step >= span * 32 / width) ?? 168 * hour;
  const padding = span * (labelWidth / 2 + 2) / width;
  const labelSpacing = span * (labelWidth + 8) / width;
  let nextLabelTime = start + padding;
  const ticks: Array<{ time: number; labeled: boolean }> = [];
  for (let time = midnight + (Math.floor((start - midnight) / gridStep) + 1) * gridStep; time < end; time += gridStep) {
    const labeled = time >= nextLabelTime && time <= end - padding
      && (!dateOnly || (time - midnight) % (24 * hour) === 0);
    ticks.push({ time, labeled });
    if (labeled) nextLabelTime = time + labelSpacing;
  }
  return ticks;
}

export function useTrackerChartZoom(key: string) {
  const [state, setState] = useState({ key, view: FULL_WINDOW });
  if (state.key !== key) setState({ key, view: FULL_WINDOW });
  const view = state.key === key ? state.view : FULL_WINDOW;
  const setView = useCallback((view: ChartWindow) => setState({ key, view }), [key]);
  const current = useRef(view);
  const renderedView = useRef(view);
  useLayoutEffect(() => { renderedView.current = view; });
  const frame = useRef<number | null>(null);
  const animationTarget = useRef<ChartWindow | null>(null);
  const gesture = useRef<{ view: ChartWindow; anchor: number } | null>(null);

  const interrupt = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    gesture.current = null;
    animationTarget.current = null;
  }, []);
  useLayoutEffect(() => interrupt, [interrupt]);
  useLayoutEffect(() => {
    interrupt();
    current.current = renderedView.current;
  }, [interrupt, key]);

  const move = useCallback((next: ChartWindow) => {
    current.current = next;
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setView(current.current);
    });
  }, [setView]);

  const beginGesture = useCallback((position: number) => {
    interrupt();
    const view = current.current;
    gesture.current = { view, anchor: view.start + position * (view.end - view.start) };
  }, [interrupt]);
  const updateGesture = useCallback((position: number, ratio: number) => {
    if (!gesture.current) return;
    const { view, anchor } = gesture.current;
    move(zoomChartWindow(ratio / (view.end - view.start), anchor, position));
  }, [move]);
  const endGesture = useCallback(() => { gesture.current = null; }, []);

  const animateTo = useCallback((to: ChartWindow, duration: number) => {
    interrupt();
    const from = renderedView.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = to;
      setView(to);
      return;
    }
    const started = performance.now();
    animationTarget.current = to;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      current.current = {
        start: from.start + (to.start - from.start) * eased,
        end: from.end + (to.end - from.end) * eased,
      };
      setView(current.current);
      frame.current = progress < 1 ? requestAnimationFrame(animate) : null;
      if (progress === 1) animationTarget.current = null;
    };
    frame.current = requestAnimationFrame(animate);
  }, [interrupt, setView]);

  const wheel = useCallback((position: number, delta: number) => {
    if (delta === 0) return;
    const view = renderedView.current;
    const span = view.end - view.start;
    const target = animationTarget.current ?? view;
    const targetSpan = target.end - target.start;
    // Accumulate same-direction input, but reverse from the visible view immediately.
    const baseSpan = delta < 0 ? Math.min(span, targetSpan) : Math.max(span, targetSpan);
    animateTo(zoomChartWindow(Math.exp(-delta / 300) / baseSpan, view.start + position * span, position), 160);
  }, [animateTo]);

  const step = useCallback((direction: -1 | 1, anchor: number, position: number) => {
    const target = animationTarget.current ?? current.current;
    animateTo(zoomChartWindow(nextChartZoom(1 / (target.end - target.start), direction), anchor, position), 180);
  }, [animateTo]);

  return { view, current, scale: 1 / (view.end - view.start), step, wheel, beginGesture, updateGesture, endGesture, interrupt };
}

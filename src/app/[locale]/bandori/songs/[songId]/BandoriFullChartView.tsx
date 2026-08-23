"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  BANDORI_COMPILED_CURVE_POSITION,
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  BANDORI_COMPILED_RIBBON_KIND,
  type CompiledBandoriChart,
} from "@/lib/bandori/chart-simulator/compiler";
import {
  BANDORI_FULL_CHART_LANE_COUNT,
  buildBandoriFullChartGeometry,
  type BandoriFullChartGeometry,
} from "./full-chart-geometry";

type BandoriFullChartViewProps = {
  compiled: CompiledBandoriChart;
  isMirrored: boolean;
  ariaLabel: string;
  description: string;
  analysisLabel: string;
};

const COLORS = {
  background: "#08111f",
  segment: "#0d192b",
  alternate: "#101f34",
  grid: "rgba(148, 163, 184, 0.18)",
  text: "rgba(226, 232, 240, 0.84)",
  bpm: "#c4b5fd",
  single: "#38bdf8",
  directional: "#fbbf24",
  long: "#4ade80",
  slide: "#f472b6",
  hidden: "#f8fafc",
  curveFront: "#fb7185",
  curveBack: "#60a5fa",
} as const;

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function drawGrid(
  context: CanvasRenderingContext2D,
  geometry: BandoriFullChartGeometry,
  analysisLabel: string,
): void {
  for (const segment of geometry.segments) {
    context.fillStyle = segment.index % 2 === 0 ? COLORS.segment : COLORS.alternate;
    context.fillRect(segment.x, 0, segment.width, geometry.canvasHeight);
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    for (let lane = 0; lane <= BANDORI_FULL_CHART_LANE_COUNT; lane += 1) {
      const x = segment.plotLeft
        + (lane / BANDORI_FULL_CHART_LANE_COUNT) * (segment.plotRight - segment.plotLeft);
      context.beginPath();
      context.moveTo(x, segment.plotTop);
      context.lineTo(x, segment.plotBottom);
      context.stroke();
    }
    context.fillStyle = COLORS.text;
    context.font = "600 11px system-ui, sans-serif";
    context.fillText(formatTime(segment.startTime), segment.plotLeft, 18);
  }
  context.fillStyle = COLORS.text;
  context.font = "700 11px system-ui, sans-serif";
  context.fillText(analysisLabel, 10, geometry.canvasHeight - 5);
}

function drawRibbons(context: CanvasRenderingContext2D, geometry: BandoriFullChartGeometry): void {
  for (const ribbon of geometry.ribbons) {
    context.strokeStyle = ribbon.kind === BANDORI_COMPILED_RIBBON_KIND.long
      ? COLORS.long
      : COLORS.slide;
    context.globalAlpha = 0.72;
    context.lineWidth = 5;
    context.lineJoin = "round";
    for (const segment of ribbon.segments) {
      if (segment.points.length === 0) continue;
      context.beginPath();
      context.moveTo(segment.points[0].x, segment.points[0].y);
      segment.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    }
    context.globalAlpha = 1;
    for (const point of ribbon.curvePoints) {
      context.fillStyle = point.position === BANDORI_COMPILED_CURVE_POSITION.front
        ? COLORS.curveFront
        : COLORS.curveBack;
      context.fillRect(point.x - 2, point.y - 2, 4, 4);
    }
  }
}

function drawNotes(context: CanvasRenderingContext2D, geometry: BandoriFullChartGeometry): void {
  for (const note of geometry.notes) {
    const isDirectional = note.kind === BANDORI_COMPILED_NOTE_KIND.directional
      || note.direction !== BANDORI_COMPILED_DIRECTION.none;
    context.fillStyle = isDirectional ? COLORS.directional : COLORS.single;
    if (note.kind === BANDORI_COMPILED_NOTE_KIND.longStart
      || note.kind === BANDORI_COMPILED_NOTE_KIND.longEnd) {
      context.fillStyle = COLORS.long;
    } else if (note.kind === BANDORI_COMPILED_NOTE_KIND.slide) {
      context.fillStyle = COLORS.slide;
    }
    const height = (note.flags & BANDORI_COMPILED_NOTE_FLAG.hidden) !== 0 ? 2 : 5;
    context.globalAlpha = (note.flags & BANDORI_COMPILED_NOTE_FLAG.hidden) !== 0 ? 0.65 : 1;
    context.fillRect(note.leftX, note.y - height / 2, Math.max(2, note.rightX - note.leftX), height);
    if ((note.flags & BANDORI_COMPILED_NOTE_FLAG.skill) !== 0) {
      context.strokeStyle = COLORS.hidden;
      context.lineWidth = 1;
      context.strokeRect(note.leftX - 1, note.y - height / 2 - 1, note.rightX - note.leftX + 2, height + 2);
    }
  }
  context.globalAlpha = 1;
}

function drawBpm(context: CanvasRenderingContext2D, geometry: BandoriFullChartGeometry): void {
  context.font = "600 9px system-ui, sans-serif";
  for (const marker of geometry.bpmMarkers) {
    context.fillStyle = COLORS.bpm;
    context.fillRect(marker.point.leftX, marker.point.y, marker.point.rightX - marker.point.leftX, 1);
    context.fillText(String(marker.value), marker.point.leftX + 2, Math.max(10, marker.point.y - 3));
  }
}

export default function BandoriFullChartView({
  compiled,
  isMirrored,
  ariaLabel,
  description,
  analysisLabel,
}: BandoriFullChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geometry = useMemo(
    () => buildBandoriFullChartGeometry(compiled, { isMirrored }),
    [compiled, isMirrored],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, geometry.canvasWidth, geometry.canvasHeight);
    drawGrid(context, geometry, analysisLabel);
    drawRibbons(context, geometry);
    drawNotes(context, geometry);
    drawBpm(context, geometry);
  }, [analysisLabel, geometry]);

  return (
    <div>
      <p className="mb-3 text-sm text-[var(--theme-color-text-muted)]">{description}</p>
      <div
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[#08111f] outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
      >
        <canvas
          ref={canvasRef}
          width={geometry.canvasWidth}
          height={geometry.canvasHeight}
          aria-hidden="true"
          className="block h-[40rem] max-w-none"
        />
      </div>
    </div>
  );
}

export const TOOLTIP_GAP = 4;
export const TOOLTIP_MARGIN = 12;

export type TooltipPosition = {
  left: number;
  top: number;
  placement: "above" | "below";
};

type TooltipPositionInput = {
  anchorRect: Pick<DOMRectReadOnly, "bottom" | "height" | "left" | "right" | "top" | "width">;
  tooltipHeight: number;
  tooltipWidth: number;
  viewportHeight: number;
  viewportWidth: number;
  preferredPlacement?: TooltipPosition["placement"];
  gap?: number;
  margin?: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getTooltipPosition({
  anchorRect,
  tooltipHeight,
  tooltipWidth,
  viewportHeight,
  viewportWidth,
  preferredPlacement = "below",
  gap = TOOLTIP_GAP,
  margin = TOOLTIP_MARGIN,
}: TooltipPositionInput): TooltipPosition {
  const availableBelow = viewportHeight - margin - anchorRect.bottom - gap;
  const availableAbove = anchorRect.top - gap - margin;
  const placement = preferredPlacement === "above"
    ? (tooltipHeight <= availableAbove || availableAbove >= availableBelow ? "above" : "below")
    : (tooltipHeight <= availableBelow || availableBelow >= availableAbove ? "below" : "above");
  const preferredTop = placement === "below"
    ? anchorRect.bottom + gap
    : anchorRect.top - gap - tooltipHeight;
  const maximumTop = Math.max(margin, viewportHeight - margin - tooltipHeight);
  const maximumLeft = Math.max(margin, viewportWidth - margin - tooltipWidth);

  return {
    left: clamp(
      anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2,
      margin,
      maximumLeft,
    ),
    top: clamp(preferredTop, margin, maximumTop),
    placement,
  };
}

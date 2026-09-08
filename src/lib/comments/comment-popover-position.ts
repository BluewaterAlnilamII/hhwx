export const COMMENT_POPOVER_VIEWPORT_PADDING = 16;

type CommentPopoverHorizontalPositionInput = {
  anchorRect: Pick<DOMRectReadOnly, "left" | "width">;
  containerLeft: number;
  preferredWidth: number;
  viewportLeft?: number;
  viewportWidth: number;
  viewportPadding?: number;
};

type CommentPopoverHorizontalPosition = {
  left: number;
  width: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getCommentPopoverVerticalPosition({
  anchorRect,
  tooltipHeight,
  viewportTop = 0,
  viewportHeight,
}: {
  anchorRect: Pick<DOMRectReadOnly, "top" | "bottom">;
  tooltipHeight: number;
  viewportTop?: number;
  viewportHeight: number;
}) {
  const minimumTop = viewportTop + COMMENT_POPOVER_VIEWPORT_PADDING;
  const maximumBottom = Math.max(minimumTop, viewportTop + viewportHeight - COMMENT_POPOVER_VIEWPORT_PADDING);
  const aboveEdge = clamp(anchorRect.top, minimumTop, maximumBottom);
  const belowEdge = clamp(anchorRect.bottom, minimumTop, maximumBottom);
  const availableAbove = aboveEdge - minimumTop;
  const availableBelow = maximumBottom - belowEdge;
  const placeAbove = tooltipHeight <= availableAbove || availableAbove >= availableBelow;
  const maxHeight = placeAbove ? availableAbove : availableBelow;

  return {
    top: placeAbove ? aboveEdge - Math.min(tooltipHeight, maxHeight) : belowEdge,
    maxHeight,
  };
}

export function getCommentPopoverHorizontalPosition({
  anchorRect,
  containerLeft,
  preferredWidth,
  viewportLeft = 0,
  viewportWidth,
  viewportPadding = COMMENT_POPOVER_VIEWPORT_PADDING,
}: CommentPopoverHorizontalPositionInput): CommentPopoverHorizontalPosition {
  const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);
  const width = Math.min(preferredWidth, availableWidth);
  const minimumViewportLeft = viewportLeft + viewportPadding;
  const maximumViewportLeft = Math.max(
    minimumViewportLeft,
    viewportLeft + viewportWidth - viewportPadding - width,
  );
  const preferredViewportLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const clampedViewportLeft = clamp(
    preferredViewportLeft,
    minimumViewportLeft,
    maximumViewportLeft,
  );

  return {
    left: clampedViewportLeft - containerLeft,
    width,
  };
}

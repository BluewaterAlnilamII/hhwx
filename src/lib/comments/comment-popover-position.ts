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

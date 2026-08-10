/**
 * Full card overlays use the game's 508 x 340 design surface.
 *
 * Attribute, rarity-star, and artwork-viewport coordinates are normalized
 * from the in-game member-details screen. Band marks keep each official PNG's
 * intrinsic aspect ratio inside the calibrated overlay bounds; their canvases
 * vary by band and must not be stretched to a shared ratio.
 *
 * Rarity 1-4 full-card frames are official 512 x 256 textures intentionally
 * authored with vertically compressed geometry. The game stretches them to
 * the 508 x 340 surface, restoring details such as the attribute ring to their
 * intended proportions. Rarity 5 uses a native 508 x 340 frame.
 */
export const BANDORI_FULL_CARD_LAYOUT = {
  surface: {
    width: 508,
    height: 340,
  },
  artworkViewport: {
    top: 7,
    right: 8,
    bottom: 7,
    left: 8,
    radius: 7,
  },
  attribute: {
    top: 7,
    right: 8,
    width: 52,
    height: 52,
  },
  rarityStar: {
    left: 4,
    bottom: 4,
    width: 40,
    height: 40,
    verticalStep: 31,
  },
  bandMark: {
    // The owned SVG uses a square canvas. Positioning is calibrated from its
    // colored pixels against the attribute icon, excluding both white outlines.
    left: 6,
    top: 7,
    width: 51,
    height: 51,
  },
} as const;

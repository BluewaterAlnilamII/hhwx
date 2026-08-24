const MUSIC_PLAYER_SIDE_BUTTON_BASE_CLASS_NAME =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] text-[var(--theme-color-text-muted)] outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]";

export const MUSIC_PLAYER_TRANSPORT_BUTTON_CLASS_NAME =
  `${MUSIC_PLAYER_SIDE_BUTTON_BASE_CLASS_NAME} hover:bg-[var(--theme-color-control-background-pressed)]`;

export const MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME =
  `${MUSIC_PLAYER_SIDE_BUTTON_BASE_CLASS_NAME} hover:bg-[var(--theme-color-control-background-pressed)]`;

const MUSIC_PLAYER_PLAYBACK_BUTTON_BASE_CLASS_NAME =
  "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full outline-hidden transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:shadow-none disabled:hover:scale-100";

export const MUSIC_PLAYER_PLAYBACK_BUTTON_CLASS_NAME =
  `${MUSIC_PLAYER_PLAYBACK_BUTTON_BASE_CLASS_NAME} bg-[var(--theme-color-progress-indicator-background)] text-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-action-primary)] focus-visible:ring-[var(--theme-color-focus-ring)]`;

export const MUSIC_PLAYER_PLAYBACK_ERROR_BUTTON_CLASS_NAME =
  `${MUSIC_PLAYER_PLAYBACK_BUTTON_BASE_CLASS_NAME} bg-[var(--theme-color-semantic-danger-border)] text-[var(--theme-color-semantic-danger-foreground-on-dark)] shadow-[var(--theme-shadow-action-primary)] focus-visible:ring-[var(--theme-color-semantic-danger-border)]`;

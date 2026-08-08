export type MusicPlayerToolbarAction = "none" | "toggle-panel" | "toggle-playback";

interface ResolveMusicPlayerToolbarActionOptions {
  eventDetail: number;
  pointerType: string | null;
  hasCurrentTrack: boolean;
  isOpen: boolean;
}

export function resolveMusicPlayerToolbarAction({
  eventDetail,
  pointerType,
  hasCurrentTrack,
  isOpen,
}: ResolveMusicPlayerToolbarActionOptions): MusicPlayerToolbarAction {
  if (eventDetail === 0) {
    return "toggle-panel";
  }
  if (pointerType !== "mouse") {
    return "toggle-panel";
  }
  if (hasCurrentTrack) {
    return "toggle-playback";
  }
  return isOpen ? "none" : "toggle-panel";
}

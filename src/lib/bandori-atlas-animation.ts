export type BandoriAtlasDimensions = {
  width: number;
  height: number;
};

export type BandoriAtlasFrameRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BandoriAtlasAnimationFrame = {
  name: string;
  rect: BandoriAtlasFrameRect;
};

export type BandoriAtlasAnimation = {
  atlasUrl: string;
  atlasDimensions: BandoriAtlasDimensions;
  frameRate: number;
  loop: boolean;
  frames: BandoriAtlasAnimationFrame[];
};

export function getBandoriAtlasFrameIndex(
  elapsedMs: number,
  frameRate: number,
  frameCount: number,
  loop: boolean,
): number {
  if (frameCount <= 1 || frameRate <= 0) return 0;
  const elapsedFrameCount = Math.floor(Math.max(0, elapsedMs) * frameRate / 1000);
  return loop
    ? elapsedFrameCount % frameCount
    : Math.min(elapsedFrameCount, frameCount - 1);
}

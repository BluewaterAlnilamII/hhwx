"use client";

import { Assets, type Texture } from "pixi.js";
import {
  BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS,
  createBandoriChartSimulatorTextureLeaseCache,
  type BandoriChartSimulatorTextureLease,
} from "./texture-lease-cache";

const bandoriChartSimulatorTextureCache =
  createBandoriChartSimulatorTextureLeaseCache<Texture>({
    load: (url) => Assets.load<Texture>(url),
    unload: async (url) => {
      await Assets.unload(url);
    },
    releaseDelayMs: BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS,
  });

export function acquireBandoriChartSimulatorTexture(
  url: string,
): BandoriChartSimulatorTextureLease<Texture> {
  return bandoriChartSimulatorTextureCache.acquire(url);
}

export function releaseUnusedBandoriChartSimulatorTexturesNow(): void {
  bandoriChartSimulatorTextureCache.releaseUnusedNow();
}

export { BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS };

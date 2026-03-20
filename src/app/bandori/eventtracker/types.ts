export type TrackerData = {
  time: number;
  ep: number;
  speed?: number;
  speed24?: number;
  refSpeed24?: number;
  instantEp?: number;
  dayEp?: number;
  isProjection?: boolean;
  projectionType?: "instant" | "24h" | "both";
  projectionEndTime?: number;
};

export type EventMetadata = {
  eventType: string;
  eventName: string[];
  assetBundleName: string;
  startAt: (string | null)[];
  endAt: (string | null)[];
};

export type MinimalEvent = {
  id: number;
  name: string;
  startAt: number | null;
  endAt: number | null;
  hasCn: boolean;
  hasJp: boolean;
};

export type TrackerResult = {
  cutoffs: TrackerData[];
  result: boolean;
};

export type TrackingMode = "event" | "song" | "monthly";

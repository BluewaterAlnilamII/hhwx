/**
 * 图表中的单个数据点。
 * `ep` 为真实累计分数；其余字段按需补充速度、投影和投影终点信息。
 */
export type TrackerData = {
  /** 数据点时间戳，单位为毫秒。 */
  time: number;
  /** 当前时刻的累计分数。 */
  ep: number;
  /** 标记该点是否为清挂后的最终结果。 */
  isFinal?: boolean;
  /** 标记该点是否只是为了绘图补出的基准点，不代表真实采集数据。 */
  isBaseline?: boolean;
  /** 相邻两点推导出的瞬时速度，单位为分数每小时。 */
  speed?: number;
  /** 以约 24 小时窗口估算的速度，单位为分数每天。 */
  speed24?: number;
  /** 24 小时速度对比时所引用的历史速度。 */
  refSpeed24?: number;
  /** 基于瞬时速度外推得到的投影分数。 */
  instantEp?: number;
  /** 基于 24 小时速度外推得到的投影分数。 */
  dayEp?: number;
  /** 标记当前数据点是否为投影点。 */
  isProjection?: boolean;
  /** 标记投影点来源于哪种投影策略。 */
  projectionType?: "instant" | "24h" | "both";
  /** 投影线对应的理论结束时间。 */
  projectionEndTime?: number;
  /** 对比线在该图表时间点的原始信息。 */
  comparisonPoints?: Record<string, ComparisonPointInfo>;
  /** Tooltip mode used for synthetic hover payloads. */
  tooltipMode?: "comparison";
  /** Bestdori Prediction line value at this timestamp. */
  bestdoriPredictionEp?: number;
  /** Bestdori Prediction metadata used by the tooltip. */
  bestdoriPrediction?: BestdoriPredictionPointInfo;
  /** 对比线动态数据键。 */
  [key: `compare_${number}_ep`]: number | undefined;
};

export type BestdoriPredictionPointInfo = {
  time: number;
  ep: number;
  source: "bestdori";
};

export type ComparisonAlignment = "start" | "end";

export type ComparisonConfig = {
  id: string;
  eventId: number | null;
  tier: number | null;
  enabled: boolean;
  colorIndex?: number;
};

export type ComparisonStatus = "loading" | "ready" | "no-data" | "time-missing";

export type ComparisonPointInfo = {
  eventId: number;
  tier: number;
  eventName: string;
  originalTime: number;
  shiftedTime: number;
  ep: number;
  color: string;
};

export type ComparisonLinePoint = ComparisonPointInfo & {
  dataKey: `compare_${number}_ep`;
};

export type ComparisonLine = {
  config: ComparisonConfig;
  dataKey: `compare_${number}_ep`;
  color: string;
  label: string;
  status: ComparisonStatus;
  points: ComparisonLinePoint[];
};

export type TrackerTooltipPayloadEntry = {
  dataKey?: string | number;
  payload?: TrackerData;
};

export type TrackerMouseState = {
  isTooltipActive?: boolean;
  activeCoordinate?: { x: number; y: number };
  activeLabel?: number | string;
  activePayload?: TrackerTooltipPayloadEntry[];
};

export type TrackerDotProps = {
  cx?: number;
  cy?: number;
  payload?: TrackerData;
  index?: number;
};

export type TrackerSongGroup = {
  /** challenge 歌曲榜对应的 musicId；0 表示历史单歌曲榜或未分组数据。 */
  songId: number;
  /** 该歌曲榜的时间序列。 */
  cutoffs: TrackerData[];
};

export type BandoriEventSummary = {
  eventId: number;
  eventType: string;
  name: {
    jp: string;
    cn: string | null;
  };
  asset: {
    bundleName: string;
    bannerBundleName: string | null;
  };
  band: string;
  stampCharacterId: number | null;
  timeline: {
    jp: {
      startAt: number;
      endAt: number;
    };
    cn: {
      startAt: number | null;
      endAt: number | null;
    };
    cnSchedule?: {
      startAt: number;
      endAt: number;
    };
  };
  musicIds: {
    jp: number[];
    cn: number[];
  };
};

/** eventtracker 当前只依赖活动目录摘要，不再需要单独拉详情。 */
export type EventMetadata = BandoriEventSummary;

/** 活动选择器和视图判断所需的最小活动信息。 */
export type MinimalEvent = {
  /** 活动编号。 */
  id: number;
  /** 优先显示的活动名称。 */
  name: string;
  /** 活动开始时间戳，缺失时表示尚未确定。 */
  startAt: number | null;
  /** 活动结束时间戳，缺失时表示尚未确定。 */
  endAt: number | null;
  /** 是否存在国服名称。 */
  hasCn: boolean;
  /** 是否存在日服名称。 */
  hasJp: boolean;
};

/** 追踪接口返回的结果体。 */
export type TrackerResult = {
  /** 追踪数据点序列。 */
  cutoffs: TrackerData[];
  /** 服务端是否确认存在有效追踪结果。 */
  result: boolean;
  /** song 模式下按 song_id 返回的所有分组。 */
  songGroups?: TrackerSongGroup[];
};

/** 活动追踪页面支持的三种排行模式。 */
export type TrackingMode = "event" | "song" | "monthly";

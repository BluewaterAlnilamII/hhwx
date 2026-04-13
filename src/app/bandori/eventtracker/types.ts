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
};

export type TrackerSongGroup = {
  /** challenge 歌曲榜对应的 musicId；0 表示历史单歌曲榜或未分组数据。 */
  songId: number;
  /** 该歌曲榜的时间序列。 */
  cutoffs: TrackerData[];
};

/** Bestdori 活动详情接口中会被页面消费的元数据字段。 */
export type EventMetadata = {
  /** 活动类型编码。 */
  eventType: string;
  /** 多语言活动名称列表。 */
  eventName: string[];
  /** 活动资源包名称，用于拼接横幅地址。 */
  assetBundleName: string;
  /** 各服务器的活动开始时间原始值。 */
  startAt: (string | null)[];
  /** 各服务器的活动结束时间原始值。 */
  endAt: (string | null)[];
  /** challenge 等活动使用的歌曲列表。 */
  musics?: ({ musicId: number }[] | null)[];
};

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

import {
  groupBandoriTopDataSamples,
  type BandoriTopDataPayload,
} from "@/lib/bandori/event-tracker/topdata-contract";

export const BANDORI_TOP10_LINE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#4f46e5",
  "#78716c",
] as const;

export type BandoriTop10ChartPoint = {
  time: number;
  [dataKey: string]: number;
};

export type BandoriTop10Player = {
  position: number;
  uid: number;
  name: string;
  score: number;
  avatarCardId: number;
  isAvatarTrained: boolean;
  dataKey: string;
  color: string;
};

export type BandoriTop10View = {
  chartData: BandoriTop10ChartPoint[];
  players: BandoriTop10Player[];
  scores: number[];
  latestTime: number | null;
};

function buildPlayerDataKey(uid: number): string {
  return `top10_uid_${uid}`;
}

/**
 * Build the display model from the Bestdori-compatible history payload.
 * Only UIDs in the newest sample remain visible. Missing sample entries stay
 * absent so the chart breaks the line while a player is outside TOP10.
 */
export function buildBandoriTop10View(payload: BandoriTopDataPayload): BandoriTop10View {
  const samples = groupBandoriTopDataSamples(payload.points);
  const latestSample = samples.at(-1);
  if (!latestSample) {
    return { chartData: [], players: [], scores: [], latestTime: null };
  }

  const userByUid = new Map(payload.users.map((user) => [user.uid, user]));
  const players = latestSample.map((point, index): BandoriTop10Player => {
    const user = userByUid.get(point.uid);
    if (!user) {
      throw new Error(`Bandori TOP10 display user is missing: ${point.uid}`);
    }
    return {
      position: index + 1,
      uid: point.uid,
      name: user.name,
      score: point.value,
      avatarCardId: user.sid,
      isAvatarTrained: user.strained === 1,
      dataKey: buildPlayerDataKey(point.uid),
      color: BANDORI_TOP10_LINE_COLORS[index],
    };
  });
  const playerByUid = new Map(players.map((player) => [player.uid, player]));
  const scores: number[] = [];
  const chartData = samples.map((sample) => {
    const row: BandoriTop10ChartPoint = { time: sample[0].time };
    for (const point of sample) {
      const player = playerByUid.get(point.uid);
      if (player) {
        row[player.dataKey] = point.value;
        scores.push(point.value);
      }
    }
    return row;
  });

  return {
    chartData,
    players,
    scores,
    latestTime: latestSample[0].time,
  };
}

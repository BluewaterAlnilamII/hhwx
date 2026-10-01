// Build-time rollout gate; the backend must also have its private SDK configuration.
export const GAME_PROFILE_SYNC_ENABLED = process.env.NEXT_PUBLIC_GAME_PROFILE_SYNC_ENABLED === "true";

export type GameProfileLoginTask = {
  taskId: string;
  gameUid: string;
  status: "waiting";
  loginUrl: string;
  expiresIn: number;
};

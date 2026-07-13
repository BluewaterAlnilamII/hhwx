export async function authorizeBandoriTrackerRealtimeConnection(
  setAuth: () => Promise<void>,
  isCurrent: () => boolean,
): Promise<boolean> {
  await setAuth();
  return isCurrent();
}

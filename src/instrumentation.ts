export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startServiceStatusPolling } = await import("./lib/service-status-server");
    startServiceStatusPolling();
  }
}

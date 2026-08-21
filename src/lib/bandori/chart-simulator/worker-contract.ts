import type { BandoriChartEntity } from "@/lib/bandori-chart-simulator-contract";
import {
  BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION,
  type CompiledBandoriChart,
} from "./compiler";

export const BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION = 1 as const;

export type BandoriChartCompilerWorkerRequest = {
  protocolVersion: typeof BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION;
  kind: "compile";
  requestId: string;
  chart: BandoriChartEntity[];
  mediaDurationSeconds: number;
};

export type BandoriChartCompilerWorkerResponse = {
  protocolVersion: typeof BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION;
  kind: "compiled";
  requestId: string;
  payloadVersion: typeof BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION;
  chart: CompiledBandoriChart;
} | {
  protocolVersion: typeof BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION;
  kind: "error";
  requestId: string;
  message: string;
};

export function createBandoriChartCompilerWorkerRequest(
  input: Omit<BandoriChartCompilerWorkerRequest, "protocolVersion" | "kind">,
): BandoriChartCompilerWorkerRequest {
  return {
    protocolVersion: BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION,
    kind: "compile",
    ...input,
  };
}

export function isBandoriChartCompilerWorkerResponse(
  value: unknown,
): value is BandoriChartCompilerWorkerResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Partial<BandoriChartCompilerWorkerResponse>;
  if (
    response.protocolVersion !== BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION
    || typeof response.requestId !== "string"
    || !response.requestId
  ) {
    return false;
  }
  if (response.kind === "error") {
    return typeof response.message === "string" && Boolean(response.message);
  }
  return response.kind === "compiled"
    && response.payloadVersion === BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION
    && response.chart?.schemaVersion === BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION;
}

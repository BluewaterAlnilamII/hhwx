/// <reference lib="webworker" />

import {
  collectCompiledBandoriChartTransferables,
  compileBandoriChart,
} from "./compiler";
import {
  BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION,
  type BandoriChartCompilerWorkerRequest,
  type BandoriChartCompilerWorkerResponse,
} from "./worker-contract";

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<BandoriChartCompilerWorkerRequest>) => {
  const request = event.data;
  const requestId = typeof request?.requestId === "string" ? request.requestId : "unknown";
  let response: BandoriChartCompilerWorkerResponse;
  try {
    if (
      request?.protocolVersion !== BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION
      || request.kind !== "compile"
    ) {
      throw new Error("Unsupported Bandori chart compiler worker request");
    }
    const chart = compileBandoriChart(request.chart, {
      mediaDurationSeconds: request.mediaDurationSeconds,
    });
    response = {
      protocolVersion: BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION,
      payloadVersion: chart.schemaVersion,
      kind: "compiled",
      requestId,
      chart,
    };
    worker.postMessage(response, collectCompiledBandoriChartTransferables(chart));
  } catch (error) {
    response = {
      protocolVersion: BANDORI_CHART_COMPILER_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    worker.postMessage(response);
  } finally {
    worker.close();
  }
};

export {};

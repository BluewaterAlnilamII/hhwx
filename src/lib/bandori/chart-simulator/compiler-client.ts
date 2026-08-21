"use client";

import type { BandoriChartEntity } from "@/lib/bandori-chart-simulator-contract";
import type { CompiledBandoriChart } from "./compiler";
import {
  createBandoriChartCompilerWorkerRequest,
  isBandoriChartCompilerWorkerResponse,
} from "./worker-contract";

export function compileBandoriChartInWorker(options: {
  chart: BandoriChartEntity[];
  mediaDurationSeconds: number;
  signal?: AbortSignal;
}): Promise<CompiledBandoriChart> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./compiler.worker.ts", import.meta.url), {
      type: "module",
      name: "bandori-chart-compiler",
    });
    const requestId = crypto.randomUUID();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      callback();
    };
    const onAbort = () => finish(() => reject(new DOMException("Chart compilation aborted", "AbortError")));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const response = event.data;
      if (!isBandoriChartCompilerWorkerResponse(response) || response.requestId !== requestId) {
        finish(() => reject(new Error("Chart compiler worker returned an invalid response")));
        return;
      }
      if (response.kind === "error") {
        finish(() => reject(new Error(response.message)));
        return;
      }
      finish(() => resolve(response.chart));
    }, { once: true });
    worker.addEventListener("error", () => {
      finish(() => reject(new Error("Chart compiler worker failed")));
    }, { once: true });
    worker.postMessage(createBandoriChartCompilerWorkerRequest({
      requestId,
      chart: options.chart,
      mediaDurationSeconds: options.mediaDurationSeconds,
    }));
  });
}

export type BandoriMediaOperationContext = {
  readonly generation: number;
  readonly signal: AbortSignal;
  isLatest: () => boolean;
  throwIfSuperseded: () => void;
};

export type BandoriMediaOperationResult =
  | { readonly status: "committed"; readonly generation: number }
  | { readonly status: "superseded"; readonly generation: number }
  | { readonly status: "failed"; readonly generation: number; readonly error: unknown };

export type BandoriMediaOperationHandlers<T> = {
  commit: (value: T, context: BandoriMediaOperationContext) => void;
  reportError: (error: unknown, context: BandoriMediaOperationContext) => void;
};

export type BandoriMediaOperationSequencer = {
  readonly generation: number;
  cancel: () => void;
  runLatest: <T>(
    run: (context: BandoriMediaOperationContext) => Promise<T>,
    handlers: BandoriMediaOperationHandlers<T>,
  ) => Promise<BandoriMediaOperationResult>;
};

type ActiveOperation = {
  readonly controller: AbortController;
  readonly generation: number;
};

function createSupersededError(): Error {
  const error = new Error("Bandori media operation was superseded");
  error.name = "AbortError";
  return error;
}

/**
 * Coordinates latest-intent-wins media work. Aborting an old signal cannot undo
 * an already-started browser operation, so every continuation and final state
 * commit is also guarded by the operation generation.
 */
export function createBandoriMediaOperationSequencer(): BandoriMediaOperationSequencer {
  let generation = 0;
  let activeOperation: ActiveOperation | null = null;

  const isLatest = (operation: ActiveOperation): boolean => (
    activeOperation === operation && !operation.controller.signal.aborted
  );

  const begin = (): ActiveOperation => {
    const previous = activeOperation;
    generation += 1;
    const operation: ActiveOperation = {
      controller: new AbortController(),
      generation,
    };
    // Publish the successor before abort listeners on the predecessor run.
    activeOperation = operation;
    previous?.controller.abort();
    return operation;
  };

  const cancel = (): void => {
    const previous = activeOperation;
    generation += 1;
    activeOperation = null;
    previous?.controller.abort();
  };

  const runLatest = async <T>(
    run: (context: BandoriMediaOperationContext) => Promise<T>,
    handlers: BandoriMediaOperationHandlers<T>,
  ): Promise<BandoriMediaOperationResult> => {
    const operation = begin();
    const context: BandoriMediaOperationContext = {
      generation: operation.generation,
      signal: operation.controller.signal,
      isLatest: () => isLatest(operation),
      throwIfSuperseded: () => {
        if (!isLatest(operation)) throw createSupersededError();
      },
    };

    try {
      let value: T;
      try {
        value = await run(context);
      } catch (error) {
        if (!isLatest(operation)) {
          return { status: "superseded", generation: operation.generation };
        }
        handlers.reportError(error, context);
        return { status: "failed", generation: operation.generation, error };
      }

      if (!isLatest(operation)) {
        return { status: "superseded", generation: operation.generation };
      }

      try {
        handlers.commit(value, context);
      } catch (error) {
        if (!isLatest(operation)) {
          return { status: "superseded", generation: operation.generation };
        }
        handlers.reportError(error, context);
        return { status: "failed", generation: operation.generation, error };
      }
      return { status: "committed", generation: operation.generation };
    } finally {
      if (activeOperation === operation) activeOperation = null;
    }
  };

  return {
    get generation() {
      return generation;
    },
    cancel,
    runLatest,
  };
}

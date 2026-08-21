const BANDORI_MEDIA_SEEK_EPSILON_SECONDS = 1e-4;

function createAbortError(): Error {
  const error = new Error("Media seek was superseded");
  error.name = "AbortError";
  return error;
}

/** Waits until the media element has committed a requested timeline position. */
export function seekBandoriMediaElement(
  media: HTMLMediaElement,
  targetTimeSeconds: number,
  signal?: AbortSignal,
): Promise<number> {
  if (!Number.isFinite(targetTimeSeconds) || targetTimeSeconds < 0) {
    return Promise.reject(new RangeError("Media seek target must be a finite non-negative number"));
  }
  if (signal?.aborted) return Promise.reject(createAbortError());
  if (
    !media.seeking
    && Math.abs(media.currentTime - targetTimeSeconds) <= BANDORI_MEDIA_SEEK_EPSILON_SECONDS
  ) {
    return Promise.resolve(media.currentTime);
  }

  return new Promise<number>((resolve, reject) => {
    let isSettled = false;
    const cleanup = () => {
      media.removeEventListener("seeked", handleSeeked);
      media.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const settle = (result: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      result();
    };
    const handleSeeked = () => settle(() => resolve(media.currentTime));
    const handleError = () => settle(() => reject(new Error("Media seek failed")));
    const handleAbort = () => settle(() => reject(createAbortError()));

    media.addEventListener("seeked", handleSeeked);
    media.addEventListener("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      media.currentTime = targetTimeSeconds;
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    // Assigning the current position (or seeking before metadata is available)
    // is allowed to complete without dispatching a new `seeked` event.
    queueMicrotask(() => {
      if (!media.seeking) handleSeeked();
    });
  });
}

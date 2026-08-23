const BANDORI_MEDIA_SEEK_EPSILON_SECONDS = 1e-4;
const BANDORI_MEDIA_SEEK_COMMIT_TOLERANCE_SECONDS = 0.05;
const MEDIA_HAVE_FUTURE_DATA = 3;

function createAbortError(): Error {
  const error = new Error("Media operation was superseded");
  error.name = "AbortError";
  return error;
}

/** Waits for this play request, without accepting an unrelated `playing` event. */
export async function playBandoriMediaElement(
  media: HTMLMediaElement,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) throw createAbortError();

  const playRequest = media.play();
  await new Promise<void>((resolve, reject) => {
    let isSettled = false;
    const cleanup = () => signal?.removeEventListener("abort", handleAbort);
    const settle = (result: () => void) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      result();
    };
    const handleAbort = () => settle(() => reject(createAbortError()));
    signal?.addEventListener("abort", handleAbort, { once: true });
    void playRequest.then(
      () => settle(resolve),
      (error: unknown) => settle(() => reject(error)),
    );
  });

  if (signal?.aborted) throw createAbortError();
  if (
    media.paused
    || media.seeking
    || media.ended
    || media.readyState < MEDIA_HAVE_FUTURE_DATA
  ) {
    throw new Error("Media play request completed without stable playback");
  }
  return media.currentTime;
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
  const expectedTimeSeconds = Number.isFinite(media.duration) && media.duration >= 0
    ? Math.min(targetTimeSeconds, media.duration)
    : targetTimeSeconds;
  if (
    !media.seeking
    && Math.abs(media.currentTime - expectedTimeSeconds) <= BANDORI_MEDIA_SEEK_EPSILON_SECONDS
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
    const handleSeeked = () => {
      if (media.seeking) return;
      if (
        Math.abs(media.currentTime - expectedTimeSeconds)
        > BANDORI_MEDIA_SEEK_COMMIT_TOLERANCE_SECONDS
      ) return;
      settle(() => resolve(media.currentTime));
    };
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

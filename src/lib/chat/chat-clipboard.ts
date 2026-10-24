export async function copyChatImage(source: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard unavailable");
  const worker = new Worker(new URL("./chat-image.worker.ts", import.meta.url));
  const image = new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      if (event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? "CHAT_IMAGE_PROCESSING"));
    };
    worker.onerror = () => reject(new Error("CHAT_IMAGE_PROCESSING"));
    worker.postMessage({ clipboardSource: source });
  });
  // A permission rejection may happen before the browser consumes the image promise.
  void image.catch(() => undefined);
  try {
    // Start within the click gesture; only the clipboard representation is encoded.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
  } finally { worker.terminate(); }
}

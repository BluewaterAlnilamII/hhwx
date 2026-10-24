import type { ChatImageType } from "./chat-image-contract";

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

export async function saveChatImage(source: string, contentType: ChatImageType): Promise<void> {
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/apng" ? "png" : contentType.slice(6);
  const filename = `image.${extension}`;
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  let handle: FileSystemFileHandle | undefined;
  if (picker) {
    try {
      // Open before fetching so the click's user activation is still available.
      handle = await picker.call(window, { suggestedName: filename, types: [{ accept: { [contentType]: [`.${extension}`] } }] });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }
  const local = source.startsWith("blob:");
  let url = source;
  if (handle || !local) {
    const response = await fetch(source, { credentials: "omit", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Image download unavailable");
    const blob = await response.blob();
    if (handle) {
      const writable = await handle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
      return;
    }
    // A cross-origin CDN URL cannot rely on the anchor's download attribute.
    url = URL.createObjectURL(blob);
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Release only our temporary URL after the browser starts the download.
    if (!local) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

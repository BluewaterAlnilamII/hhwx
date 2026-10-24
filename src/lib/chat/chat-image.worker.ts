import { createChatClipboardPng, prepareChatImage } from "./chat-image-processing";

self.onmessage = async (event: MessageEvent<Blob | { clipboardSource: string }>) => {
  try {
    if (event.data instanceof Blob) self.postMessage({ image: await prepareChatImage(event.data) });
    else {
      const response = await fetch(event.data.clipboardSource, { credentials: "omit", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("CHAT_IMAGE_PROCESSING");
      self.postMessage({ blob: await createChatClipboardPng(await response.blob()) });
    }
  }
  catch (error) {
    const code = error instanceof Error && error.message.startsWith("CHAT_IMAGE_") ? error.message : "CHAT_IMAGE_PROCESSING";
    self.postMessage({ error: code });
  }
};

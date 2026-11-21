import { ApiRouteError } from "@/lib/api-contracts";

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
  tooLarge = { code: "REQUEST_TOO_LARGE", message: "Request too large" },
): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiRouteError(413, tooLarge.code, tooLarge.message);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

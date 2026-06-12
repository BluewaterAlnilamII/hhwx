import { createHash, createHmac } from "node:crypto";
import { request as httpsRequest } from "node:https";

export type R2S3ReaderConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
};

const S3_SERVICE = "s3";
const AWS4_REQUEST = "aws4_request";
const EMPTY_PAYLOAD_SHA256 = createHash("sha256").update("").digest("hex");

export type R2ObjectResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  arrayBuffer: () => Promise<ArrayBuffer>;
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
};

function hashSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function encodeS3PathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => (
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

function encodeS3ObjectKeyPath(objectKey: string): string {
  return objectKey
    .split("/")
    .filter(Boolean)
    .map(encodeS3PathSegment)
    .join("/");
}

function formatAmzDate(now: Date): { dateStamp: string; amzDate: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    dateStamp: iso.slice(0, 8),
    amzDate: iso,
  };
}

function buildSigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmacSha256(dateKey, region);
  const dateRegionServiceKey = hmacSha256(dateRegionKey, S3_SERVICE);
  return hmacSha256(dateRegionServiceKey, AWS4_REQUEST);
}

function buildR2ObjectRequest(config: R2S3ReaderConfig, objectKey: string, now = new Date()) {
  const endpoint = new URL(config.endpoint.replace(/\/+$/g, ""));
  const region = config.region?.trim() || "auto";
  const { dateStamp, amzDate } = formatAmzDate(now);
  const canonicalUri = `/${encodeS3PathSegment(config.bucket)}/${encodeS3ObjectKeyPath(objectKey)}`;
  const credentialScope = `${dateStamp}/${region}/${S3_SERVICE}/${AWS4_REQUEST}`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `host:${endpoint.host}`,
    `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "GET",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    EMPTY_PAYLOAD_SHA256,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashSha256(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", buildSigningKey(config.secretAccessKey, dateStamp, region))
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    url: `${endpoint.origin}${canonicalUri}`,
    headers: {
      Authorization: [
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(", "),
      "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256,
      "x-amz-date": amzDate,
    },
  };
}

export async function fetchR2Object(
  config: R2S3ReaderConfig,
  objectKey: string,
  _revalidateSeconds?: number,
): Promise<R2ObjectResponse> {
  const signedRequest = buildR2ObjectRequest(config, objectKey);
  const result = await new Promise<{ body: Buffer; headers: Headers; status: number }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const nextRequest = httpsRequest(signedRequest.url, {
      method: "GET",
      headers: signedRequest.headers,
    }, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            headers.append(key, item);
          }
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      }

      response.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          headers,
          status: response.statusCode ?? 0,
        });
      });
    });

    nextRequest.on("error", reject);
    nextRequest.end();
  });
  const arrayBuffer = result.body.buffer.slice(
    result.body.byteOffset,
    result.body.byteOffset + result.body.byteLength,
  ) as ArrayBuffer;

  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    headers: result.headers,
    arrayBuffer: async () => arrayBuffer,
    json: async <T = unknown>() => JSON.parse(result.body.toString("utf8")) as T,
    text: async () => result.body.toString("utf8"),
  };
}

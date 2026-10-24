import "server-only";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jwtVerify, SignJWT } from "jose";
import { ApiRouteError } from "@/lib/api-contracts";
import { chatRpc } from "./chat-server";
import { CHAT_IMAGE_PREFIX, isChatImage, isChatImageMetadata, type ChatImage, type ChatImageMetadata, type ChatImageUpload } from "./chat-image-contract";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const RECEIPT_LIFETIME = 23 * 3600;
let storageClient: S3Client | undefined;
function storage() {
  const endpoint = process.env.CHAT_R2_ENDPOINT;
  const accessKeyId = process.env.CHAT_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHAT_R2_SECRET_ACCESS_KEY;
  const secret = process.env.CHAT_TOKEN_SECRET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !secret || secret.length < 32
    || !/^https:\/\/[^/]+(?:\/)?$/u.test(endpoint)) {
    throw new ApiRouteError(503, "CHAT_IMAGES_UNAVAILABLE", "图片上传暂时不可用");
  }
  storageClient ??= new S3Client({ endpoint, region: "auto", forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: "WHEN_REQUIRED" });
  return {
    client: storageClient,
    bucket: process.env.CHAT_R2_BUCKET || "cdn", secret: new TextEncoder().encode(secret),
  };
}

export async function issueChatImageUpload(actor: string, requestId: string, value: unknown): Promise<ChatImageUpload> {
  if (!isChatImageMetadata(value)) throw new ApiRouteError(400, "CHAT_IMAGE_INVALID", "图片信息无效");
  const { width, height, bytes, contentType, hash } = value;
  const metadata: ChatImageMetadata = { width, height, bytes, contentType, hash };
  const { client, bucket, secret } = storage();
  await chatRpc("authorize_chat_image_upload", { p_actor: actor });
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/apng": "png", "image/webp": "webp", "image/gif": "gif" }[contentType];
  const image: ChatImage = { ...metadata, key: `${CHAT_IMAGE_PREFIX}${actor}/${requestId}/${hash}.${extension}` };
  const now = Math.floor(Date.now() / 1000);
  const headers = { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL, "If-None-Match": "*" };
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: image.key,
    ContentType: contentType, ContentLength: bytes, CacheControl: CACHE_CONTROL, IfNoneMatch: "*" }),
  { expiresIn: 3600, signableHeaders: new Set(["content-type", "content-length", "cache-control", "if-none-match"]) });
  const receipt = await new SignJWT({ requestId, image }).setProtectedHeader({ alg: "HS256" })
    .setSubject(actor).setIssuer("hhwx-chat-image").setAudience("hhwx-chat-image")
    .setIssuedAt(now).setExpirationTime(now + RECEIPT_LIFETIME).sign(secret);
  return { url, receipt, expiresAt: (now + 3600) * 1000, headers };
}

export async function verifyChatImageUpload(actor: string, requestId: string, receipt: unknown): Promise<ChatImage> {
  if (typeof receipt !== "string" || receipt.length > 4096) throw new ApiRouteError(400, "CHAT_IMAGE_INVALID", "图片凭证无效");
  const { client, bucket, secret } = storage();
  let image: ChatImage;
  try {
    const { payload } = await jwtVerify(receipt, secret, { algorithms: ["HS256"],
      issuer: "hhwx-chat-image", audience: "hhwx-chat-image", subject: actor });
    if (payload.requestId !== requestId || !isChatImage(payload.image)) throw new Error("Invalid image receipt");
    image = payload.image;
  } catch {
    throw new ApiRouteError(400, "CHAT_IMAGE_EXPIRED", "图片凭证已失效，请重新选择图片");
  }
  let object;
  try {
    object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: image.key }), { abortSignal: AbortSignal.timeout(10000) });
  } catch {
    throw new ApiRouteError(503, "CHAT_IMAGE_UPLOAD", "暂时无法确认图片上传，请重试");
  }
  // HEAD verifies stored metadata, not decoded pixels. The client owns image processing.
  if (object.ContentLength !== image.bytes || object.ContentType !== image.contentType
    || object.CacheControl !== CACHE_CONTROL || !object.LastModified
    || Date.now() - object.LastModified.getTime() >= RECEIPT_LIFETIME * 1000) {
    throw new ApiRouteError(400, "CHAT_IMAGE_INVALID", "上传的图片信息不符或已过期");
  }
  return image;
}

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  BANDORI_CHARACTERS_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { fetchBandoriCharacters } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

const readBandoriCharactersResponse = unstable_cache(
  async () => ({ characters: await fetchBandoriCharacters() }),
  ["bandori-characters-route:v2"],
  { revalidate: 86400, tags: [BANDORI_CHARACTERS_CACHE_TAG] },
);

export async function GET() {
  try {
    // 单独拆 characters 资源，是为了让 calendar 页面和 ICS 生成都能复用同一份角色目录，
    // 同时避免 schedule 接口为了角色显示额外携带一大段重复数据。
    return NextResponse.json(await readBandoriCharactersResponse(), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori characters API 错误:", error);
    return NextResponse.json({ error: "服务器内部错误" }, {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
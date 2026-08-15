import { ApiRouteError } from "@/lib/api-contracts";
import { parseDisplayDegreeRequest } from "@/lib/account-display-degree";
import {
  readAccountDisplayDegreeOptions,
  updateAccountDisplayDegree,
} from "@/lib/account-display-degree-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    return jsonSuccess(await readAccountDisplayDegreeOptions(user.id), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Account display degree GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "DISPLAY_DEGREE_READ_FAILED",
      message: "读取展示称号失败",
    }, { headers: NO_STORE_HEADERS });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const selection = parseDisplayDegreeRequest(body);
    if (!selection) {
      throw new ApiRouteError(400, "INVALID_DISPLAY_DEGREE", "请选择有效的展示称号");
    }

    return jsonSuccess(await updateAccountDisplayDegree(user.id, selection), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Account display degree PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "DISPLAY_DEGREE_UPDATE_FAILED",
      message: "保存展示称号失败",
    }, { headers: NO_STORE_HEADERS });
  }
}

import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError } from "@/lib/api-response";

export async function DELETE() {
  return jsonRouteError(new ApiRouteError(410, "ACCOUNT_DELETE_DISABLED", "当前版本暂不提供删除账号"), {
    status: 410,
    code: "ACCOUNT_DELETE_DISABLED",
    message: "当前版本暂不提供删除账号",
  });
}
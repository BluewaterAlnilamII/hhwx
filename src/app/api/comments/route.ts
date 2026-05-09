import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const MAX_COMMENT_LENGTH = 500;

type CreateCommentRequest = {
  content?: unknown;
};

function parseCommentContent(body: CreateCommentRequest): string {
  if (typeof body.content !== "string") {
    throw new ApiRouteError(400, "INVALID_COMMENT_CONTENT", "评论内容无效");
  }

  const content = body.content.trim();
  if (!content) {
    throw new ApiRouteError(400, "EMPTY_COMMENT", "评论内容不能为空");
  }

  if (content.length > MAX_COMMENT_LENGTH) {
    throw new ApiRouteError(400, "COMMENT_TOO_LONG", `评论内容不能超过 ${MAX_COMMENT_LENGTH} 个字符`);
  }

  return content;
}

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);

    let body: CreateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const content = parseCommentContent(body);
    const serviceClient = createServerSupabaseClient();
    const { data, error } = await serviceClient
      .from("comments")
      .insert({
        user_id: user.id,
        content,
      })
      .select("id, created_at")
      .single();

    if (error) {
      throw new ApiRouteError(500, "COMMENT_CREATE_FAILED", "评论发送失败", error.message);
    }

    return jsonSuccess(data, { status: 201 });
  } catch (error) {
    console.error("Comments POST API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "COMMENTS_POST_FAILED",
      message: "评论发送失败",
    });
  }
}

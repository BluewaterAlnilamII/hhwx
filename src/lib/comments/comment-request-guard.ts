export type CommentTargetRequest = {
  generation: number;
  identity: string;
};

export type LinkedCommentLocateFailure = "missing" | "failed";

export class CommentRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "CommentRequestError";
    this.status = status;
    this.code = code;
  }
}

export class CommentRequestCancelledError extends Error {
  constructor() {
    super("Comment request target changed");
    this.name = "CommentRequestCancelledError";
  }
}

export function isCommentTargetRequestCurrent(
  request: CommentTargetRequest,
  current: CommentTargetRequest,
  isMounted: boolean,
): boolean {
  return isMounted
    && request.generation === current.generation
    && request.identity === current.identity;
}

export function classifyLinkedCommentLocateError(error: unknown): LinkedCommentLocateFailure {
  return error instanceof CommentRequestError
    && (error.status === 404 || error.code === "INVALID_COMMENT_ID")
    ? "missing"
    : "failed";
}

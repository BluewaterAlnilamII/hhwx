import type { AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import type { BandoriAssetRegion } from "@/lib/bandori-asset-proxy";

export type CommentAvatar = {
  cardId: number;
  trainType: AccountAvatarCardTrainType;
  resourceSetName: string | null;
  assetRegion: BandoriAssetRegion;
  displayName: string | null;
};

export type CommentReactionParticipant = {
  userId: string;
  username: string | null;
  avatar: CommentAvatar;
  reactedAt: string;
};

export type CommentReactionSummary = {
  emojiKey: string;
  count: number;
  reactedByViewer: boolean;
  users: CommentReactionParticipant[];
  remainingUserCount: number;
};

export type CommentNode = {
  id: string;
  parentId: string | null;
  rootId: string | null;
  userId: string;
  username: string | null;
  avatar: CommentAvatar;
  content: string | null;
  depth: number;
  replyCount: number;
  reactions: CommentReactionSummary[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
  replyToCommentId: string | null;
  replyToUsername: string | null;
  previewReplies: CommentNode[];
};

export type CommentListResponse = {
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
  page?: number;
  totalPages?: number;
  totalCount?: number;
  totalCommentCount?: number;
};

export type CommentContextResponse = {
  root: CommentNode;
  ancestors: CommentNode[];
  comment: CommentNode;
  rootPage: number;
};

export type CommentReactionState = {
  commentId: string;
  reactions: CommentReactionSummary[];
};

export const COMMENT_INPUT_MAX_LENGTH = 500;
export const COMMENT_ROOT_PAGE_SIZE = 10;

import Image from "next/image";
import { Smile } from "lucide-react";
import { getCommentEmojiSrc } from "@/lib/comments/emoji";

export type CommentReactionEmojiProps = {
  emojiKey: string;
  size?: number;
};

export function CommentReactionEmoji({
  emojiKey,
  size = 20,
}: CommentReactionEmojiProps) {
  const src = getCommentEmojiSrc(emojiKey);
  if (!src) {
    return <Smile size={Math.min(size, 18)} aria-hidden="true" />;
  }

  return (
    <Image
      src={src}
      alt={`:${emojiKey}:`}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

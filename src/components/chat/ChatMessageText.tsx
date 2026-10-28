import { Fragment } from "react";
import { CommentContent } from "@/components/comments/CommentContent";
import type { ChatMention } from "@/lib/chat/chat-contract";

export function ChatMessageText({ content, mentions = [], draft = false }: { content: string; mentions?: ChatMention[]; draft?: boolean }) {
  if (!mentions.length) return draft ? content : <CommentContent content={content} isDeleted={false} className="m-0 text-sm text-inherit leading-[22px]" />;
  const text = [...content];
  const renderText = (value: string) => draft ? value : <CommentContent inline content={value} isDeleted={false} />;
  const highlighted = <>
    {mentions.map((mention, index) => <Fragment key={`${mention.start}:${mention.userId}`}>
      {renderText(text.slice(index ? mentions[index - 1].end : 0, mention.start).join(""))}
      <span data-chat-mention className={draft ? "chat-mention" : "chat-mention font-medium"}>{text.slice(mention.start, mention.end).join("")}</span>
    </Fragment>)}
    {renderText(text.slice(mentions[mentions.length - 1].end).join(""))}
  </>;
  return draft ? highlighted : <p className="m-0 whitespace-pre-wrap text-sm leading-[22px] wrap-anywhere">{highlighted}</p>;
}

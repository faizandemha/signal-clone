"use client";

import Avatar from "./Avatar";
import type { Conversation } from "@/lib/types";
import { classNames, formatDayOrTime } from "@/lib/utils";
import { Users } from "lucide-react";

interface Props {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
  isOtherOnline?: boolean;
}

export default function ConversationListItem({ conversation, active, onClick, isOtherOnline }: Props) {
  const name = conversation.name || "Unknown";
  const lastMessageText = conversation.last_message
    ? conversation.last_message.is_deleted
      ? "This message was deleted"
      : conversation.last_message.content || (conversation.last_message.attachment ? "📎 Attachment" : "")
    : "";
  const preview = conversation.last_message
    ? `${conversation.last_message.sender_display_name.split(" ")[0]}: ${lastMessageText}`
    : "No messages yet";

  return (
    <button
      onClick={onClick}
      className={classNames(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition rounded-lg",
        active ? "bg-signal-blue/10" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
      )}
    >
      <div className="relative">
        <Avatar name={name} color={conversation.avatar_color} size={48} showPresence={conversation.type === "direct"} online={isOtherOnline} />
        {conversation.type === "group" && (
          <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-signal-sidebar dark:bg-signal-sidebar-dark">
            <Users size={10} className="text-signal-textMuted" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="shrink-0 text-[11px] text-signal-textMuted">{formatDayOrTime(conversation.last_message_at)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-signal-textMuted">{preview}</span>
          {conversation.unread_count > 0 && (
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-signal-blue px-1.5 text-[11px] font-medium text-white">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

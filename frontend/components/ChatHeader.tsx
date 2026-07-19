"use client";

import { ArrowLeft, Info, MoreVertical, Phone, Video } from "lucide-react";
import Avatar from "./Avatar";
import type { Conversation } from "@/lib/types";
import { formatLastSeen } from "@/lib/utils";
import { useToast } from "./Toast";

interface Props {
  conversation: Conversation;
  currentUserId: string;
  onlineMap: Record<string, boolean>;
  lastSeenMap: Record<string, string>;
  typingLabel?: string | null;
  onBack?: () => void;
  onOpenInfo: () => void;
}

export default function ChatHeader({ conversation, currentUserId, onlineMap, lastSeenMap, typingLabel, onBack, onOpenInfo }: Props) {
  const { showToast } = useToast();
  const other = conversation.type === "direct" ? conversation.members.find((m) => m.user.id !== currentUserId) : null;
  const subtitle =
    conversation.type === "group"
      ? conversation.members.map((m) => m.user.display_name.split(" ")[0]).join(", ")
      : other
      ? formatLastSeen(lastSeenMap[other.user.id] || other.user.last_seen, onlineMap[other.user.id] ?? other.user.is_online)
      : "";

  return (
    <div className="flex items-center gap-3 border-b border-signal-border bg-white px-4 py-3 dark:border-signal-border-dark dark:bg-signal-panel-dark">
      {onBack && (
        <button onClick={onBack} className="rounded-full p-1.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] md:hidden">
          <ArrowLeft size={19} />
        </button>
      )}
      <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar
          name={conversation.name || "Unknown"}
          color={conversation.avatar_color}
          size={40}
          showPresence={conversation.type === "direct"}
          online={other ? onlineMap[other.user.id] ?? other.user.is_online : false}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{conversation.name}</div>
          <div className="truncate text-xs text-signal-textMuted">{typingLabel || subtitle}</div>
        </div>
      </button>
      <button
        onClick={() => showToast("Voice calls are coming soon", "info")}
        className="rounded-full p-2 text-signal-textMuted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
      >
        <Phone size={18} />
      </button>
      <button
        onClick={() => showToast("Video calls are coming soon", "info")}
        className="rounded-full p-2 text-signal-textMuted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
      >
        <Video size={18} />
      </button>
      <button onClick={onOpenInfo} className="rounded-full p-2 text-signal-textMuted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
        <Info size={18} />
      </button>
    </div>
  );
}

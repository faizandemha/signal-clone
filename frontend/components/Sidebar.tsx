"use client";

import { useState } from "react";
import { LogOut, MessageSquarePlus, Search, Settings, Users } from "lucide-react";
import Avatar from "./Avatar";
import ConversationListItem from "./ConversationListItem";
import type { Conversation, User } from "@/lib/types";
import { classNames } from "@/lib/utils";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  currentUser: User;
  onlineMap: Record<string, boolean>;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  className?: string;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  currentUser,
  onlineMap,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenSettings,
  onLogout,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = conversations.filter((c) => (c.name || "").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={classNames("flex h-full flex-col bg-signal-sidebar dark:bg-signal-sidebar-dark", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full">
            <Avatar name={currentUser.display_name} color={currentUser.avatar_color} size={38} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-11 z-20 w-48 overflow-hidden rounded-xl border border-signal-border bg-white py-1 shadow-lg dark:border-signal-border-dark dark:bg-signal-panel-dark">
                <div className="border-b border-signal-border px-3 py-2 text-sm font-medium dark:border-signal-border-dark">
                  {currentUser.display_name}
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <Settings size={15} /> Settings
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <LogOut size={15} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
        <h1 className="flex-1 text-lg font-semibold">Chats</h1>
        <button
          onClick={onOpenNewGroup}
          className="rounded-full p-2 text-signal-textMuted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          aria-label="New group"
          title="New group"
        >
          <Users size={19} />
        </button>
        <button
          onClick={onOpenNewChat}
          className="rounded-full p-2 text-signal-textMuted hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          aria-label="New chat"
          title="New chat"
        >
          <MessageSquarePlus size={19} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
          <Search size={15} className="text-signal-textMuted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-sm outline-none placeholder:text-signal-textMuted"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && (
          <p className="mt-8 px-3 text-center text-sm text-signal-textMuted">
            {conversations.length === 0 ? "No conversations yet. Start one!" : "No matches."}
          </p>
        )}
        {filtered.map((c) => {
          const other = c.type === "direct" ? c.members.find((m) => m.user.id !== currentUser.id) : null;
          return (
            <ConversationListItem
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
              isOtherOnline={other ? onlineMap[other.user.id] : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

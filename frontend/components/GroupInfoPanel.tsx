"use client";

import { useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import AppearancePicker from "./AppearancePicker";
import { api, ApiError } from "@/lib/api";
import { useToast } from "./Toast";
import type { Contact, Conversation } from "@/lib/types";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";

interface Props {
  conversation: Conversation;
  currentUserId: string;
  contacts: Contact[];
  onClose: () => void;
  onUpdated: (conversation: Conversation) => void;
}

export default function GroupInfoPanel({ conversation, currentUserId, contacts, onClose, onUpdated }: Props) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const isAdmin = conversation.members.find((m) => m.user.id === currentUserId)?.is_admin ?? false;
  const memberIds = new Set(conversation.members.map((m) => m.user.id));
  const addableContacts = contacts.filter((c) => !memberIds.has(c.user.id));

  async function addMember(userId: string) {
    setBusyId(userId);
    try {
      const updated = await api.addMember(conversation.id, userId);
      onUpdated(updated);
      showToast("Member added", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't add member", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(userId: string) {
    setBusyId(userId);
    try {
      const updated = await api.removeMember(conversation.id, userId);
      onUpdated(updated);
      showToast("Member removed", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't remove member", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAppearance(chat_color?: string | null, wallpaper?: string | null) {
    try {
      const updated = await api.updateAppearance(
        conversation.id,
        chat_color !== undefined ? chat_color : conversation.chat_color,
        wallpaper !== undefined ? wallpaper : conversation.wallpaper
      );
      onUpdated(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't save appearance", "error");
    }
  }

  return (
    <Modal title={showAdd ? "Add members" : "Group info"} onClose={onClose}>
      {!showAdd ? (
        <>
          <div className="mb-5 flex flex-col items-center gap-2">
            <Avatar name={conversation.name || "Group"} color={conversation.avatar_color} size={72} />
            <div className="text-lg font-semibold">{conversation.name}</div>
            <div className="text-xs text-signal-textMuted">{conversation.members.length} members</div>
          </div>

          {isAdmin && (
            <button
              onClick={() => setShowAdd(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-signal-blue px-3 py-2 text-sm font-medium text-signal-blue hover:bg-signal-blue/5"
            >
              <UserPlus size={16} /> Add members
            </button>
          )}

          <div className="mb-4 rounded-lg border border-signal-border p-4 dark:border-signal-border-dark">
            <AppearancePicker
              chatColor={conversation.chat_color}
              wallpaper={conversation.wallpaper}
              onChangeColor={(c) => handleAppearance(c, undefined)}
              onChangeWallpaper={(w) => handleAppearance(undefined, w)}
            />
          </div>

          <div className="flex flex-col gap-1">
            {conversation.members.map((m) => (
              <div key={m.user.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar name={m.user.display_name} color={m.user.avatar_color} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.user.display_name} {m.user.id === currentUserId && <span className="text-signal-textMuted">(you)</span>}
                  </div>
                  {m.is_admin && (
                    <div className="flex items-center gap-1 text-[11px] text-signal-blue">
                      <ShieldCheck size={11} /> Admin
                    </div>
                  )}
                </div>
                {isAdmin && m.user.id !== currentUserId && (
                  <button
                    onClick={() => removeMember(m.user.id)}
                    disabled={busyId === m.user.id}
                    className="rounded-full p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
                    aria-label="Remove member"
                  >
                    <UserMinus size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {addableContacts.length === 0 && (
            <p className="py-4 text-center text-sm text-signal-textMuted">All your contacts are already in this group.</p>
          )}
          <div className="flex flex-col gap-1">
            {addableContacts.map((c) => (
              <button
                key={c.id}
                onClick={() => addMember(c.user.id)}
                disabled={busyId === c.user.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/[0.03] disabled:opacity-50 dark:hover:bg-white/[0.05]"
              >
                <Avatar name={c.user.display_name} color={c.user.avatar_color} size={36} />
                <div className="truncate text-sm font-medium">{c.user.display_name}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(false)} className="mt-4 text-sm text-signal-blue hover:underline">
            Back to group info
          </button>
        </>
      )}
    </Modal>
  );
}

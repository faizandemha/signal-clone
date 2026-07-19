"use client";

import { useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import AppearancePicker from "./AppearancePicker";
import { api, ApiError } from "@/lib/api";
import { useToast } from "./Toast";
import type { Conversation } from "@/lib/types";
import { ShieldOff, ShieldCheck } from "lucide-react";

interface Props {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (conversation: Conversation) => void;
}

export default function ContactInfoPanel({ conversation, currentUserId, onClose, onUpdated }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const other = conversation.members.find((m) => m.user.id !== currentUserId)?.user;

  async function toggleBlock() {
    if (!other) return;
    setBusy(true);
    try {
      if (conversation.is_blocked) {
        await api.unblockContact(other.id);
        onUpdated({ ...conversation, is_blocked: false });
        showToast(`Unblocked ${other.display_name}`, "success");
      } else {
        await api.blockContact(other.id);
        onUpdated({ ...conversation, is_blocked: true });
        showToast(`Blocked ${other.display_name}`, "success");
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't update block status", "error");
    } finally {
      setBusy(false);
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

  if (!other) return null;

  return (
    <Modal title="Contact info" onClose={onClose}>
      <div className="mb-5 flex flex-col items-center gap-2">
        <Avatar name={other.display_name} color={other.avatar_color} size={72} />
        <div className="text-lg font-semibold">{other.display_name}</div>
        {other.username && <div className="text-sm text-signal-blue">@{other.username}</div>}
        {other.about && <div className="text-center text-xs text-signal-textMuted">{other.about}</div>}
      </div>

      <div className="mb-5 rounded-lg border border-signal-border p-4 dark:border-signal-border-dark">
        <AppearancePicker
          chatColor={conversation.chat_color}
          wallpaper={conversation.wallpaper}
          onChangeColor={(c) => handleAppearance(c, undefined)}
          onChangeWallpaper={(w) => handleAppearance(undefined, w)}
        />
      </div>

      <button
        onClick={toggleBlock}
        disabled={busy}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
          conversation.is_blocked
            ? "border-signal-blue text-signal-blue hover:bg-signal-blue/5"
            : "border-red-300 text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
        }`}
      >
        {conversation.is_blocked ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
        {conversation.is_blocked ? `Unblock ${other.display_name}` : `Block ${other.display_name}`}
      </button>
    </Modal>
  );
}

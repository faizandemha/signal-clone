"use client";

import { useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { api, ApiError } from "@/lib/api";
import { useToast } from "./Toast";
import type { Contact, Conversation } from "@/lib/types";
import { UserPlus } from "lucide-react";

interface Props {
  contacts: Contact[];
  onClose: () => void;
  onContactAdded: (contact: Contact) => void;
  onConversationReady: (conversation: Conversation) => void;
}

export default function NewChatModal({ contacts, onClose, onContactAdded, onConversationReady }: Props) {
  const { showToast } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setAdding(true);
    try {
      const contact = await api.addContact(identifier.trim());
      onContactAdded(contact);
      setIdentifier("");
      showToast(`${contact.user.display_name} added to your contacts`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't add contact", "error");
    } finally {
      setAdding(false);
    }
  }

  async function startChat(contactUserId: string) {
    setStarting(contactUserId);
    try {
      const conv = await api.createDirectConversation(contactUserId);
      onConversationReady(conv);
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't start chat", "error");
    } finally {
      setStarting(null);
    }
  }

  return (
    <Modal title="New chat" onClose={onClose}>
      <form onSubmit={handleAddContact} className="mb-4 flex flex-col gap-2">
        <label className="text-sm font-medium">Add a contact by phone number or username</label>
        <div className="flex gap-2">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. bob or +15551234567"
            className="flex-1 rounded-lg border border-signal-border bg-transparent px-3 py-2 text-sm outline-none focus:border-signal-blue dark:border-signal-border-dark"
          />
          <button
            disabled={adding}
            className="flex items-center gap-1 rounded-lg bg-signal-blue px-3 py-2 text-sm font-medium text-white hover:bg-signal-blue-dark disabled:opacity-60"
          >
            <UserPlus size={16} />
          </button>
        </div>
      </form>

      <div className="text-sm font-medium text-signal-textMuted">Your contacts</div>
      <div className="mt-2 flex flex-col gap-1">
        {contacts.length === 0 && <p className="py-4 text-center text-sm text-signal-textMuted">No contacts yet — add one above.</p>}
        {contacts.map((c) => (
          <button
            key={c.id}
            onClick={() => startChat(c.user.id)}
            disabled={starting === c.user.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/[0.03] disabled:opacity-60 dark:hover:bg-white/[0.05]"
          >
            <Avatar name={c.user.display_name} color={c.user.avatar_color} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.user.display_name}</div>
              {c.user.username && <div className="truncate text-xs text-signal-textMuted">@{c.user.username}</div>}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

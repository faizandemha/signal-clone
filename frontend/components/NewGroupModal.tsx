"use client";

import { useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { api, ApiError } from "@/lib/api";
import { useToast } from "./Toast";
import type { Contact, Conversation } from "@/lib/types";
import { Check } from "lucide-react";

interface Props {
  contacts: Contact[];
  onClose: () => void;
  onGroupCreated: (conversation: Conversation) => void;
}

export default function NewGroupModal({ contacts, onClose, onGroupCreated }: Props) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || selected.size === 0) return;
    setCreating(true);
    try {
      const conv = await api.createGroup(name.trim(), Array.from(selected));
      onGroupCreated(conv);
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't create group", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      title="New group"
      onClose={onClose}
      footer={
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim() || selected.size === 0}
          className="w-full rounded-lg bg-signal-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-signal-blue-dark disabled:opacity-50"
        >
          {creating ? "Creating…" : `Create group${selected.size ? ` (${selected.size + 1})` : ""}`}
        </button>
      }
    >
      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Group name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekend Trip"
            className="w-full rounded-lg border border-signal-border bg-transparent px-3 py-2 text-sm outline-none focus:border-signal-blue dark:border-signal-border-dark"
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Add members</div>
          {contacts.length === 0 && (
            <p className="py-2 text-sm text-signal-textMuted">Add some contacts first before creating a group.</p>
          )}
          <div className="flex flex-col gap-1">
            {contacts.map((c) => {
              const isSelected = selected.has(c.user.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggle(c.user.id)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <Avatar name={c.user.display_name} color={c.user.avatar_color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.user.display_name}</div>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSelected ? "border-signal-blue bg-signal-blue text-white" : "border-signal-border dark:border-signal-border-dark"
                    }`}
                  >
                    {isSelected && <Check size={13} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}

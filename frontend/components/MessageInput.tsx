"use client";

import { Check, Paperclip, Pencil, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Attachment, Message, ReplyPreview } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "./Toast";

interface Props {
  onSend: (content: string, attachment?: Attachment | null) => void;
  onTyping: (isTyping: boolean) => void;
  replyTo?: ReplyPreview | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  editingMessage?: Message | null;
  onSaveEdit?: (content: string) => void;
  onCancelEdit?: () => void;
}

export default function MessageInput({
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  disabled,
  disabledMessage,
  editingMessage,
  onSaveEdit,
  onCancelEdit,
}: Props) {
  const { showToast } = useToast();
  const [value, setValue] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editingMessage;

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (editingMessage) {
      setValue(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1500);
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await api.uploadFile(file);
      setPendingAttachment(attachment);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const trimmed = value.trim();
    if (isEditing) {
      if (!trimmed && !editingMessage?.attachment) return;
      onSaveEdit?.(trimmed);
      setValue("");
      return;
    }
    if (!trimmed && !pendingAttachment) return;
    onSend(trimmed, pendingAttachment);
    setValue("");
    setPendingAttachment(null);
    onTyping(false);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && isEditing) {
      e.preventDefault();
      setValue("");
      onCancelEdit?.();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (disabled) {
    return (
      <div className="border-t border-signal-border bg-white px-4 py-3 text-center text-xs text-signal-textMuted dark:border-signal-border-dark dark:bg-signal-panel-dark">
        {disabledMessage || "You can't send messages to this conversation."}
      </div>
    );
  }

  return (
    <div className="border-t border-signal-border bg-white px-4 py-3 dark:border-signal-border-dark dark:bg-signal-panel-dark">
      {isEditing && (
        <div className="mb-2 flex items-center justify-between rounded-lg border-l-2 border-signal-blue bg-signal-blue/5 px-3 py-1.5 text-xs">
          <div className="flex min-w-0 items-center gap-1.5 text-signal-blue">
            <Pencil size={12} className="shrink-0" />
            <span className="font-medium">Editing message</span>
          </div>
          <button
            onClick={() => {
              setValue("");
              onCancelEdit?.();
            }}
            className="shrink-0 rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!isEditing && replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg border-l-2 border-signal-blue bg-signal-blue/5 px-3 py-1.5 text-xs">
          <div className="min-w-0">
            <div className="font-medium text-signal-blue">Replying to {replyTo.sender_display_name}</div>
            <div className="truncate text-signal-textMuted">{replyTo.content}</div>
          </div>
          <button onClick={onCancelReply} className="shrink-0 rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
      )}
      {!isEditing && (pendingAttachment || uploading) && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-signal-border bg-signal-sidebar px-3 py-1.5 text-xs dark:border-signal-border-dark dark:bg-signal-sidebar-dark">
          <div className="flex min-w-0 items-center gap-2">
            <Paperclip size={13} className="shrink-0 text-signal-blue" />
            <span className="truncate">
              {uploading ? "Uploading…" : pendingAttachment?.name}
            </span>
          </div>
          {pendingAttachment && !uploading && (
            <button
              onClick={() => setPendingAttachment(null)}
              className="shrink-0 rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        {!isEditing && (
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-signal-textMuted transition hover:bg-black/[0.05] disabled:opacity-40 dark:hover:bg-white/[0.08]"
              aria-label="Attach a file"
              title="Attach an image or file"
            >
              <Paperclip size={19} />
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={isEditing ? "Edit message" : "Type a message"}
          className="max-h-32 flex-1 resize-none rounded-2xl border border-signal-border bg-signal-sidebar px-4 py-2.5 text-sm outline-none focus:border-signal-blue dark:border-signal-border-dark dark:bg-signal-sidebar-dark"
        />
        <button
          onClick={submit}
          disabled={isEditing ? !value.trim() && !editingMessage?.attachment : (!value.trim() && !pendingAttachment) || uploading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal-blue text-white transition hover:bg-signal-blue-dark disabled:opacity-40"
          aria-label={isEditing ? "Save" : "Send"}
        >
          {isEditing ? <Check size={18} /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

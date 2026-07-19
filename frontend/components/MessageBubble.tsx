"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCheck, Clock, File as FileIcon, Download, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Message } from "@/lib/types";
import { formatTime, classNames, resolveAttachmentUrl, formatFileSize } from "@/lib/utils";

interface Props {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  bubbleColor?: string | null;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
}

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "sending") return <Clock size={13} className="text-white/70" />;
  if (status === "read") return <CheckCheck size={15} className="text-sky-300" />;
  if (status === "delivered") return <CheckCheck size={15} className="text-white/70" />;
  return <Check size={15} className="text-white/70" />;
}

function ActionMenu({ isOwn, onEdit, onDelete }: { isOwn: boolean; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={classNames("relative self-start opacity-0 transition-opacity group-hover:opacity-100", open && "opacity-100")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={classNames(
          "flex h-6 w-6 items-center justify-center rounded-full",
          isOwn ? "text-white/80 hover:bg-white/15" : "text-signal-textMuted hover:bg-black/5 dark:hover:bg-white/10"
        )}
        aria-label="Message actions"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          className={classNames(
            "absolute top-full z-10 mt-1 w-32 overflow-hidden rounded-lg border border-signal-border bg-white py-1 text-xs shadow-lg dark:border-signal-border-dark dark:bg-signal-panel-dark",
            isOwn ? "right-0" : "left-0"
          )}
        >
          <button
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message, isOwn, showSender, bubbleColor, onEdit, onDelete }: Props) {
  if (message.is_deleted) {
    return (
      <div className={classNames("flex w-full", isOwn ? "justify-end" : "justify-start")}>
        <div className="max-w-[72%] sm:max-w-[60%]">
          <div
            className={classNames(
              "flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm italic text-signal-textMuted",
              isOwn ? "rounded-br-md bg-black/5 dark:bg-white/5" : "rounded-bl-md bg-signal-bubbleIn dark:bg-signal-bubbleIn-dark"
            )}
          >
            <Ban size={13} className="shrink-0" />
            This message was deleted
          </div>
        </div>
      </div>
    );
  }

  const showActions = isOwn && (onEdit || onDelete);

  return (
    <div className={classNames("group flex w-full animate-fade-in items-end gap-1", isOwn ? "justify-end" : "justify-start")}>
      {showActions && (
        <ActionMenu isOwn={isOwn} onEdit={() => onEdit?.(message)} onDelete={() => onDelete?.(message)} />
      )}
      <div className={classNames("max-w-[72%] sm:max-w-[60%]")}>
        {showSender && !isOwn && (
          <div className="mb-0.5 ml-3 text-xs font-medium" style={{ color: message.sender_avatar_color }}>
            {message.sender_display_name}
          </div>
        )}
        {message.reply_to && (
          <div
            className={classNames(
              "mb-0.5 rounded-t-lg border-l-2 px-3 py-1.5 text-xs opacity-80",
              isOwn
                ? "border-white/60 bg-signal-blue-dark/60 text-white"
                : "border-signal-blue bg-black/5 text-gray-700 dark:bg-white/5 dark:text-gray-200"
            )}
          >
            <div className="font-medium">{message.reply_to.sender_display_name}</div>
            <div className="truncate">{message.reply_to.content}</div>
          </div>
        )}
        <div
          className={classNames(
            "rounded-2xl text-sm shadow-sm",
            message.attachment ? "overflow-hidden" : "px-3.5 py-2",
            isOwn
              ? classNames("text-white rounded-br-md", !bubbleColor && "bg-signal-blue")
              : "bg-signal-bubbleIn text-gray-900 rounded-bl-md dark:bg-signal-bubbleIn-dark dark:text-gray-100"
          )}
          style={isOwn && bubbleColor ? { backgroundColor: bubbleColor } : undefined}
        >
          {message.attachment && message.attachment.content_type.startsWith("image/") && (
            <a href={resolveAttachmentUrl(message.attachment.url)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAttachmentUrl(message.attachment.url)}
                alt={message.attachment.name}
                className="max-h-72 w-full object-cover"
              />
            </a>
          )}
          {message.attachment && !message.attachment.content_type.startsWith("image/") && (
            <a
              href={resolveAttachmentUrl(message.attachment.url)}
              target="_blank"
              rel="noreferrer"
              className={classNames(
                "flex items-center gap-2.5 px-3.5 py-2.5",
                isOwn ? "hover:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <div
                className={classNames(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  isOwn ? "bg-white/20" : "bg-signal-blue/10 text-signal-blue"
                )}
              >
                <FileIcon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{message.attachment.name}</div>
                <div className={classNames("text-[10px]", isOwn ? "text-white/70" : "text-signal-textMuted")}>
                  {formatFileSize(message.attachment.size)}
                </div>
              </div>
              <Download size={14} className={isOwn ? "text-white/70" : "text-signal-textMuted"} />
            </a>
          )}
          {message.content && (
            <div className={classNames("whitespace-pre-wrap break-words", message.attachment && "px-3.5 pt-2")}>
              {message.content}
            </div>
          )}
          <div
            className={classNames(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              isOwn ? "text-white/70" : "text-signal-textMuted",
              message.attachment ? "px-3.5 pb-2" : ""
            )}
          >
            {message.is_edited && <span>edited</span>}
            <span>{formatTime(message.created_at)}</span>
            {isOwn && <StatusTicks status={message.status} />}
          </div>
        </div>
      </div>
    </div>
  );
}

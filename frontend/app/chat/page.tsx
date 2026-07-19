"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSocket, type SocketEvent } from "@/lib/socket-context";
import { api, ApiError } from "@/lib/api";
import type { Contact, Conversation, Message } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import ChatHeader from "@/components/ChatHeader";
import MessageBubble from "@/components/MessageBubble";
import MessageInput from "@/components/MessageInput";
import TypingIndicator from "@/components/TypingIndicator";
import NewChatModal from "@/components/NewChatModal";
import NewGroupModal from "@/components/NewGroupModal";
import GroupInfoPanel from "@/components/GroupInfoPanel";
import ContactInfoPanel from "@/components/ContactInfoPanel";
import SettingsPanel from "@/components/SettingsPanel";
import { useToast } from "@/components/Toast";
import { classNames } from "@/lib/utils";
import type { ReplyPreview } from "@/lib/types";
import { notificationsEnabled, playNotificationSound, showMessageNotification, soundEnabled } from "@/lib/notifications";

type TypingState = Record<string, { userId: string; name: string }[]>;

export default function ChatPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { subscribe, sendTyping } = useSocket();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Message[]>>({});
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState<TypingState>({});
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileThread, setShowMobileThread] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api.listConversations().then(setConversations).catch(() => showToast("Couldn't load conversations", "error"));
    api.listContacts().then(setContacts).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  const selectConversation = useCallback(
    async (id: string) => {
      setActiveId(id);
      setReplyTo(null);
      setEditingMessage(null);
      setShowMobileThread(true);
      if (!messagesByConv[id]) {
        try {
          const msgs = await api.listMessages(id);
          setMessagesByConv((prev) => ({ ...prev, [id]: msgs }));
        } catch {
          showToast("Couldn't load messages", "error");
        }
      }
      api.markRead(id).catch(() => {});
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
    },
    [messagesByConv] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeId, messagesByConv[activeId || ""]?.length]);

  // ---- socket wiring ----
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribe((evt: SocketEvent) => {
      if (evt.type === "message") {
        const msg = evt.message;
        setMessagesByConv((prev) => {
          const existing = prev[msg.conversation_id] || [];
          // Already have the confirmed message (e.g. another tab already
          // applied this same event) - nothing to do.
          if (existing.some((m) => m.id === msg.id)) return prev;

          // This is the server's broadcast confirming a message WE just
          // sent from this tab (the REST call also broadcasts back to the
          // sender). Swap the optimistic "sending" placeholder in place
          // instead of appending a second bubble - whichever of the REST
          // response / this WS event lands first does the real swap, the
          // other becomes a no-op via the id check above and in handleSend.
          if (msg.sender_id === user.id) {
            const tempIdx = existing.findIndex((m) => m.status === "sending" && m.content === msg.content);
            if (tempIdx !== -1) {
              const next = [...existing];
              next[tempIdx] = msg;
              return { ...prev, [msg.conversation_id]: next };
            }
          }

          return { ...prev, [msg.conversation_id]: [...existing, msg] };
        });

        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === msg.conversation_id);
          if (idx === -1) {
            // conversation not loaded yet (e.g. brand new) - refetch list
            api.listConversations().then(setConversations).catch(() => {});
            return prev;
          }
          const isActive = msg.conversation_id === activeId;
          const isOwn = msg.sender_id === user.id;
          const updated = {
            ...prev[idx],
            last_message: msg,
            last_message_at: msg.created_at,
            unread_count: isActive || isOwn ? prev[idx].unread_count : prev[idx].unread_count + 1,
          };
          const rest = prev.filter((_, i) => i !== idx);
          return [updated, ...rest];
        });

        if (msg.conversation_id === activeId && msg.sender_id !== user.id) {
          api.markRead(msg.conversation_id).catch(() => {});
        }

        // Fire a browser notification for incoming messages when the user
        // isn't actively looking at that conversation right now.
        if (msg.sender_id !== user.id && notificationsEnabled()) {
          const isFocusedOnConv = msg.conversation_id === activeId && typeof document !== "undefined" && !document.hidden;
          if (!isFocusedOnConv) {
            const conv = conversations.find((c) => c.id === msg.conversation_id);
            const title = conv?.type === "group" ? `${msg.sender_display_name} in ${conv.name}` : msg.sender_display_name;
            const body = msg.attachment ? `📎 ${msg.attachment.name}` : msg.content;
            showMessageNotification(title, body, () => selectConversation(msg.conversation_id));
            if (soundEnabled()) playNotificationSound();
          }
        }

        // clear typing indicator from this sender once their message lands
        setTyping((prev) => {
          const list = prev[msg.conversation_id];
          if (!list) return prev;
          return { ...prev, [msg.conversation_id]: list.filter((t) => t.userId !== msg.sender_id) };
        });
      } else if (evt.type === "message_edited" || evt.type === "message_deleted") {
        const msg = evt.message;
        setMessagesByConv((prev) => {
          const list = prev[evt.conversation_id];
          if (!list) return prev;
          return { ...prev, [evt.conversation_id]: list.map((m) => (m.id === msg.id ? msg : m)) };
        });
        // If this was the conversation's most recent message, keep the
        // sidebar preview (and its "This message was deleted" tombstone) in sync.
        setConversations((prev) =>
          prev.map((c) => (c.id === evt.conversation_id && c.last_message?.id === msg.id ? { ...c, last_message: msg } : c))
        );
        // Bail out of editing this message from another tab/device if it
        // just got deleted out from under you.
        if (evt.type === "message_deleted") {
          setEditingMessage((current) => (current?.id === msg.id ? null : current));
        }
      } else if (evt.type === "typing") {
        setTyping((prev) => {
          const list = prev[evt.conversation_id] || [];
          const withoutUser = list.filter((t) => t.userId !== evt.user_id);
          return {
            ...prev,
            [evt.conversation_id]: evt.is_typing ? [...withoutUser, { userId: evt.user_id, name: evt.display_name }] : withoutUser,
          };
        });
        if (evt.is_typing) {
          const key = `${evt.conversation_id}:${evt.user_id}`;
          if (typingClearTimers.current[key]) clearTimeout(typingClearTimers.current[key]);
          typingClearTimers.current[key] = setTimeout(() => {
            setTyping((prev) => {
              const list = prev[evt.conversation_id] || [];
              return { ...prev, [evt.conversation_id]: list.filter((t) => t.userId !== evt.user_id) };
            });
          }, 4000);
        }
      } else if (evt.type === "message_status") {
        setMessagesByConv((prev) => {
          const list = prev[evt.conversation_id];
          if (!list) return prev;
          const updatedList = list.map((m) => {
            if (evt.message_id && m.id === evt.message_id) return { ...m, status: evt.status as Message["status"] };
            if (!evt.message_id && evt.status === "read" && m.sender_id === user.id) return { ...m, status: "read" as const };
            return m;
          });
          return { ...prev, [evt.conversation_id]: updatedList };
        });
      } else if (evt.type === "presence") {
        setOnlineMap((prev) => ({ ...prev, [evt.user_id]: evt.is_online }));
        setLastSeenMap((prev) => ({ ...prev, [evt.user_id]: evt.last_seen }));
      }
    });

    return unsubscribe;
  }, [subscribe, user, activeId, conversations, selectConversation]);

  function handleSend(content: string, attachment?: import("@/lib/types").Attachment | null) {
    if (!activeConversation || !user) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: activeConversation.id,
      sender_id: user.id,
      sender_display_name: user.display_name,
      sender_avatar_color: user.avatar_color,
      content,
      status: "sending",
      created_at: new Date().toISOString(),
      reply_to: replyTo,
      attachment: attachment || null,
      is_edited: false,
      is_deleted: false,
    };
    setMessagesByConv((prev) => ({
      ...prev,
      [activeConversation.id]: [...(prev[activeConversation.id] || []), optimistic],
    }));
    setReplyTo(null);

    api
      .sendMessage(activeConversation.id, content, replyTo?.id, attachment)
      .then((saved) => {
        setMessagesByConv((prev) => {
          const list = prev[activeConversation.id] || [];
          // The WS broadcast may have already swapped the temp placeholder
          // for the real message by the time this REST response lands -
          // don't add a second copy if so, just drop any leftover temp entry.
          if (list.some((m) => m.id === saved.id)) {
            return { ...prev, [activeConversation.id]: list.filter((m) => m.id !== tempId) };
          }
          return {
            ...prev,
            [activeConversation.id]: list.map((m) => (m.id === tempId ? saved : m)),
          };
        });
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === activeConversation.id);
          if (idx === -1) return prev;
          const updated = { ...prev[idx], last_message: saved, last_message_at: saved.created_at };
          const rest = prev.filter((_, i) => i !== idx);
          return [updated, ...rest];
        });
      })
      .catch((err) => {
        // A 403 here means the other person has blocked us (our own
        // is_blocked flag only ever reflects blocks WE placed, so this is
        // the only signal we get for that case).
        const message = err instanceof ApiError && err.status === 403 ? err.message : "Message failed to send";
        showToast(message, "error");
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConversation.id]: (prev[activeConversation.id] || []).filter((m) => m.id !== tempId),
        }));
      });
  }

  function handleTyping(isTyping: boolean) {
    if (!activeConversation) return;
    sendTyping(activeConversation.id, isTyping);
  }

  function handleStartEdit(message: Message) {
    setReplyTo(null);
    setEditingMessage(message);
  }

  function handleCancelEdit() {
    setEditingMessage(null);
  }

  function handleSaveEdit(content: string) {
    if (!activeConversation || !editingMessage) return;
    const messageId = editingMessage.id;
    const previous = messagesByConv[activeConversation.id] || [];

    // Optimistic update, reconciled (or reverted) once the request resolves.
    setMessagesByConv((prev) => ({
      ...prev,
      [activeConversation.id]: (prev[activeConversation.id] || []).map((m) =>
        m.id === messageId ? { ...m, content, is_edited: true } : m
      ),
    }));
    setEditingMessage(null);

    api
      .editMessage(activeConversation.id, messageId, content)
      .then((saved) => {
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConversation.id]: (prev[activeConversation.id] || []).map((m) => (m.id === saved.id ? saved : m)),
        }));
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversation.id && c.last_message?.id === saved.id ? { ...c, last_message: saved } : c))
        );
      })
      .catch((err) => {
        showToast(err instanceof ApiError ? err.message : "Couldn't save the edit", "error");
        setMessagesByConv((prev) => ({ ...prev, [activeConversation.id]: previous }));
      });
  }

  function handleDeleteMessage(message: Message) {
    if (!activeConversation) return;
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    const conversationId = activeConversation.id;
    const previous = messagesByConv[conversationId] || [];

    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] || []).map((m) =>
        m.id === message.id ? { ...m, content: "", attachment: null, is_deleted: true } : m
      ),
    }));
    if (editingMessage?.id === message.id) setEditingMessage(null);

    api
      .deleteMessage(conversationId, message.id)
      .then((saved) => {
        setMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] || []).map((m) => (m.id === saved.id ? saved : m)),
        }));
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId && c.last_message?.id === saved.id ? { ...c, last_message: saved } : c))
        );
      })
      .catch((err) => {
        showToast(err instanceof ApiError ? err.message : "Couldn't delete the message", "error");
        setMessagesByConv((prev) => ({ ...prev, [conversationId]: previous }));
      });
  }

  function handleConversationReady(conv: Conversation) {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
    selectConversation(conv.id);
  }

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-signal-bg dark:bg-signal-bg-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-blue border-t-transparent" />
      </div>
    );
  }

  const activeMessages = activeId ? messagesByConv[activeId] || [] : [];
  const activeTyping = activeId ? typing[activeId] || [] : [];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-signal-bg dark:bg-signal-bg-dark">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        currentUser={user}
        onlineMap={onlineMap}
        onOpenNewChat={() => setShowNewChat(true)}
        onOpenNewGroup={() => setShowNewGroup(true)}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={logout}
        className={classNames("w-full shrink-0 border-r border-signal-border dark:border-signal-border-dark md:w-[360px]", showMobileThread && "hidden md:flex")}
      />

      <div className={classNames("flex flex-1 flex-col", !showMobileThread && "hidden md:flex")}>
        {activeConversation ? (
          <>
            <ChatHeader
              conversation={activeConversation}
              currentUserId={user.id}
              onlineMap={onlineMap}
              lastSeenMap={lastSeenMap}
              typingLabel={activeTyping.length > 0 ? `${activeTyping.map((t) => t.name.split(" ")[0]).join(", ")} typing…` : null}
              onBack={() => setShowMobileThread(false)}
              onOpenInfo={() => (activeConversation.type === "group" ? setShowGroupInfo(true) : setShowContactInfo(true))}
            />
            {activeConversation.is_blocked && (
              <div className="border-b border-signal-border bg-signal-sidebar px-4 py-2 text-center text-xs text-signal-textMuted dark:border-signal-border-dark dark:bg-signal-sidebar-dark">
                You blocked this contact.{" "}
                <button className="font-medium text-signal-blue hover:underline" onClick={() => setShowContactInfo(true)}>
                  Unblock
                </button>{" "}
                to send messages.
              </div>
            )}
            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-8"
              style={activeConversation.wallpaper ? { backgroundColor: activeConversation.wallpaper } : undefined}
            >
              {activeMessages.map((m, idx) => {
                const prev = activeMessages[idx - 1];
                const showSender = activeConversation.type === "group" && (!prev || prev.sender_id !== m.sender_id);
                const isOwn = m.sender_id === user.id;
                return (
                  <div
                    key={m.id}
                    onDoubleClick={() => {
                      if (m.is_deleted) return;
                      setEditingMessage(null);
                      setReplyTo({ id: m.id, content: m.content, sender_display_name: m.sender_display_name });
                    }}
                  >
                    <MessageBubble
                      message={m}
                      isOwn={isOwn}
                      showSender={showSender}
                      bubbleColor={activeConversation.chat_color}
                      onEdit={isOwn ? handleStartEdit : undefined}
                      onDelete={isOwn ? handleDeleteMessage : undefined}
                    />
                  </div>
                );
              })}
              {activeMessages.length === 0 && (
                <p className="mt-10 text-center text-sm text-signal-textMuted">
                  No messages yet. Say hello 👋 (double-click a message to reply)
                </p>
              )}
              {activeTyping.length > 0 && <TypingIndicator />}
            </div>
            <MessageInput
              onSend={handleSend}
              onTyping={handleTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              disabled={activeConversation.is_blocked}
              disabledMessage="You blocked this contact. Unblock them from Contact info to send messages."
              editingMessage={editingMessage}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-signal-textMuted">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-signal-blue/10 text-signal-blue">
              <MessageCircle size={30} />
            </div>
            <p className="text-sm">Select a conversation or start a new one</p>
          </div>
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          contacts={contacts}
          onClose={() => setShowNewChat(false)}
          onContactAdded={(c) => setContacts((prev) => [...prev, c])}
          onConversationReady={handleConversationReady}
        />
      )}
      {showNewGroup && (
        <NewGroupModal contacts={contacts} onClose={() => setShowNewGroup(false)} onGroupCreated={handleConversationReady} />
      )}
      {showGroupInfo && activeConversation && (
        <GroupInfoPanel
          conversation={activeConversation}
          currentUserId={user.id}
          contacts={contacts}
          onClose={() => setShowGroupInfo(false)}
          onUpdated={(updated) => setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
        />
      )}
      {showContactInfo && activeConversation && activeConversation.type === "direct" && (
        <ContactInfoPanel
          conversation={activeConversation}
          currentUserId={user.id}
          onClose={() => setShowContactInfo(false)}
          onUpdated={(updated) => setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
        />
      )}
      {showSettings && <SettingsPanel user={user} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

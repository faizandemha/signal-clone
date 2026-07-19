// What you see about OTHER people - their @username, never their private
// login email/phone. Used for contacts, group members, and search results.
export interface PublicUser {
  id: string;
  username: string | null;
  display_name: string;
  avatar_color: string;
  about: string;
  is_online: boolean;
  last_seen: string;
}

// Your own account - includes the login identifier, only ever returned for
// the currently-authenticated user (never when looking up someone else).
export interface User extends PublicUser {
  identifier: string;
}

export interface Contact {
  id: string;
  nickname: string | null;
  user: PublicUser;
  is_blocked: boolean;
}

export interface SessionInfo {
  id: string;
  device_label: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}

export interface ReplyPreview {
  id: string;
  content: string;
  sender_display_name: string;
}

export interface Attachment {
  url: string;
  name: string;
  content_type: string;
  size: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_display_name: string;
  sender_avatar_color: string;
  content: string;
  status: "sending" | "sent" | "delivered" | "read";
  created_at: string;
  reply_to: ReplyPreview | null;
  attachment: Attachment | null;
  is_edited: boolean;
  is_deleted: boolean;
}

export interface Member {
  user: PublicUser;
  is_admin: boolean;
  joined_at: string;
}

export interface Conversation {
  id: string;
  type: "direct" | "group";
  name: string | null;
  avatar_color: string;
  members: Member[];
  last_message: Message | null;
  unread_count: number;
  last_message_at: string;
  chat_color: string | null;
  wallpaper: string | null;
  is_blocked: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

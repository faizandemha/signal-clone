import type { Attachment, AuthResponse, Contact, Conversation, Message, PublicUser, SessionInfo, User } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("signal_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Note: no Content-Type here on purpose - the browser sets the multipart
  // boundary itself when given a FormData body.
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  requestOtp: (identifier: string) =>
    request<{ message: string; otp_hint: string | null }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  verifyOtp: (identifier: string, otp: string) =>
    request<AuthResponse>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, otp }),
    }),

  completeProfile: (display_name: string, username: string, avatar_color: string, about?: string) =>
    request<User>("/api/auth/profile", {
      method: "POST",
      body: JSON.stringify({ display_name, username, avatar_color, about }),
    }),

  me: () => request<User>("/api/auth/me"),

  logout: () => request<{ message: string }>("/api/auth/logout", { method: "POST" }),

  listContacts: () => request<Contact[]>("/api/contacts"),

  addContact: (identifier: string, nickname?: string) =>
    request<Contact>("/api/contacts", { method: "POST", body: JSON.stringify({ identifier, nickname }) }),

  searchUsers: (q: string) => request<PublicUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`),

  listConversations: () => request<Conversation[]>("/api/conversations"),

  createDirectConversation: (contact_user_id: string) =>
    request<Conversation>("/api/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ contact_user_id }),
    }),

  createGroup: (name: string, member_ids: string[]) =>
    request<Conversation>("/api/conversations/group", {
      method: "POST",
      body: JSON.stringify({ name, member_ids }),
    }),

  getConversation: (id: string) => request<Conversation>(`/api/conversations/${id}`),

  listMessages: (id: string, before?: string) =>
    request<Message[]>(`/api/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),

  sendMessage: (id: string, content: string, reply_to_id?: string, attachment?: Attachment | null) =>
    request<Message>(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        reply_to_id,
        attachment_url: attachment?.url,
        attachment_name: attachment?.name,
        attachment_type: attachment?.content_type,
        attachment_size: attachment?.size,
      }),
    }),

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return uploadRequest<Attachment>("/api/uploads", formData);
  },

  editMessage: (conversationId: string, messageId: string, content: string) =>
    request<Message>(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (conversationId: string, messageId: string) =>
    request<Message>(`/api/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }),

  markRead: (id: string) => request<{ message: string }>(`/api/conversations/${id}/read`, { method: "POST" }),

  addMember: (conversationId: string, user_id: string) =>
    request<Conversation>(`/api/conversations/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id }),
    }),

  removeMember: (conversationId: string, userId: string) =>
    request<Conversation>(`/api/conversations/${conversationId}/members/${userId}`, { method: "DELETE" }),

  updateAppearance: (conversationId: string, chat_color?: string | null, wallpaper?: string | null) =>
    request<Conversation>(`/api/conversations/${conversationId}/appearance`, {
      method: "PATCH",
      body: JSON.stringify({ chat_color, wallpaper }),
    }),

  blockContact: (userId: string) => request<{ message: string }>(`/api/contacts/${userId}/block`, { method: "POST" }),

  unblockContact: (userId: string) =>
    request<{ message: string }>(`/api/contacts/${userId}/block`, { method: "DELETE" }),

  listBlockedContacts: () => request<Contact[]>("/api/contacts/blocked"),

  listSessions: () => request<SessionInfo[]>("/api/auth/sessions"),

  revokeSession: (sessionId: string) =>
    request<{ message: string }>(`/api/auth/sessions/${sessionId}`, { method: "DELETE" }),
};

export function setToken(token: string) {
  localStorage.setItem("signal_token", token);
}
export function clearToken() {
  localStorage.removeItem("signal_token");
}
export function getStoredToken() {
  return getToken();
}

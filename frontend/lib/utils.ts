export function resolveAttachmentUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return `${apiUrl}${url}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDayOrTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return formatTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatLastSeen(iso: string, isOnline: boolean): string {
  if (isOnline) return "online";
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "last seen just now";
  if (diffMin < 60) return `last seen ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `last seen ${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `last seen ${diffDay}d ago`;
}

export function classNames(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(" ");
}

export const AVATAR_COLORS = [
  "#3a76f0", "#2e9e6d", "#e0633f", "#9b59d0", "#e0b23f",
  "#3fb6c9", "#d95f9c", "#7c8bb0", "#c95151", "#5a9cf8",
];

// Same palette doubles as the "chat color" swatches for outgoing bubbles.
export const CHAT_COLORS = AVATAR_COLORS;

// Wallpaper presets for the chat background - solid tints plus "default".
export const WALLPAPER_PRESETS: { key: string; label: string; value: string | null }[] = [
  { key: "default", label: "Default", value: null },
  { key: "midnight", label: "Midnight", value: "#0b0d10" },
  { key: "slate", label: "Slate", value: "#161a20" },
  { key: "forest", label: "Forest", value: "#0f1c16" },
  { key: "plum", label: "Plum", value: "#1a1220" },
  { key: "ocean", label: "Ocean", value: "#0d1a24" },
];

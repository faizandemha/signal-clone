"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Laptop,
  Lock,
  Moon,
  Palette,
  Smartphone,
  Sun,
  Volume2,
} from "lucide-react";
import type { Contact, SessionInfo, User } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import {
  notificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
  setSoundEnabled,
  soundEnabled,
} from "@/lib/notifications";
import { formatDayOrTime } from "@/lib/utils";

interface Props {
  user: User;
  onClose: () => void;
}

type View = "main" | "notifications" | "blocked" | "devices";

function Row({
  icon,
  title,
  subtitle,
  right,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left ${onClick ? "hover:bg-black/5 dark:hover:bg-white/5" : ""}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal-blue/10 text-signal-blue">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-signal-textMuted">{subtitle}</div>
      </div>
      {right ?? (onClick ? <ChevronRight size={16} className="shrink-0 text-signal-textMuted" /> : null)}
    </Comp>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-signal-blue" : "bg-gray-300 dark:bg-gray-600"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button onClick={onBack} className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Back">
        <ArrowLeft size={18} />
      </button>
      <div className="text-base font-semibold">{title}</div>
    </div>
  );
}

export default function SettingsPanel({ user, onClose }: Props) {
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<View>("main");

  const [notifOn, setNotifOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [notifDenied, setNotifDenied] = useState(false);

  const [blocked, setBlocked] = useState<Contact[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setNotifOn(notificationsEnabled());
    setSoundOn(soundEnabled());
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifDenied(Notification.permission === "denied");
    }
  }, []);

  useEffect(() => {
    if (view === "blocked") {
      setBlockedLoading(true);
      setBlockedError(null);
      api
        .listBlockedContacts()
        .then(setBlocked)
        .catch((err) => setBlockedError(err instanceof ApiError ? err.message : "Failed to load blocked contacts"))
        .finally(() => setBlockedLoading(false));
    }
    if (view === "devices") {
      setSessionsLoading(true);
      setSessionsError(null);
      api
        .listSessions()
        .then((list) =>
          setSessions([...list].sort((a, b) => (a.is_current ? -1 : b.is_current ? 1 : +new Date(b.last_active_at) - +new Date(a.last_active_at))))
        )
        .catch((err) => setSessionsError(err instanceof ApiError ? err.message : "Failed to load sessions"))
        .finally(() => setSessionsLoading(false));
    }
  }, [view]);

  function toggleDark(v: boolean) {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("signal_theme", v ? "dark" : "light");
  }

  async function toggleNotifications(v: boolean) {
    if (v) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setNotifDenied(typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied");
        setNotifOn(false);
        setNotificationsEnabled(false);
        return;
      }
    }
    setNotifOn(v);
    setNotificationsEnabled(v);
  }

  function toggleSound(v: boolean) {
    setSoundOn(v);
    setSoundEnabled(v);
  }

  async function handleUnblock(userId: string) {
    setBlocked((prev) => prev.filter((c) => c.user.id !== userId));
    try {
      await api.unblockContact(userId);
    } catch {
      // Refresh to recover true state if the call failed.
      api.listBlockedContacts().then(setBlocked).catch(() => {});
    }
  }

  async function handleRevoke(sessionId: string) {
    setRevoking(sessionId);
    try {
      await api.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Failed to log out that device");
    } finally {
      setRevoking(null);
    }
  }

  const title = view === "main" ? "Settings" : view === "notifications" ? "Notifications" : view === "blocked" ? "Blocked contacts" : "Linked devices";

  return (
    <Modal title={title} onClose={onClose}>
      {view === "main" && (
        <>
          <div className="mb-5 flex flex-col items-center gap-2">
            <Avatar name={user.display_name} color={user.avatar_color} size={72} />
            <div className="text-lg font-semibold">{user.display_name}</div>
            {user.username && <div className="text-sm text-signal-blue">@{user.username}</div>}
            <div className="text-xs text-signal-textMuted">Signs in with {user.identifier}</div>
          </div>

          <div className="divide-y divide-signal-border dark:divide-signal-border-dark">
            <Row
              icon={dark ? <Moon size={16} /> : <Sun size={16} />}
              title="Appearance"
              subtitle="Toggle dark mode"
              right={<Toggle checked={dark} onChange={toggleDark} />}
            />
            <Row
              icon={<Lock size={16} />}
              title="Blocked contacts"
              subtitle="Manage people you've blocked"
              onClick={() => setView("blocked")}
            />
            <Row
              icon={<Bell size={16} />}
              title="Notifications"
              subtitle={notifOn ? "On" : "Off"}
              onClick={() => setView("notifications")}
            />
            <Row
              icon={<Palette size={16} />}
              title="Chat color & wallpaper"
              subtitle="Open a chat and tap its name to customize"
            />
            <Row
              icon={<Smartphone size={16} />}
              title="Linked devices"
              subtitle="See where you're signed in"
              onClick={() => setView("devices")}
            />
          </div>
        </>
      )}

      {view === "notifications" && (
        <>
          <SubHeader title="Notifications" onBack={() => setView("main")} />
          <div className="divide-y divide-signal-border dark:divide-signal-border-dark">
            <Row
              icon={<Bell size={16} />}
              title="Message notifications"
              subtitle={notifDenied ? "Blocked in browser settings" : "Show a notification for new messages"}
              right={<Toggle checked={notifOn} onChange={toggleNotifications} />}
            />
            <Row
              icon={<Volume2 size={16} />}
              title="Sound"
              subtitle="Play a sound with notifications"
              right={<Toggle checked={soundOn} onChange={toggleSound} />}
            />
          </div>
          {notifDenied && (
            <p className="mt-3 text-xs text-signal-textMuted">
              Notifications are blocked for this site at the browser level. Enable them in your browser&apos;s site settings to turn this on.
            </p>
          )}
        </>
      )}

      {view === "blocked" && (
        <>
          <SubHeader title="Blocked contacts" onBack={() => setView("main")} />
          {blockedLoading && <p className="py-6 text-center text-sm text-signal-textMuted">Loading…</p>}
          {blockedError && <p className="py-6 text-center text-sm text-red-500">{blockedError}</p>}
          {!blockedLoading && !blockedError && blocked.length === 0 && (
            <p className="py-6 text-center text-sm text-signal-textMuted">You haven&apos;t blocked anyone.</p>
          )}
          <div className="flex flex-col gap-1">
            {blocked.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar name={c.user.display_name} color={c.user.avatar_color} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.nickname || c.user.display_name}</div>
                  {c.user.username && <div className="truncate text-xs text-signal-textMuted">@{c.user.username}</div>}
                </div>
                <button
                  onClick={() => handleUnblock(c.user.id)}
                  className="shrink-0 rounded-full border border-signal-border px-3 py-1 text-xs font-medium hover:bg-black/5 dark:border-signal-border-dark dark:hover:bg-white/5"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "devices" && (
        <>
          <SubHeader title="Linked devices" onBack={() => setView("main")} />
          {sessionsLoading && <p className="py-6 text-center text-sm text-signal-textMuted">Loading…</p>}
          {sessionsError && <p className="py-2 text-center text-sm text-red-500">{sessionsError}</p>}
          <div className="flex flex-col gap-1">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal-blue/10 text-signal-blue">
                  <Laptop size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {s.device_label}
                    {s.is_current && <span className="ml-2 rounded-full bg-signal-blue/10 px-2 py-0.5 text-[10px] font-medium text-signal-blue">This device</span>}
                  </div>
                  <div className="truncate text-xs text-signal-textMuted">Active {formatDayOrTime(s.last_active_at)}</div>
                </div>
                {!s.is_current && (
                  <button
                    onClick={() => handleRevoke(s.id)}
                    disabled={revoking === s.id}
                    className="shrink-0 rounded-full border border-signal-border px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-signal-border-dark dark:hover:bg-white/5"
                  >
                    {revoking === s.id ? "…" : "Log out"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

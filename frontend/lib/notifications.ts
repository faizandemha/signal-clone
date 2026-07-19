"use client";

const ENABLED_KEY = "signal_notifications_enabled";
const SOUND_KEY = "signal_notification_sound";

export function notificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ENABLED_KEY) === "true";
}

export function setNotificationsEnabled(value: boolean) {
  localStorage.setItem(ENABLED_KEY, value ? "true" : "false");
}

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(SOUND_KEY);
  return stored === null ? true : stored === "true";
}

export function setSoundEnabled(value: boolean) {
  localStorage.setItem(SOUND_KEY, value ? "true" : "false");
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showMessageNotification(title: string, body: string, onClick?: () => void) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "signal-clone-message",
    });
    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
  } catch {
    /* Notification constructor can throw in some contexts (e.g. Safari on
       an inactive tab) - a missed notification isn't worth crashing over. */
  }
}

// A short synthesized "pop" tone via Web Audio API - avoids shipping an
// audio asset for one sound effect.
export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
    osc.onended = () => ctx.close();
  } catch {
    /* audio can fail (autoplay policies, unsupported browser) - non-fatal */
  }
}

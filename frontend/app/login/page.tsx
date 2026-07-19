"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/Toast";
import { AVATAR_COLORS, initials } from "@/lib/utils";
import type { AuthResponse } from "@/lib/types";

type Step = "identifier" | "otp" | "profile";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [pendingAuth, setPendingAuth] = useState<AuthResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Keep it forgiving to type (auto-lowercase, strip spaces/symbols) so
    // people don't get blocked by a validator before they've even finished typing.
    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
  }

  async function submitIdentifier(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    try {
      const res = await api.requestOtp(identifier.trim());
      setOtpHint(res.otp_hint);
      setStep("otp");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    try {
      const res = await api.verifyOtp(identifier.trim(), otp.trim());
      if (res.is_new_user) {
        setPendingAuth(res);
        setDisplayName(res.user.display_name);
        // Suggest a starting-point username from whatever they typed (e.g.
        // "alice@example.com" -> "alice"), still fully editable below.
        const suggested = identifier
          .split("@")[0]
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "")
          .slice(0, 20);
        setUsername(suggested.length >= 3 ? suggested : "");
        setStep("profile");
      } else {
        login(res.token, res.user);
        router.replace("/chat");
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Invalid code", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAuth || !displayName.trim() || !usernameValid) return;
    setLoading(true);
    try {
      login(pendingAuth.token, pendingAuth.user);
      const updated = await api.completeProfile(displayName.trim(), username, avatarColor);
      login(pendingAuth.token, updated);
      router.replace("/chat");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast("That username is taken — try another one", "error");
      } else {
        showToast(err instanceof ApiError ? err.message : "Couldn't save your profile", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-signal-blue/10 to-transparent px-4 dark:from-signal-blue/5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-signal-blue text-white shadow-lg">
            <MessageCircle size={28} />
          </div>
          <h1 className="text-2xl font-semibold">Signal</h1>
          <p className="mt-1 text-sm text-signal-textMuted">Private messaging, reimagined.</p>
        </div>

        <div className="rounded-2xl border border-signal-border bg-white p-6 shadow-sm dark:border-signal-border-dark dark:bg-signal-panel-dark">
          {step === "identifier" && (
            <form onSubmit={submitIdentifier} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email, phone number, or username</label>
                <input
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@email.com or +15551234567"
                  className="w-full rounded-lg border border-signal-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-signal-blue dark:border-signal-border-dark"
                />
              </div>
              <button
                disabled={loading}
                className="rounded-lg bg-signal-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-signal-blue-dark disabled:opacity-60"
              >
                {loading ? "Sending code…" : "Continue"}
              </button>
              <p className="text-center text-xs text-signal-textMuted">
                Verification is mocked for this demo — the code will be shown directly on the next screen,
                no real email or SMS is sent.
              </p>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={submitOtp} className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-signal-blue/10 px-3 py-2 text-xs text-signal-blue">
                <ShieldCheck size={16} />
                <span>Demo OTP: <strong>{otpHint}</strong> (verification is mocked for this demo, so the code is shown here instead of being emailed/texted)</span>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Enter the 6-digit code</label>
                <input
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-lg border border-signal-border bg-transparent px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-signal-blue dark:border-signal-border-dark"
                  maxLength={6}
                />
              </div>
              <button
                disabled={loading}
                className="rounded-lg bg-signal-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-signal-blue-dark disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => setStep("identifier")}
                className="text-center text-xs text-signal-textMuted hover:underline"
              >
                Use a different number or username
              </button>
            </form>
          )}

          {step === "profile" && (
            <form onSubmit={submitProfile} className="flex flex-col gap-4">
              <p className="text-sm text-signal-textMuted">Set up your profile so your contacts recognize you.</p>
              <div className="flex justify-center">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials(displayName || "?")}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Display name</label>
                <input
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-signal-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-signal-blue dark:border-signal-border-dark"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Username</label>
                <div className="flex items-center rounded-lg border border-signal-border bg-transparent px-3 dark:border-signal-border-dark focus-within:border-signal-blue">
                  <span className="text-sm text-signal-textMuted">@</span>
                  <input
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="username"
                    className="w-full bg-transparent px-1 py-2.5 text-sm outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-signal-textMuted">
                  {username && !usernameValid
                    ? "3-20 characters: lowercase letters, numbers, and underscores only"
                    : "This is what other people search for and add you by — your email/phone stays private."}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Avatar color</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setAvatarColor(c)}
                      className="h-7 w-7 rounded-full ring-offset-2 transition"
                      style={{ backgroundColor: c, outline: avatarColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                    />
                  ))}
                </div>
              </div>
              <button
                disabled={loading || !usernameValid || !displayName.trim()}
                className="rounded-lg bg-signal-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-signal-blue-dark disabled:opacity-60"
              >
                {loading ? "Saving…" : "Start messaging"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

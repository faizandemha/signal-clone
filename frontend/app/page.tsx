"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/chat" : "/login");
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-signal-bg dark:bg-signal-bg-dark">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-blue border-t-transparent" />
    </div>
  );
}

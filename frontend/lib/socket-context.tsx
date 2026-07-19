"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";

export type SocketEvent =
  | { type: "message"; message: import("./types").Message }
  | { type: "message_edited"; conversation_id: string; message: import("./types").Message }
  | { type: "message_deleted"; conversation_id: string; message: import("./types").Message }
  | { type: "typing"; conversation_id: string; user_id: string; display_name: string; is_typing: boolean }
  | { type: "message_status"; conversation_id: string; message_id?: string; status: string; reader_id?: string }
  | { type: "presence"; user_id: string; is_online: boolean; last_seen: string };

type Handler = (evt: SocketEvent) => void;

interface SocketContextValue {
  connected: boolean;
  subscribe: (handler: Handler) => () => void;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<Handler>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SocketEvent;
          handlersRef.current.forEach((h) => h(data));
        } catch {
          /* ignore malformed frame */
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token]);

  const subscribe = (handler: Handler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  };

  const sendTyping = (conversationId: string, isTyping: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "typing", conversation_id: conversationId, is_typing: isTyping }));
    }
  };

  return (
    <SocketContext.Provider value={{ connected, subscribe, sendTyping }}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}

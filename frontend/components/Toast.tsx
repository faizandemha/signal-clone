"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { classNames } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={classNames(
              "animate-fade-in pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg",
              "bg-white dark:bg-signal-panel-dark border border-signal-border dark:border-signal-border-dark",
              "text-gray-800 dark:text-gray-100"
            )}
          >
            {t.kind === "success" && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
            {t.kind === "error" && <XCircle size={16} className="text-red-500 shrink-0" />}
            {t.kind === "info" && <Info size={16} className="text-signal-blue shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

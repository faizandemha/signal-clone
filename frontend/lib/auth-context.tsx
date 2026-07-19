"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getStoredToken, setToken as persistToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredToken();
    if (!stored) {
      setLoading(false);
      return;
    }
    setTokenState(stored);
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        clearToken();
        setTokenState(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((newToken: string, newUser: User) => {
    persistToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
  }, []);

  const updateUser = useCallback((newUser: User) => {
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

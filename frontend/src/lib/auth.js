import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("nm_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("nm_token"));
  const [loading, setLoading] = useState(false);

  const save = (t, u) => {
    localStorage.setItem("nm_token", t);
    localStorage.setItem("nm_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      save(data.token, data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.response?.data?.detail || "Login failed" };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (name, email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      save(data.token, data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.response?.data?.detail || "Register failed" };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("nm_token");
    localStorage.removeItem("nm_user");
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (!token) return;
    api.get("/auth/me").catch(() => logout());
  }, [token]);

  return (
    <AuthCtx.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

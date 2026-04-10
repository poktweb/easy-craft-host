import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { API_URL } from "@/lib/api";

interface AuthContextType {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  canHost: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function clearStoredSession() {
  localStorage.removeItem("mchost_token");
  localStorage.removeItem("mchost_user");
}

function applyProfilePayload(
  setCanHost: (v: boolean) => void,
  setIsAdmin: (v: boolean) => void,
  data: { canHost?: boolean; isAdmin?: boolean }
) {
  if (typeof data.canHost === "boolean") setCanHost(data.canHost);
  if (typeof data.isAdmin === "boolean") setIsAdmin(data.isAdmin);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("mchost_token"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("mchost_user"));
  const [canHost, setCanHost] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const refreshProfile = useCallback(async () => {
    const stored = localStorage.getItem("mchost_token");
    if (!stored) return;
    try {
      const res = await fetch(`${API_URL}/api/auth/validate`, {
        headers: { Authorization: `Bearer ${stored}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        valid?: boolean;
        username?: string;
        canHost?: boolean;
        isAdmin?: boolean;
      };
      if (!data?.valid) return;
      if (typeof data.username === "string" && data.username) {
        setUsername(data.username);
        localStorage.setItem("mchost_user", data.username);
      }
      applyProfilePayload(setCanHost, setIsAdmin, data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("mchost_token");
    if (!stored) {
      setAuthChecked(true);
      return;
    }

    const invalidate = () => {
      setToken(null);
      setUsername(null);
      setCanHost(false);
      setIsAdmin(false);
      clearStoredSession();
    };

    fetch(`${API_URL}/api/auth/validate`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          invalidate();
          return;
        }
        try {
          const data = (await res.json()) as {
            valid?: boolean;
            username?: string;
            canHost?: boolean;
            isAdmin?: boolean;
          };
          if (!data?.valid) {
            invalidate();
            return;
          }
          if (typeof data.username === "string" && data.username) {
            setUsername(data.username);
            localStorage.setItem("mchost_user", data.username);
          }
          applyProfilePayload(setCanHost, setIsAdmin, data);
        } catch {
          invalidate();
        }
      })
      .catch(() => {
        invalidate();
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const login = async (user: string, password: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password }),
      });
      const text = await res.text();
      let data: { token?: string; username?: string; error?: string } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        return {
          success: false,
          error:
            "A API não devolveu JSON (geralmente página de erro do proxy). Confira Nginx/Caddy: /api e /ws devem ir para o Node na porta do backend.",
        };
      }
      if (data.token) {
        setToken(data.token);
        setUsername(data.username);
        localStorage.setItem("mchost_token", data.token);
        localStorage.setItem("mchost_user", data.username);
        applyProfilePayload(setCanHost, setIsAdmin, data);
        return { success: true };
      }
      return { success: false, error: data.error || `Login recusado (HTTP ${res.status})` };
    } catch (e) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const healthCheck = API_URL === "" ? `${origin}/api/health` : `${API_URL}/api/health`;
      const target = API_URL === "" ? `${origin}/api (proxy obrigatório)` : API_URL;
      const hint =
        e instanceof TypeError
          ? `Sem resposta da API (${target}). Abra: ${healthCheck} — deve aparecer {"ok":true}. Se falhar: SSL do domínio, proxy /api e /ws no Nginx até o Node, ou backend parado.`
          : `Erro de rede: ${e instanceof Error ? e.message : String(e)}`;
      return { success: false, error: hint };
    }
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    setCanHost(false);
    setIsAdmin(false);
    clearStoredSession();
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) return { success: true };
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: "Erro de conexão" };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        username,
        isAuthenticated: !!token,
        isLoading: !authChecked,
        canHost,
        isAdmin,
        login,
        logout,
        changePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

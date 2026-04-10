import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { API_URL } from "@/lib/api";

interface AuthContextType {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("mchost_token"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("mchost_user"));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Validate token on mount
    if (token) {
      fetch(`${API_URL}/api/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) {
            setToken(null);
            setUsername(null);
            localStorage.removeItem("mchost_token");
            localStorage.removeItem("mchost_user");
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (user: string, password: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setUsername(data.username);
        localStorage.setItem("mchost_token", data.token);
        localStorage.setItem("mchost_user", data.username);
        return { success: true };
      }
      return { success: false, error: data.error || "Erro ao fazer login" };
    } catch {
      return { success: false, error: "Erro de conexão com o servidor" };
    }
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem("mchost_token");
    localStorage.removeItem("mchost_user");
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
        isLoading,
        login,
        logout,
        changePassword,
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

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, User, Gamepad2, Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || "Erro ao fazer login");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,128,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,128,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,128,0.08)_0%,transparent_70%)]" />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30 mb-4 shadow-[0_0_30px_rgba(0,255,128,0.15)]">
            <Gamepad2 className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">MCHost</h1>
          <p className="text-muted-foreground text-sm mt-1">Painel de Controle Minecraft</p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-8 shadow-[0_0_50px_rgba(0,0,0,0.3)]">
          <h2 className="text-xl font-semibold text-foreground mb-6 text-center">Entrar no Painel</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Usuário</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 font-semibold text-sm gap-2" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Acesso restrito ao administrador do servidor.
          </p>
        </div>
      </div>
    </div>
  );
}

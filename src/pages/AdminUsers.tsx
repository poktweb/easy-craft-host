import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiAdminListUsers, apiAdminSetCanHost, type AdminUserRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminUsers() {
  const { username, isAdmin } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiAdminListUsers();
      if (Array.isArray(list)) setRows(list);
      else setRows([]);
    } catch {
      toast.error("Não foi possível carregar usuários");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function toggleCanHost(u: AdminUserRow, next: boolean) {
    if (u.isAdmin) return;
    setPendingId(u.id);
    try {
      const res = await apiAdminSetCanHost(u.id, next);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? "Acesso à hospedagem ativado" : "Acesso à hospedagem removido");
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, canHost: next } : r)));
    } catch {
      toast.error("Falha ao atualizar");
    } finally {
      setPendingId(null);
    }
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Instâncias
              </Link>
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 border border-primary/30">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground">Usuários</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{username}</span>
          </div>
        </div>
      </header>

      <main className="container py-10 max-w-2xl">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Liberar hospedagem</CardTitle>
            <CardDescription>
              Somente o administrador vê esta página. Com a opção ativa, o usuário pode ver, criar e gerenciar apenas as próprias instâncias (sem acesso às de outras contas).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
                {rows.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-card/40">
                    <div>
                      <p className="font-medium text-foreground">{u.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.isAdmin ? "Administrador — sempre pode hospedar" : `ID ${u.id}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">Hospedagem</span>
                      <Switch
                        checked={u.canHost}
                        disabled={u.isAdmin || pendingId === u.id}
                        onCheckedChange={(v) => toggleCanHost(u, v)}
                        aria-label={`Permitir ${u.username} usar hospedagem`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

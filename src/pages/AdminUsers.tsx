import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiAdminListUsers, apiAdminSetCanHost, apiAdminSetUserQuota, type AdminUserRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type QuotaDraft = { ram: string; inst: string };

export default function AdminUsers() {
  const { username, isAdmin } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, QuotaDraft>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingQuotaId, setPendingQuotaId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiAdminListUsers();
      if (Array.isArray(list)) {
        setRows(list);
        const d: Record<number, QuotaDraft> = {};
        for (const u of list) {
          if (u.isAdmin) continue;
          d[u.id] = {
            ram: String(u.quotaMaxRamMb != null ? u.quotaMaxRamMb : (u.effectiveMaxRamMb ?? 2048)),
            inst: String(u.quotaMaxInstances != null ? u.quotaMaxInstances : (u.effectiveMaxInstances ?? 5)),
          };
        }
        setDrafts(d);
      } else {
        setRows([]);
        setDrafts({});
      }
    } catch {
      toast.error("Não foi possível carregar usuários");
      setRows([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
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

  async function saveQuotas(u: AdminUserRow) {
    const d = drafts[u.id];
    if (!d) return;
    const ram = parseInt(d.ram, 10);
    const inst = parseInt(d.inst, 10);
    if (!Number.isFinite(ram) || ram < 256) {
      toast.error("RAM máxima por instância: use um número ≥ 256 (MB)");
      return;
    }
    if (!Number.isFinite(inst) || inst < 1) {
      toast.error("Instâncias: use um número ≥ 1");
      return;
    }
    setPendingQuotaId(u.id);
    try {
      const res = await apiAdminSetUserQuota(u.id, { quotaMaxRamMb: ram, quotaMaxInstances: inst });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Cotas atualizadas");
      await load();
    } catch {
      toast.error("Falha ao salvar cotas");
    } finally {
      setPendingQuotaId(null);
    }
  }

  async function resetQuotas(u: AdminUserRow) {
    setPendingQuotaId(u.id);
    try {
      const res = await apiAdminSetUserQuota(u.id, { quotaMaxRamMb: null, quotaMaxInstances: null });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Cotas restauradas ao padrão do servidor");
      await load();
    } catch {
      toast.error("Falha ao restaurar cotas");
    } finally {
      setPendingQuotaId(null);
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

      <main className="container py-10 max-w-3xl">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Liberar hospedagem e cotas</CardTitle>
            <CardDescription>
              Com a hospedagem ativa, o usuário gerencia só as próprias instâncias. Defina a RAM máxima por instância (MB) e quantas instâncias ele pode criar. O botão Padrão do servidor remove a cota
              personalizada e volta a usar as variáveis <code className="text-xs">MC_MAX_RAM</code> e <code className="text-xs">MC_USER_DEFAULT_MAX_INSTANCES</code>.
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
                  <li key={u.id} className="px-4 py-4 bg-card/40 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{u.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.isAdmin
                            ? "Administrador — sem limite de cota"
                            : `ID ${u.id} · instâncias: ${u.instanceCount ?? 0} / ${u.effectiveMaxInstances ?? "—"}`}
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
                    </div>

                    {!u.isAdmin && (
                      <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Efetivo hoje: até <span className="font-medium text-foreground">{u.effectiveMaxRamMb ?? "—"} MB</span> por instância · máx.{" "}
                          <span className="font-medium text-foreground">{u.effectiveMaxInstances ?? "—"}</span> instâncias
                          {u.quotaMaxRamMb == null && u.quotaMaxInstances == null ? (
                            <span> (herdado do padrão do servidor)</span>
                          ) : null}
                        </p>
                        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
                          <div className="space-y-1 flex-1 min-w-[140px]">
                            <label className="text-xs font-medium text-foreground">RAM máx. / instância (MB)</label>
                            <Input
                              type="number"
                              min={256}
                              value={drafts[u.id]?.ram ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: { ram: e.target.value, inst: prev[u.id]?.inst ?? "" },
                                }))
                              }
                              disabled={pendingQuotaId === u.id}
                            />
                          </div>
                          <div className="space-y-1 flex-1 min-w-[120px]">
                            <label className="text-xs font-medium text-foreground">Máx. instâncias</label>
                            <Input
                              type="number"
                              min={1}
                              max={999}
                              value={drafts[u.id]?.inst ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: { ram: prev[u.id]?.ram ?? "", inst: e.target.value },
                                }))
                              }
                              disabled={pendingQuotaId === u.id}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => saveQuotas(u)} disabled={pendingQuotaId === u.id}>
                              {pendingQuotaId === u.id ? "Salvando…" : "Salvar cotas"}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => resetQuotas(u)} disabled={pendingQuotaId === u.id}>
                              Padrão do servidor
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
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

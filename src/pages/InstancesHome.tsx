import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Server, ArrowRight, LogOut, Shield, Users, AlertCircle, Copy, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiCreateInstance, apiDeleteInstance, apiListInstances, type HostingQuotaInfo, type InstanceSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function canDeleteInstance(inst: InstanceSummary) {
  return inst.id !== "default" && inst.mode !== "legacy";
}

export default function InstancesHome() {
  const navigate = useNavigate();
  const { username, logout, canHost, isAdmin, refreshProfile } = useAuth();
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [hosting, setHosting] = useState<HostingQuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InstanceSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListInstances();
      setInstances(data.instances);
      setHosting(data.hosting ?? null);
    } catch {
      toast.error("Não foi possível carregar as instâncias");
      setInstances([]);
      setHosting(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  async function confirmDeleteInstance() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDeleteInstance(deleteTarget.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Instância excluída");
      setDeleteTarget(null);
      await refresh();
    } catch {
      toast.error("Falha ao excluir instância");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await apiCreateInstance(newName.trim() || "Novo servidor");
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Instância criada");
      setNewName("");
      await refresh();
      if (res.id) navigate(`/instance/${res.id}`);
    } catch {
      toast.error("Falha ao criar instância");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 border border-primary/30">
              <span className="text-lg font-bold text-primary">MC</span>
            </div>
            <span className="text-lg font-bold text-foreground">pokt Craft</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to="/admin/usuarios">
                  <Users className="h-4 w-4" />
                  Usuários
                </Link>
              </Button>
            )}
            <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{username}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suas instâncias</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cada conta vê apenas as próprias instâncias (dados isolados). O endereço para jogadores usa o IP público e a porta da instância.
          </p>
        </div>

        {!canHost && (
          <Alert className="max-w-2xl border-amber-500/30 bg-amber-500/5">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Conta sem acesso à hospedagem</AlertTitle>
            <AlertDescription>
              Você não pode ver nem abrir instâncias até o administrador liberar sua conta. Depois da liberação, só aparecem servidores criados por você.
              {isAdmin ? (
                <span>
                  {" "}
                  Você pode gerenciar isso em{" "}
                  <Link to="/admin/usuarios" className="text-primary font-medium underline underline-offset-2">
                    Usuários
                  </Link>
                  .
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        {canHost && hosting && (
          <p className="text-sm text-muted-foreground max-w-xl">
            Cota: até <span className="font-medium text-foreground">{hosting.maxRamMbPerInstance} MB</span> de RAM por instância ·{" "}
            <span className="font-medium text-foreground">
              {hosting.instanceCount}/{hosting.maxInstances}
            </span>{" "}
            instâncias
          </p>
        )}

        <div className="flex flex-wrap gap-3 items-end max-w-xl">
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-sm font-medium text-foreground">Nova instância</label>
            <Input
              placeholder="Nome (ex.: Survival, Creative)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={!canHost}
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={
              creating ||
              !canHost ||
              !!(hosting && hosting.instanceCount >= hosting.maxInstances)
            }
            className="gap-2"
            title={
              !canHost
                ? "Aguardando liberação do administrador"
                : hosting && hosting.instanceCount >= hosting.maxInstances
                  ? "Limite de instâncias atingido"
                  : undefined
            }
          >
            <Plus className="h-4 w-4" />
            {creating ? "Criando…" : "Criar"}
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {instances.map((inst) => (
              <Card
                key={inst.id}
                className="border-border/60 hover:border-primary/40 transition-colors cursor-pointer group"
                onClick={() => navigate(`/instance/${inst.id}`)}
              >
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Server className="h-5 w-5 text-primary shrink-0" />
                      <span className="font-semibold text-foreground truncate">{inst.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canDeleteInstance(inst) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Excluir instância"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(inst);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          inst.status === "running"
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {inst.status === "running" ? "Online" : "Parado"}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1.5">
                    <p className="font-mono">ID: {inst.id}</p>
                    {inst.connectAddress ? (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-left w-full rounded-md border border-border/60 bg-background/50 px-2 py-1.5 font-mono text-primary hover:bg-primary/5 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard.writeText(inst.connectAddress!);
                          toast.success("IP copiado");
                        }}
                      >
                        <span className="truncate flex-1">{inst.connectAddress}</span>
                        <Copy className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      </button>
                    ) : inst.serverPort != null ? (
                      <p className="font-mono">Porta: {inst.serverPort}</p>
                    ) : null}
                  </div>
                  <Button variant="secondary" size="sm" className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground">
                    Abrir painel
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir instância?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget ? (
                  <>
                    A instância <span className="font-medium text-foreground">{deleteTarget.name}</span> (
                    <span className="font-mono text-xs">{deleteTarget.id}</span>) será removida permanentemente, incluindo
                    arquivos e mundos. Esta ação não pode ser desfeita. O servidor precisa estar parado.
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" disabled={deleting} onClick={() => void confirmDeleteInstance()}>
                {deleting ? "Excluindo…" : "Excluir"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

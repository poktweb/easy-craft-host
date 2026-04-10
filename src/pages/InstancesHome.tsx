import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Server, ArrowRight, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiCreateInstance, apiListInstances } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export interface InstanceSummary {
  id: string;
  name: string;
  mode?: string;
  status?: string;
  serverPort?: number;
}

export default function InstancesHome() {
  const navigate = useNavigate();
  const { username, logout } = useAuth();
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiListInstances();
      if (Array.isArray(list)) setInstances(list);
      else setInstances([]);
    } catch {
      toast.error("Não foi possível carregar as instâncias");
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
            <span className="text-lg font-bold text-foreground">MCHost</span>
          </div>
          <div className="flex items-center gap-3">
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
            Cada instância tem pasta, console, backups e configurações separados. Entre em uma para gerenciar.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end max-w-xl">
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-sm font-medium text-foreground">Nova instância</label>
            <Input
              placeholder="Nome (ex.: Survival, Creative)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button onClick={handleCreate} disabled={creating} className="gap-2">
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
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-primary" />
                      <span className="font-semibold text-foreground">{inst.name}</span>
                    </div>
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
                  <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                    <p>ID: {inst.id}</p>
                    {inst.serverPort != null && <p>Porta do jogo: {inst.serverPort}</p>}
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
      </main>
    </div>
  );
}

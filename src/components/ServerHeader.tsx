import { Power, RefreshCw, Play, Copy, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServerStatus, ServerStats } from "@/hooks/useServerState";
import { toast } from "sonner";

interface Props {
  status: ServerStatus;
  stats: ServerStats;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}H ${String(m).padStart(2, "0")}M ${String(s).padStart(2, "0")}S`;
}

export default function ServerHeader({ status, stats, onStart, onStop, onRestart }: Props) {
  const isRunning = status === "running";
  const isLoading = status === "starting" || status === "stopping";
  const ip = "enx-ext-7.enx.host:10102";

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 glow-primary">
          <Server className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Servidor SMP+</h1>
          <button
            className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            onClick={() => { navigator.clipboard.writeText(ip); toast.success("IP copiado!"); }}
          >
            IP: <span className="font-mono text-primary/80">{ip}</span> <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-card/80 px-2 py-1.5">
          <Button variant="ghost" size="sm" onClick={onStop} disabled={!isRunning || isLoading}
            className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Power className="h-4 w-4" /> Desligar
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart} disabled={!isRunning || isLoading}
            className="gap-2 text-muted-foreground hover:text-warning hover:bg-warning/10">
            <RefreshCw className="h-4 w-4" /> Reiniciar
          </Button>
          <Button variant="ghost" size="sm" onClick={onStart} disabled={isRunning || isLoading}
            className="gap-2 text-primary hover:bg-primary/10">
            <Play className="h-4 w-4" /> Iniciar
          </Button>
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/5 px-4 py-2.5 text-sm font-semibold text-success">
            <span className="h-2.5 w-2.5 rounded-full bg-success animate-pulse-green" />
            ONLINE ({formatUptime(stats.uptime)})
          </div>
        )}
        {status === "stopped" && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            OFFLINE
          </div>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm font-semibold text-warning">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {status === "starting" ? "INICIANDO..." : "PARANDO..."}
          </div>
        )}
      </div>
    </div>
  );
}

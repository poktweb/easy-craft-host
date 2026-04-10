import { useRef, useEffect, useState } from "react";
import { Cpu, MemoryStick, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { LogEntry, ServerStats, ServerStatus } from "@/hooks/useServerState";

interface Props {
  logs: LogEntry[];
  stats: ServerStats;
  status: ServerStatus;
  onSendCommand: (cmd: string) => void;
}

function CpuChart({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Uso de CPU</h3>
      </div>
      <div className="space-y-2">
        {[max, Math.round(max * 0.66), Math.round(max * 0.33), 0].map(v => (
          <div key={v} className="flex items-center gap-3">
            <span className="w-12 text-right text-xs text-muted-foreground">{v}%</span>
            <div className="h-0.5 flex-1 bg-border relative">
              {v <= value && <div className="absolute inset-y-0 left-0 bg-warning" style={{ width: `${pct}%` }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RamChart({ value }: { value: number }) {
  const maxMb = 3500;
  const valueMb = value * 1024;
  const pct = Math.min(100, (valueMb / maxMb) * 100);
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <MemoryStick className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Uso de Memória RAM</h3>
      </div>
      <div className="space-y-2">
        {[3500, 2333, 1167, 0].map(v => (
          <div key={v} className="flex items-center gap-3">
            <span className="w-16 text-right text-xs text-muted-foreground">{v}MB</span>
            <div className="h-0.5 flex-1 bg-border relative">
              {v <= valueMb && <div className="absolute inset-y-0 left-0 bg-warning" style={{ width: `${pct}%` }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ServerConsole({ logs, stats, status, onSendCommand }: Props) {
  const [command, setCommand] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    onSendCommand(command.startsWith("/") ? command : `/${command}`);
    setCommand("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4">
        <CpuChart value={stats.cpu} max={stats.maxCpu} />
        <RamChart value={stats.ram} />
      </div>

      <div className="flex h-[500px] flex-col rounded-xl overflow-hidden border">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-scroll p-4 font-mono text-sm console-scrollbar bg-console text-console-text"
        >
          {logs.map(log => (
            <div key={log.id} className="leading-relaxed">
              <span className="text-muted-foreground">[{log.timestamp}]</span>{" "}
              <span className={
                log.level === "WARN" ? "text-warning" :
                log.level === "ERROR" ? "text-destructive" :
                "text-console-fg"
              }>
                [Server thread/{log.level}]
              </span>
              : {log.message}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-muted-foreground italic">
              {status === "stopped" ? "Servidor offline. Clique em Iniciar para começar." : "Carregando..."}
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex border-t bg-console">
          <span className="flex items-center px-3 text-muted-foreground font-mono text-sm">{">"}</span>
          <Input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="Digite um comando..."
            disabled={status !== "running"}
            className="flex-1 border-0 bg-transparent font-mono text-sm text-console-text focus-visible:ring-0 rounded-none"
          />
          <button type="submit" className="px-4 text-primary hover:text-primary/80 transition-colors" disabled={status !== "running"}>
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

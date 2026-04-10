import { Cpu, MemoryStick, HardDrive, Users } from "lucide-react";
import type { ServerStats as Stats } from "@/hooks/useServerState";

interface Props {
  stats: Stats;
}

export default function ServerStatsBar({ stats }: Props) {
  const items = [
    { icon: Cpu, label: "CPU", value: `${Math.round(stats.cpu)}%`, sub: `/ ${stats.maxCpu}%`, pct: (stats.cpu / stats.maxCpu) * 100, color: "primary" as const },
    { icon: MemoryStick, label: "RAM", value: `${stats.ram.toFixed(2)} GB`, sub: "", pct: (stats.ram / 3.5) * 100, color: "primary" as const },
    { icon: HardDrive, label: "DISCO", value: `${stats.storage.toFixed(0)} MB`, sub: `/ ${stats.maxStorage}`, pct: Math.min(100, stats.storage / 10240 * 100), color: "primary" as const },
    { icon: Users, label: "PLAYERS", value: `${stats.players}`, sub: `/ ${stats.maxPlayers}`, pct: stats.maxPlayers > 0 ? (stats.players / stats.maxPlayers) * 100 : 0, color: "primary" as const },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map(({ icon: Icon, label, value, sub, pct }) => (
        <div key={label} className="rounded-xl border border-border/50 bg-card/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold tracking-widest text-muted-foreground">{label}</span>
          </div>
          <p className="text-xl font-bold text-foreground mb-2">
            {value} <span className="text-xs font-normal text-muted-foreground">{sub}</span>
          </p>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

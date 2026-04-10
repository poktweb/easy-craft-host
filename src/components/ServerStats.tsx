import { Cpu, MemoryStick, HardDrive, Users } from "lucide-react";
import type { ServerStats as Stats } from "@/hooks/useServerState";

interface Props {
  stats: Stats;
}

export default function ServerStatsBar({ stats }: Props) {
  const items = [
    { icon: Cpu, label: "USO DE CPU", value: `${Math.round(stats.cpu)}%`, sub: `/ ${stats.maxCpu}%` },
    { icon: MemoryStick, label: "USO DE RAM", value: `${stats.ram.toFixed(2)} GB`, sub: "" },
    { icon: HardDrive, label: "ARMAZENAMENTO", value: `${stats.storage.toFixed(2)} MB`, sub: `/ ${stats.maxStorage}` },
    { icon: Users, label: "JOGADORES", value: `${stats.players}`, sub: `/ ${stats.maxPlayers}` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground">
              {value} <span className="text-sm font-normal text-muted-foreground">{sub}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
